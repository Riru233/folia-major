import { describe, expect, it } from 'vitest';
import type { Line } from '@/types';
import { resolveKaraokePage } from '@/components/visualizer/karaoke/karaokePaging';

// test/unit/visualizer/karaokePaging.test.ts
// 开头的署名行被提走之后，页的划分必须按**可见歌词**算：第一句真歌词要落在页面的第一行。
// 照原数组下标算的话，奇数行署名会把第一句挤到第二行，第一行留个空位。

const line = (fullText: string, startTime: number, endTime: number): Line => ({
    words: [],
    startTime,
    endTime,
    fullText,
});

const withIntro = (): Line[] => [
    line('Neon River - Probe', 0, 2),
    line('作词：某某某', 2, 4),
    line('作曲：某某某', 4, 6),
    line('第一句歌词', 8, 12),
    line('第二句歌词', 12, 16),
    line('第三句歌词', 16, 20),
    line('第四句歌词', 20, 24),
    line('第五句歌词', 24, 28),
];

const INTRO_HIDDEN = new Set([0, 1, 2]);

describe('resolveKaraokePage', () => {
    it('puts the first real lyric on the top row, not the second', () => {
        const lines = withIntro();
        const page = resolveKaraokePage(lines, INTRO_HIDDEN, 3);

        expect(page.firstLine).toBe(lines[3]);
        expect(page.secondLine).toBe(lines[4]);
        expect(page.pageStart).toBe(0);
    });

    it('pairs the visible lines two at a time, ignoring the hidden ones in between', () => {
        const lines = withIntro();
        const second = resolveKaraokePage(lines, INTRO_HIDDEN, 5);

        // 可见序号 2 → 第二页，包含可见歌词的第三、四句
        expect(second.firstLine).toBe(lines[5]);
        expect(second.secondLine).toBe(lines[6]);
    });

    it('follows an odd hidden row instead of miscounting by one', () => {
        // 只藏第一行时，原来的写法会把第二行顶到页首；现在第一句可见歌词照样在最上面。
        const lines = withIntro();
        const page = resolveKaraokePage(lines, new Set([0]), 1);

        expect(page.firstLine).toBe(lines[1]);
        expect(page.secondLine).toBe(lines[2]);
    });

    it('shows nothing while the singing line is itself a hidden staff row', () => {
        const page = resolveKaraokePage(withIntro(), INTRO_HIDDEN, 1);

        expect(page.pageStart).toBe(-1);
        expect(page.firstLine).toBeNull();
        expect(page.secondLine).toBeNull();
    });

    it('previews the first page during the intro when asked to', () => {
        // 开头那屏歌曲信息期间把第一页先亮出来：主要歌词提前显示，和标题同屏。
        const lines = withIntro();
        const page = resolveKaraokePage(lines, INTRO_HIDDEN, 1, { previewFirstPage: true });

        expect(page.pageStart).toBe(0);
        expect(page.firstLine).toBe(lines[3]);
        expect(page.secondLine).toBe(lines[4]);
    });

    it('previews the first page before playback starts at all', () => {
        const page = resolveKaraokePage(withIntro(), INTRO_HIDDEN, -1, { previewFirstPage: true });

        expect(page.pageStart).toBe(0);
    });

    it('keeps the old behaviour when nothing is hidden', () => {
        const lines = withIntro();
        const page = resolveKaraokePage(lines, new Set(), 4);

        expect(page.firstLine).toBe(lines[4]);
        expect(page.secondLine).toBe(lines[5]);
    });

    it('leaves the last page with a single line when the song ends on an odd line', () => {
        const lines = withIntro();
        // 可见歌词 5 句，取最后一句（可见序号 4）→ 页从这里起，第二行不存在
        const page = resolveKaraokePage(lines, INTRO_HIDDEN, 7);

        expect(page.firstLine).toBe(lines[7]);
        expect(page.secondLine).toBeNull();
    });

    it('has no page before the first line starts', () => {
        const page = resolveKaraokePage(withIntro(), INTRO_HIDDEN, -1);

        expect(page.pageStart).toBe(-1);
        expect(page.firstLine).toBeNull();
    });
});
