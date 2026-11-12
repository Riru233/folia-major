import { describe, expect, it } from 'vitest';
import type { Line } from '@/types';
import { buildKaraokeChunks, chunkFillProgress, splitKaraokeChunks } from '@/components/visualizer/karaoke/karaokeSegments';

// test/unit/visualizer/karaokeChunks.test.ts
// 卡拉OK 的字块切分与时间：块拼起来必须就是原句（不能因为切分把字或空格吃掉），
// 时间必须单调往前（否则后面的字会先亮），逐字时间对不上时退回整句均摊。

const line = (overrides: Partial<Line>): Line => ({
    words: [],
    startTime: 0,
    endTime: 4,
    fullText: '',
    ...overrides,
});

describe('splitKaraokeChunks', () => {
    it('breaks CJK into single characters and keeps Latin words whole', () => {
        expect(splitKaraokeChunks('你好世界').map(chunk => chunk.text)).toEqual(['你', '好', '世', '界']);
        expect(splitKaraokeChunks('hello world').map(chunk => chunk.text)).toEqual(['hello ', 'world']);
    });

    it('never drops a character and never moves one', () => {
        const text = '轻轻唱 hello again，在无人的街角';
        const chunks = splitKaraokeChunks(text);
        expect(chunks.map(chunk => chunk.text).join('')).toBe(text);
        chunks.forEach(chunk => {
            expect(text.slice(chunk.offset, chunk.offset + chunk.text.length)).toBe(chunk.text);
        });
    });

    it('keeps a leading space as its own chunk', () => {
        expect(splitKaraokeChunks(' hi').map(chunk => chunk.text)).toEqual([' ', 'hi']);
    });
});

describe('buildKaraokeChunks', () => {
    it('uses the word timings it can align with the displayed text', () => {
        const chunks = buildKaraokeChunks(line({
            fullText: 'one two',
            startTime: 10,
            endTime: 12,
            words: [
                { text: 'one ', startTime: 10, endTime: 11 },
                { text: 'two', startTime: 11, endTime: 12 },
            ],
        }));
        expect(chunks.map(chunk => chunk.text)).toEqual(['one ', 'two']);
        expect(chunks[0]!.startTime).toBeCloseTo(10);
        expect(chunks[1]!.startTime).toBeCloseTo(11);
        expect(chunks[1]!.endTime).toBeCloseTo(12);
    });

    it('spreads the line over its characters when there are no timings', () => {
        const chunks = buildKaraokeChunks(line({ fullText: '一二三四', startTime: 2, endTime: 6 }));
        expect(chunks.map(chunk => chunk.startTime)).toEqual([2, 3, 4, 5]);
        expect(chunks[3]!.endTime).toBe(6);
    });

    it('falls back to an even spread when the timings do not match the text', () => {
        const chunks = buildKaraokeChunks(line({
            fullText: '一二',
            startTime: 0,
            endTime: 2,
            words: [{ text: '完全不同的词', startTime: 0, endTime: 2 }],
        }));
        expect(chunks.map(chunk => chunk.startTime)).toEqual([0, 1]);
    });

    it('keeps the times going forward even when the timings go backwards', () => {
        const chunks = buildKaraokeChunks(line({
            fullText: '一二三',
            startTime: 5,
            endTime: 8,
            words: [
                { text: '一', startTime: 6, endTime: 7 },
                { text: '二', startTime: 5, endTime: 6 },
                { text: '三', startTime: 7, endTime: 8 },
            ],
        }));
        const starts = chunks.map(chunk => chunk.startTime);
        expect(starts).toEqual([...starts].sort((a, b) => a - b));
    });

    it('returns nothing for a line without text', () => {
        expect(buildKaraokeChunks(line({ fullText: '' }))).toEqual([]);
        expect(buildKaraokeChunks(null)).toEqual([]);
    });
});

describe('chunkFillProgress', () => {
    const chunk = { text: '字', offset: 0, startTime: 2, endTime: 4 };

    it('is 0 before, 1 after, and linear in between', () => {
        expect(chunkFillProgress(chunk, 1)).toBe(0);
        expect(chunkFillProgress(chunk, 2)).toBe(0);
        expect(chunkFillProgress(chunk, 3)).toBeCloseTo(0.5);
        expect(chunkFillProgress(chunk, 4)).toBe(1);
    });

    it('treats a zero-length chunk as done at its start', () => {
        expect(chunkFillProgress({ text: '字', offset: 0, startTime: 2, endTime: 2 }, 2)).toBe(1);
    });
});
