import { describe, expect, it } from 'vitest';
import type { Line } from '@/types';
import { isChineseText, toTraditionalLyrics } from '@/components/visualizer/karaoke/karaokeHanzi';
import { buildKaraokeChunks } from '@/components/visualizer/karaoke/karaokeSegments';

// test/unit/visualizer/karaokeHanzi.test.ts
// 卡拉OK 的「繁体字形」：只转中文（含汉字的句子，但不带假名、谚文），按词挑字，英文和标点原样；
// 转完之后切成字块，时间仍按原句算。

const line = (overrides: Partial<Line>): Line => ({
    words: [],
    startTime: 0,
    endTime: 4,
    fullText: '',
    ...overrides,
});

describe('isChineseText', () => {
    it('takes a line with Han characters as Chinese', () => {
        expect(isChineseText('后来')).toBe(true);
        expect(isChineseText('Love 后来')).toBe(true);
    });

    it('leaves Japanese and Korean alone even though they carry Han characters', () => {
        expect(isChineseText('君の髪が揺れる')).toBe(false);
        expect(isChineseText('カラオケ')).toBe(false);
        expect(isChineseText('이 밤의 노래')).toBe(false);
    });

    it('says no to lines with nothing to convert', () => {
        expect(isChineseText('')).toBe(false);
        expect(isChineseText('oh oh oh')).toBe(false);
        expect(isChineseText('……')).toBe(false);
    });
});

describe('toTraditionalLyrics', () => {
    it('picks the character by the word, not one character at a time', () => {
        // 逐字转会得到「頭發」「乾杯」这类错字，整句交给 OpenCC 才对。
        expect(toTraditionalLyrics('头发')).toBe('頭髮');
        expect(toTraditionalLyrics('干杯')).toBe('乾杯');
        expect(toTraditionalLyrics('后来')).toBe('後來');
    });

    it('keeps English and punctuation as they were', () => {
        expect(toTraditionalLyrics('Love 后来, oh!')).toBe('Love 後來, oh!');
    });

    it('writes 你 as 妳 in Traditional', () => {
        // OpenCC 只管字形，代词得自己补：繁体里一律写「妳」。
        expect(toTraditionalLyrics('你')).toBe('妳');
        expect(toTraditionalLyrics('我爱你')).toBe('我愛妳');
        expect(toTraditionalLyrics('你们的后来')).toBe('妳們的後來');
    });

    it('leaves a Japanese line untouched', () => {
        expect(toTraditionalLyrics('君の髪が揺れる')).toBe('君の髪が揺れる');
    });

    it('returns an English line untouched', () => {
        expect(toTraditionalLyrics('nothing to see here')).toBe('nothing to see here');
    });
});

describe('buildKaraokeChunks with a transform', () => {
    it('splits the converted line and keeps the timings of the original', () => {
        const songLine = line({ fullText: '后来', endTime: 2 });
        const chunks = buildKaraokeChunks(songLine, toTraditionalLyrics);

        expect(chunks.map(chunk => chunk.text)).toEqual(['後', '來']);
        expect(chunks[0].startTime).toBe(0);
        expect(chunks[0].endTime).toBe(1);
        expect(chunks[1].endTime).toBe(2);
    });

    it('still marks the line once per original character', () => {
        const songLine = line({ fullText: 'one two' });
        // 英文句子上转换是恒等，块和原句完全一致。
        expect(buildKaraokeChunks(songLine, toTraditionalLyrics).map(chunk => chunk.text)).toEqual(['one ', 'two']);
    });

    it('keeps the times in order when the conversion changes the length', () => {
        // 「…」被替换成两个字符：块的偏移要按比例映回原句，时间才不会整体后移或倒过来。
        const songLine = line({ fullText: 'ab', endTime: 4 });
        const chunks = buildKaraokeChunks(songLine, text => `${text}${text}`);

        expect(chunks.map(chunk => chunk.text).join('')).toBe('abab');
        const times = chunks.map(chunk => chunk.startTime);
        expect([...times].sort((left, right) => left - right)).toEqual(times);
        expect(times[0]).toBe(0);
    });
});
