// electron/localFolderLocate.cjs
// 本地曲库只记住相对路径（`A`、`A/B`），渲染进程用 File System Access API 拿到的目录句柄
// 不含磁盘路径，主进程因此不知道歌单在磁盘哪儿。「打开此文件夹」若每次都弹目录选择框，
// 点一下要先选一次位置，体验很差；这里在常见位置按「目录名 + 子路径」找一遍，
// 唯一命中就直接用，找不到或有歧义才回落到让用户指认。
//
// 判定比单纯的同名严格：候选目录下还必须存在这张卡片的子路径（`A/B` 里的 `B`），
// 所以「下载」下恰好有个同名空目录不会被误认。

const fs = require('fs');
const path = require('path');

// 系统/工具目录不参与搜索：既慢，也不可能放用户导入的歌单。
const SKIPPED_DIRECTORY_NAMES = new Set([
  'windows', 'program files', 'program files (x86)', 'programdata', 'recovery', 'perflogs',
  'system volume information', '$recycle.bin', 'config.msi', 'windows.old',
  'appdata', 'node_modules', '.git', '.svn', '.cache', 'temp', 'tmp',
]);

const MAX_MATCHES = 8;
// 放宽到「几乎总能扫完」，但真碰到塞满几十万目录的数据盘也不能卡住界面：
// 到量就收手，多半仍然能拿到唯一命中（同名的目录很少散落在极深处）。
const MAX_VISITED_DIRECTORIES = 4000;
const TIME_BUDGET_MS = 1500;

const listChildDirectories = async (dir) => {
  try {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
    return entries.filter(entry => entry.isDirectory() || entry.isSymbolicLink());
  } catch {
    return [];
  }
};

const isDirectory = async (candidate) => {
  try {
    return (await fs.promises.stat(candidate)).isDirectory();
  } catch {
    return false;
  }
};

const realPathKey = async (candidate) => {
  try {
    return await fs.promises.realpath(candidate);
  } catch {
    return candidate;
  }
};

// 同名目录不止一个时用来消歧：真正的曲库目录里总得有几首音频文件（直接放或在下面一层）。
const AUDIO_EXTENSIONS = new Set([
  '.mp3', '.flac', '.m4a', '.aac', '.ogg', '.opus', '.wav', '.wma', '.ape', '.aiff', '.aif', '.dsf', '.dff',
]);

const containsAudio = async (dir, depth) => {
  if (depth < 0) return false;
  let entries;
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch {
    return false;
  }
  const subdirectories = [];
  for (const entry of entries) {
    if (entry.isFile() && AUDIO_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) return true;
    if (entry.isDirectory() && !entry.name.startsWith('.')) subdirectories.push(path.join(dir, entry.name));
  }
  for (const subdirectory of subdirectories) {
    if (await containsAudio(subdirectory, depth - 1)) return true;
  }
  return false;
};

/**
 * 在 candidateRoots 下按广度优先找名为 rootName 的目录，且要求 `rootName/tail` 是真实目录。
 * 起点自身算第 0 层，所以 maxDepth = 3 能覆盖 `D:\CloudMusic\MyMusic\A` 这种三层结构。
 * 返回绝对路径数组（去重）；超过 maxMatches 就停下——调用方只关心「唯一」还是「不唯一」。
 */
const locateImportedFolderOnDisk = async (rootName, tail = [], candidateRoots = [], options = {}) => {
  const wanted = String(rootName ?? '').trim().toLowerCase();
  if (!wanted) return [];
  const segments = Array.isArray(tail) ? tail.filter(segment => typeof segment === 'string' && segment) : [];
  const maxDepth = Number.isInteger(options.maxDepth) ? options.maxDepth : 3;
  const maxMatches = Number.isInteger(options.maxMatches) ? options.maxMatches : MAX_MATCHES;
  const maxDirectories = Number.isInteger(options.maxDirectories) ? options.maxDirectories : MAX_VISITED_DIRECTORIES;
  const timeBudgetMs = Number.isInteger(options.timeBudgetMs) ? options.timeBudgetMs : TIME_BUDGET_MS;
  const startedAt = Date.now();

  const matches = [];
  const seen = new Set();
  const queue = [];
  const enqueue = (dir, depth) => {
    if (typeof dir !== 'string' || !dir) return;
    queue.push({ dir, depth });
  };
  for (const root of candidateRoots) enqueue(root, 0);
  let visited = 0;

  while (queue.length > 0 && matches.length < maxMatches) {
    if (visited >= maxDirectories || Date.now() - startedAt > timeBudgetMs) break;
    const { dir, depth } = queue.shift();
    if (depth > maxDepth) continue;
    visited += 1;
    const children = await listChildDirectories(dir);
    for (const child of children) {
      const childDepth = depth + 1;
      if (childDepth > maxDepth) continue;
      const childPath = path.join(dir, child.name);
      if (child.name.toLowerCase() === wanted) {
        // 同名目录不再向下钻：导入根不会嵌在另一个同名根里，继续走只会拖长时间。
        if (!(await isDirectory(path.join(childPath, ...segments)))) continue;
        const key = await realPathKey(childPath);
        if (seen.has(key)) continue;
        seen.add(key);
        matches.push(childPath);
        if (matches.length >= maxMatches) break;
        continue;
      }
      // 隐藏目录基本是缓存与配置，扫它们只会拖慢。
      if (child.name.startsWith('.') || SKIPPED_DIRECTORY_NAMES.has(child.name.toLowerCase())) continue;
      enqueue(childPath, childDepth);
    }
  }

  // 同名目录不止一个时，只看得住音频的那几个：别的多半是同名的空文件夹或别的用途。
  if (matches.length > 1) {
    const withAudio = [];
    for (const match of matches) {
      if (await containsAudio(match, 1)) withAudio.push(match);
    }
    if (withAudio.length > 0) return withAudio;
  }

  return matches;
};

module.exports = { locateImportedFolderOnDisk };
