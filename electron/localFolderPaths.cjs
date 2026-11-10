// electron/localFolderPaths.cjs
// 本地目录卡片只带相对路径（`A`、`A/B`），这里负责把它解析成磁盘上的绝对目录。
// 刻意与 electron-store / IPC / BrowserWindow 解耦，好让「用户把父目录（如「下载」）当成
// 导入根」这类历史坑能被单测覆盖，而不用启动 Electron。

const fs = require('fs');
const path = require('path');

// 导入根名来自渲染端，又直接当 store 映射的键：原型链上的名字一律拒绝，免得 `__proto__`
// 之类的键污染映射，或让查出来的值根本不是字符串。
const UNSAFE_LOCAL_FOLDER_ROOT_NAMES = new Set(['__proto__', 'constructor', 'prototype']);
const isSafeLocalFolderRootName = (value) => (
  typeof value === 'string'
  && Boolean(value.trim())
  && !/[\\/]/.test(value)
  && value !== '.' && value !== '..'
  && !UNSAFE_LOCAL_FOLDER_ROOT_NAMES.has(value)
);

const isDirectory = (candidate) => {
  try {
    return fs.existsSync(candidate) && fs.statSync(candidate).isDirectory();
  } catch {
    return false;
  }
};

// A root name is one folder name, never a path: this is what keeps a crafted card path from
// escaping the directory the listener chose. `relativePath` must start with that same root.
const parseLocalFolderRequest = (rootName, relativePath) => {
  const normalizedRoot = typeof rootName === 'string' ? rootName.trim() : '';
  const parts = (typeof relativePath === 'string' ? relativePath : '')
    .replace(/\\/g, '/').split('/').filter(Boolean);
  if (!isSafeLocalFolderRootName(normalizedRoot)) return null;
  if (parts.length === 0 || parts[0] !== normalizedRoot) return null;
  if (parts.some(part => part === '.' || part === '..')) return null;
  return { rootName: normalizedRoot, tail: parts.slice(1) };
};

// 区分大小写的文件系统上，按实际目录名找同名的子目录（`Music` / `music`）。
const findChildDirectory = (base, name) => {
  const direct = path.join(base, name);
  if (isDirectory(direct)) return direct;
  try {
    const match = fs.readdirSync(base, { withFileTypes: true })
      .find(entry => entry.isDirectory() && entry.name.toLowerCase() === name.toLowerCase());
    return match ? path.join(base, match.name) : null;
  } catch {
    return null;
  }
};

// 目录选择框常默认停在「下载」，用户很容易直接确认，把父目录当成导入根存下来。
// 只接受两种解释，且都必须让「根 + 相对路径」落到真实存在的目录：
//   1) 选中的就是导入根本身（目录名对得上）；
//   2) 选中的是导入根的父目录（下面有与根同名的子目录）。
// 刻意不做「base 下恰好有同名子路径」的兜底：任意目录下都可能碰巧有 `Rock` 这种名字，
// 那会把「下载」之类无关目录写成导入根，正是这次要修的 bug。磁盘上改过名的目录请走
// 右键菜单的「重新指定文件夹位置」，由用户明确指定，不自动猜。
// `tail` 是去掉根名后的相对片段（`A/B` → ['B']）；返回真正该当导入根用的绝对路径。
const resolveImportedFolderRoot = (basePath, rootName, tail) => {
  if (typeof basePath !== 'string' || !basePath.trim()) return null;
  const base = path.resolve(basePath.trim());
  const nameMatches = path.basename(base).toLowerCase() === rootName.toLowerCase();
  if (nameMatches && isDirectory(path.join(base, ...tail))) return base;
  const nested = findChildDirectory(base, rootName);
  if (nested && isDirectory(path.join(nested, ...tail))) return nested;
  return null;
};

// `savedRoot` 是 electron-store 里按根名记住的磁盘目录；返回 { root, resolved, savedRoot }，
// `root` 可能与 `savedRoot` 不同（旧错误映射自愈），调用方应把新值写回 store。
const resolveLocalFolderDiskPath = (savedRoot, rootName, relativePath) => {
  const parsed = parseLocalFolderRequest(rootName, relativePath);
  if (!parsed) return null;
  const root = resolveImportedFolderRoot(savedRoot, parsed.rootName, parsed.tail);
  if (!root) return null;
  const resolved = path.resolve(root, ...parsed.tail);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) return null;
  return {
    root,
    resolved,
    savedRoot: typeof savedRoot === 'string' ? savedRoot : '',
  };
};

module.exports = {
  isSafeLocalFolderRootName,
  isDirectory,
  parseLocalFolderRequest,
  resolveImportedFolderRoot,
  resolveLocalFolderDiskPath,
};
