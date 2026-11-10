// src/services/localFolderSystemOpen.ts
// 本地歌单右键「打开此文件夹」的渲染端入口。曲库里只有相对路径（`A/B/C`），磁盘绝对路径
// 由主进程按导入根名 `A` 记住（第一次调用时请用户选一次），并且打开的是目标目录本身，
// 不是它的父目录（showItemInFolder 的语义）。网页版没有 preload，直接降级。

import { localFolderRootName, normalizeLocalFolderPath } from '../utils/localFolderPaths';

export type LocalFolderRevealReason = 'cancelled' | 'missing' | 'invalid' | 'desktop-only';

export interface LocalFolderRevealResult {
    ok: boolean;
    reason?: LocalFolderRevealReason;
}

/**
 * 用系统文件管理器打开这张歌单对应的目录（进入目录内部）。
 * `rebind` 为真时忽略已记住的磁盘根目录，重新让用户选一次（目录被移动 / 换盘 / 选错父目录后用）。
 */
export const revealLocalFolderInSystem = async (
    folderPath: string,
    rebind = false,
): Promise<LocalFolderRevealResult> => {
    const normalizedPath = normalizeLocalFolderPath(folderPath);
    const rootName = localFolderRootName(normalizedPath);
    if (!normalizedPath || !rootName) return { ok: false, reason: 'invalid' };

    const reveal = window.electron?.openLocalFolderInSystem;
    if (!reveal) return { ok: false, reason: 'desktop-only' };

    try {
        return await reveal(rootName, normalizedPath, rebind);
    } catch (error) {
        console.warn('[LocalMusic] could not reveal folder in system', error);
        return { ok: false, reason: 'invalid' };
    }
};
