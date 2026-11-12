import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// 主进程 CJS 路径规则不加载 Electron，直接用 createRequire 验证真实磁盘目录结构。
const require = createRequire(import.meta.url);
const {
    isSafeLocalFolderRootName,
    parseLocalFolderRequest,
    resolveImportedFolderRoot,
    resolveLocalFolderDiskPath,
} = require('../../../../electron/localFolderPaths.cjs') as {
    isSafeLocalFolderRootName: (value: unknown) => boolean;
    parseLocalFolderRequest: (rootName: unknown, relativePath: unknown) => { rootName: string; tail: string[] } | null;
    resolveImportedFolderRoot: (basePath: unknown, rootName: string, tail: string[]) => string | null;
    resolveLocalFolderDiskPath: (
        savedRoot: unknown, rootName: string, relativePath: string,
    ) => { root: string; resolved: string; savedRoot: string } | null;
};

describe('本地歌单磁盘根目录解析', () => {
    let base: string;
    let downloads: string;
    let music: string;
    let rock: string;
    let empty: string;
    let other: string;

    beforeAll(() => {
        base = fs.mkdtempSync(path.join(os.tmpdir(), 'folia-folder-roots-'));
        downloads = path.join(base, 'Downloads');
        music = path.join(downloads, 'Music');
        rock = path.join(music, 'Rock');
        empty = path.join(base, 'Empty');
        // 一个完全无关的目录，但下面碰巧也有名为 Rock 的子目录。
        other = path.join(base, 'Other');
        fs.mkdirSync(rock, { recursive: true });
        fs.mkdirSync(empty, { recursive: true });
        fs.mkdirSync(path.join(other, 'Rock'), { recursive: true });
        fs.writeFileSync(path.join(rock, 'song.mp3'), 'x');
    });

    afterAll(() => fs.rmSync(base, { recursive: true, force: true }));

    it('映射指向导入根本体时，主歌单与子歌单都解析到目录本身', () => {
        expect(resolveLocalFolderDiskPath(music, 'Music', 'Music')?.resolved).toBe(music);
        const sub = resolveLocalFolderDiskPath(music, 'Music', 'Music/Rock');
        expect(sub?.root).toBe(music);
        expect(sub?.resolved).toBe(rock);
    });

    it('旧映射误把「下载」父目录当导入根时，子歌单自愈到真正的根', () => {
        const target = resolveLocalFolderDiskPath(downloads, 'Music', 'Music/Rock');
        expect(target?.savedRoot).toBe(downloads);
        expect(target?.root).toBe(music);
        expect(target?.resolved).toBe(rock);
    });

    it('旧映射误把父目录当导入根时，主歌单同样自愈（不再跳到父目录）', () => {
        const target = resolveLocalFolderDiskPath(downloads, 'Music', 'Music');
        expect(target?.root).toBe(music);
        expect(target?.resolved).toBe(music);
        expect(target?.resolved).not.toBe(downloads);
    });

    it('导入根本来就在下载目录下时，下钻到子目录而不是停在下载', () => {
        const target = resolveLocalFolderDiskPath(downloads, 'Downloads', 'Downloads/Music');
        expect(target?.resolved).toBe(music);
    });

    it('选了一个找不到歌单的目录时拒绝解析，不把错误位置写回', () => {
        expect(resolveLocalFolderDiskPath(empty, 'Music', 'Music')).toBeNull();
        expect(resolveLocalFolderDiskPath(empty, 'Music', 'Music/Rock')).toBeNull();
        expect(resolveLocalFolderDiskPath('', 'Music', 'Music')).toBeNull();
        expect(resolveLocalFolderDiskPath(rock, 'Music', 'Music/Rock/Rock')).toBeNull();
    });

    it('无关目录下碰巧有同名子目录时，不能被误认成导入根', () => {
        // 回归：旧逻辑只看「base/Rock 存在」，会把「下载」这类随便选的目录写成根。
        expect(resolveImportedFolderRoot(other, 'Music', ['Rock'])).toBeNull();
        expect(resolveLocalFolderDiskPath(other, 'Music', 'Music/Rock')).toBeNull();
        expect(resolveLocalFolderDiskPath(other, 'Music', 'Music')).toBeNull();
    });

    it('用户选父目录 / 选本体都能推出同一个导入根', () => {
        expect(resolveImportedFolderRoot(downloads, 'Music', ['Rock'])).toBe(music);
        expect(resolveImportedFolderRoot(music, 'Music', ['Rock'])).toBe(music);
        expect(resolveImportedFolderRoot(downloads, 'Music', [])).toBe(music);
        expect(resolveImportedFolderRoot(empty, 'Music', [])).toBeNull();
    });

    it('归一化反斜杠并容忍目录名大小写差异', () => {
        expect(resolveLocalFolderDiskPath(music, 'Music', 'Music\\Rock')?.resolved).toBe(rock);
        expect(resolveLocalFolderDiskPath(music, 'music', 'music/Rock')?.resolved).toBe(rock);
    });

    it('拒绝路径穿越、根名不匹配与原型键', () => {
        expect(parseLocalFolderRequest('Music', 'Music/../..')).toBeNull();
        expect(parseLocalFolderRequest('Music', 'Other/Rock')).toBeNull();
        expect(parseLocalFolderRequest('..', '../etc')).toBeNull();
        expect(parseLocalFolderRequest('__proto__', '__proto__')).toBeNull();
        expect(isSafeLocalFolderRootName('constructor')).toBe(false);
        expect(isSafeLocalFolderRootName('A/B')).toBe(false);
        expect(isSafeLocalFolderRootName('Music')).toBe(true);
        expect(resolveLocalFolderDiskPath(music, 'Music', 'Music/../../Downloads')).toBeNull();
    });

    it('主进程打开的是目录本体，而不是 showItemInFolder 的父目录（跳到「下载」的回归守卫）', () => {
        const mainPath = fileURLToPath(new URL('../../../../electron/main.cjs', import.meta.url));
        const source = fs.readFileSync(mainPath, 'utf8');
        const start = source.indexOf("ipcMain.handle('local-folder-reveal'");
        const end = source.indexOf("ipcMain.handle('updates-get-status'", start);
        expect(start).toBeGreaterThan(-1);
        expect(end).toBeGreaterThan(start);
        const handler = source.slice(start, end);
        expect(handler).toContain('shell.openPath(realTarget)');
        expect(handler).not.toContain('shell.showItemInFolder');
    });
});
