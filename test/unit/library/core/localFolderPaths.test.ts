import { describe, expect, it } from 'vitest';
import type { LocalSong } from '@/types';
import {
    collectDescendantFolderPaths,
    collectDirectChildFolderPaths,
    collectLocalFolderSongIds,
    expandLocalFolderPathPrefixes,
    isLocalRootFolder,
    isSameOrChildFolder,
    localFolderDepth,
    localFolderParentPath,
    localFolderRelativePath,
    localFolderRootName,
    normalizeLocalFolderPath,
    songFolderPath,
} from '@/utils/localFolderPaths';

// test/unit/library/core/localFolderPaths.test.ts
// 本地「歌单」= 导入文件夹扫描出来的目录卡片：主歌单 A、子歌单 A/B、A/B/C。
// 这里的规则决定右键删除的范围与子歌单的整理列表，所以删子不动主、删主清子必须锁住。

const song = (id: string, folderName: string): Pick<LocalSong, 'id' | 'folderName' | 'filePath'> => ({
    id,
    folderName,
    filePath: `${folderName}/${id}.mp3`,
});

const library = [
    song('root-1', 'A'),
    song('sub-1', 'A/B'),
    song('deep-1', 'A/B/C'),
    song('other-1', 'A/BC'),
    song('sibling-1', 'B'),
];

describe('normalizeLocalFolderPath', () => {
    it('统一反斜杠、去掉重复与两端分隔符', () => {
        expect(normalizeLocalFolderPath('\\Music\\Rock\\')).toBe('Music/Rock');
        expect(normalizeLocalFolderPath('//Music///Rock//')).toBe('Music/Rock');
        expect(normalizeLocalFolderPath('')).toBe('');
    });

    it('丢掉 . 与 .. 段，脏路径不能越过层级', () => {
        expect(normalizeLocalFolderPath('A/./B')).toBe('A/B');
        expect(normalizeLocalFolderPath('A/../B')).toBe('A/B');
        expect(normalizeLocalFolderPath('../A')).toBe('A');
        expect(isSameOrChildFolder('A/../B', 'A')).toBe(true);
        expect(isSameOrChildFolder('../B', 'A')).toBe(false);
    });

    it('拆出根名、相对路径、层级与父路径', () => {
        expect(localFolderRootName('Music/Rock/Live')).toBe('Music');
        expect(localFolderRelativePath('Music/Rock/Live')).toBe('Rock/Live');
        expect(localFolderDepth('Music/Rock/Live')).toBe(2);
        expect(localFolderDepth('Music')).toBe(0);
        expect(localFolderParentPath('Music/Rock/Live')).toBe('Music/Rock');
        expect(localFolderParentPath('Music')).toBe('');
        expect(isLocalRootFolder('Music')).toBe(true);
        expect(isLocalRootFolder('Music/Rock')).toBe(false);
    });
});

describe('isSameOrChildFolder', () => {
    it('按 / 边界匹配，不把 A/BB 当成 A/B 的子目录', () => {
        expect(isSameOrChildFolder('A/B/C', 'A/B')).toBe(true);
        expect(isSameOrChildFolder('A/B', 'A/B')).toBe(true);
        expect(isSameOrChildFolder('A/BB', 'A/B')).toBe(false);
        expect(isSameOrChildFolder('A', 'A/B')).toBe(false);
        expect(isSameOrChildFolder('B', 'A')).toBe(false);
        expect(isSameOrChildFolder('A/B', '')).toBe(false);
    });
});

describe('collectLocalFolderSongIds', () => {
    it('删子歌单只清该路径与更深路径，不碰主歌单、兄弟目录与其它导入根', () => {
        expect(collectLocalFolderSongIds(library, 'A/B')).toEqual(['sub-1', 'deep-1']);
        expect(collectLocalFolderSongIds(library, 'A/B/C')).toEqual(['deep-1']);
    });

    it('删主歌单会把所有子歌单的曲库记录一起算进去', () => {
        expect(collectLocalFolderSongIds(library, 'A')).toEqual(['root-1', 'sub-1', 'deep-1', 'other-1']);
    });

    it('反斜杠形式的路径与曲库里的斜杠路径等价', () => {
        expect(collectLocalFolderSongIds(library, 'A\\B')).toEqual(['sub-1', 'deep-1']);
    });

    it('优先用 folderName，旧数据回退到 filePath 的目录部分', () => {
        expect(songFolderPath({ folderName: 'A/B', filePath: 'X/Y/song.mp3' })).toBe('A/B');
        expect(songFolderPath({ folderName: '', filePath: 'A\\B\\song.mp3' })).toBe('A/B');
    });
});

describe('子歌单整理', () => {
    const leafPaths = ['A/B/C/D', 'A/E'];
    const allPaths = expandLocalFolderPathPrefixes(leafPaths);

    it('把叶子目录展开出中间的父级，A/B 才会成为可整理的子歌单', () => {
        expect(allPaths).toEqual(['A', 'A/B', 'A/B/C', 'A/B/C/D', 'A/E']);
    });

    it('只列出直接子歌单，不掺更深层级', () => {
        expect(collectDirectChildFolderPaths(allPaths, 'A')).toEqual(['A/B', 'A/E']);
        expect(collectDirectChildFolderPaths(allPaths, 'A/B')).toEqual(['A/B/C']);
        expect(collectDirectChildFolderPaths(allPaths, 'A/B/C/D')).toEqual([]);
    });

    it('后代歌单统计不含目标自己', () => {
        expect(collectDescendantFolderPaths(allPaths, 'A')).toEqual(['A/B', 'A/B/C', 'A/B/C/D', 'A/E']);
        expect(collectDescendantFolderPaths(allPaths, 'A/B')).toEqual(['A/B/C', 'A/B/C/D']);
        expect(collectDescendantFolderPaths(allPaths, 'A/B/C/D')).toEqual([]);
    });
});
