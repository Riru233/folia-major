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

// 目录选择框常默认停在「下载」，用户很容易直接确认，把父目录当成导入根存下来。
// 用目标相对路径反推：只有「根 + 相对路径」真的落到存在的目录，才承认这个根。
// `tail` 是去掉根名后的相对片段（`A/B` → ['B']）；返回真正该当导入根用的绝对路径。
const resolveImportedFolderRoot = (basePath, rootName, tail) => {
  if (typeof basePath !== 'string' || !basePath.trim()) return null;
  const base = path.resolve(basePath.trim());
  const nameMatches = path.basename(base).toLowerCase() === rootName.toLowerCase();
  // 1) 选中的就是导入根：目录名对得上，且目标子目录存在。
  if (nameMatches && isDirectory(path.join(base, ...tail))) return base;
  // 2) 选中的是导入根的父目录（例如「下载」）：补一层根名再验证。
  const nested = path.join(base, rootName);
  if (isDirectory(path.join(nested, ...tail))) return nested;
  // 3) 导入后被改过名，但目标相对路径确实就在选中目录下。tail 为空时没有任何可验证的
  //    线索，不能再兜底，否则「下载」这种随便选的目录又会被当成根。
  if (tail.length > 0 && isDirectory(path.join(base, ...tail))) return base;
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
