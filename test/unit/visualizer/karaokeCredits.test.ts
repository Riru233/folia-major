import { describe, expect, it } from 'vitest';
import type { Line } from '@/types';
import {
    karaokeCreditsOpacity,
    resolveKaraokeCredits,
} from '@/components/visualizer/karaoke/karaokeCredits';

// test/unit/visualizer/karaokeCredits.test.ts
// 开头那段「歌名 / 作词 / 作曲」要提出来当信息显示，而不是当歌词唱：
// 挑哪几行、藏哪几行、什么时候开始淡出，都在这里钉住。

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
];

describe('resolveKaraokeCredits', () => {
    it('picks the lyricist and composer rows out of the leading staff block', () => {
        const credits = resolveKaraokeCredits(withIntro(), { title: 'Neon River' });

        expect(credits?.title).toBe('Neon River');
        expect(credits?.rows).toEqual(['作词：某某某', '作曲：某某某']);
    });

    it('hides the header line and every staff line from the lyric pages', () => {
        const lines = withIntro();
        const credits = resolveKaraokeCredits(lines, { title: 'Neon River' });

        expect(credits?.hiddenIndexes).toEqual([0, 1, 2]);
        // 真歌词一个字都不能被提走。
        expect(credits?.hiddenIndexes).not.toContain(3);
        expect(credits?.hiddenIndexes).not.toContain(4);
    });

    it('falls back to the "title - artist" header line when the song has no title', () => {
        const credits = resolveKaraokeCredits(withIntro(), {});

        expect(credits?.title).toBe('Neon River');
    });

    it('keeps only the lyricist/composer rows, not the rest of the credits', () => {
        const lines = [
            line('作词：A', 0, 2),
            line('作曲：B', 2, 4),
            line('编曲：C', 4, 6),
            line('混音：D', 6, 8),
            line('第一句', 9, 12),
        ];
        const credits = resolveKaraokeCredits(lines, { title: 'T' });

        expect(credits?.rows).toEqual(['作词：A', '作曲：B']);
        expect(credits?.hiddenIndexes).toEqual([0, 1, 2, 3]);
    });

    it('returns null for lyrics that simply start singing', () => {
        const lines = [line('第一句', 0, 4), line('第二句', 4, 8)];

        expect(resolveKaraokeCredits(lines, { title: 'T' })).toBeNull();
    });

    it('returns null for a single stray credit line', () => {
        const lines = [line('作词：A', 0, 2), line('第一句', 3, 6), line('第二句', 6, 9)];

        expect(resolveKaraokeCredits(lines, { title: 'T' })).toBeNull();
    });

    it('returns null for instrumentals', () => {
        expect(resolveKaraokeCredits(withIntro(), { title: 'T', instrumental: true })).toBeNull();
    });

    it('returns null when the intro is too short to fade inside', () => {
        const lines = [line('作词：A', 0, 0.3), line('作曲：B', 0.3, 0.6), line('第一句', 0.8, 3)];

        expect(resolveKaraokeCredits(lines, { title: 'T' })).toBeNull();
    });

    it('falls back to the title alone when the credits were stripped upstream', () => {
        const lines = [line('第一句', 4, 8), line('第二句', 8, 12)];
        const credits = resolveKaraokeCredits(lines, { title: 'Neon River' });

        expect(credits).toEqual({
            title: 'Neon River',
            rows: [],
            hiddenIndexes: [],
            fadeStart: 3.2,
            fadeEnd: 4,
        });
    });

    it('needs a title to show anything without a credit block', () => {
        const lines = [line('第一句', 4, 8), line('第二句', 8, 12)];

        expect(resolveKaraokeCredits(lines, {})).toBeNull();
    });

    it('fades from the end of the composer line to the first lyric', () => {
        const credits = resolveKaraokeCredits(withIntro(), { title: 'T' });

        // 作曲那句 6 秒唱完开始淡，0.8 秒淡到没有，第一句歌词 8 秒才出来。
        expect(credits?.fadeStart).toBe(6);
        expect(credits?.fadeEnd).toBe(6.8);
    });
});

describe('resolveKaraokeCredits with a hand-picked answer', () => {
    // 识别不出来的歌：开头三行是「歌名 - 歌手」「Lyrics by ...」「Music by ...」。
    const englishIntro = (): Line[] => [
        line('Neon River - Probe', 0, 2),
        line('Lyrics by Ann Lee', 2, 4),
        line('Music by Bo Chen', 4, 6),
        line('we were young', 8, 12),
    ];

    it('takes the given lines instead of guessing', () => {
        const credits = resolveKaraokeCredits(englishIntro(), { hiddenIndexes: [0, 1, 2] });

        expect(credits?.hiddenIndexes).toEqual([0, 1, 2]);
        expect(credits?.rows).toEqual(['Lyrics by Ann Lee', 'Music by Bo Chen']);
        // 没有元数据歌名时，第一行「歌名 - 歌手」的前半段当标题。
        expect(credits?.title).toBe('Neon River');
    });

    it('shows the rows the model wrote, labels and all', () => {
        const credits = resolveKaraokeCredits(englishIntro(), {
            title: 'Neon River',
            hiddenIndexes: [0, 1, 2],
            rows: ['作词：Ann Lee', '作曲：Bo Chen'],
        });

        expect(credits?.rows).toEqual(['作词：Ann Lee', '作曲：Bo Chen']);
        expect(credits?.title).toBe('Neon River');
    });

    it('drops indexes outside the lyric array', () => {
        const credits = resolveKaraokeCredits(englishIntro(), { hiddenIndexes: [0, 9, 1] });

        expect(credits?.hiddenIndexes).toEqual([0, 1]);
    });

    it('treats an empty list as "no info rows here"', () => {
        expect(resolveKaraokeCredits(englishIntro(), { hiddenIndexes: [] })).toBeNull();
    });

    it('fades from the last picked line to the first lyric after it', () => {
        const credits = resolveKaraokeCredits(englishIntro(), { hiddenIndexes: [0, 1, 2] });

        expect(credits?.fadeStart).toBe(6);
        expect(credits?.fadeEnd).toBe(6.8);
    });

    it('recognises the English credit labels without help', () => {
        const lines = [
            line('Lyrics by Ann Lee', 0, 2),
            line('Music by Bo Chen', 2, 4),
            line('we were young', 6, 10),
        ];
        const credits = resolveKaraokeCredits(lines, { title: 'Neon River' });

        expect(credits?.rows).toEqual(['Lyrics by Ann Lee', 'Music by Bo Chen']);
    });
});

describe('karaokeCreditsOpacity', () => {
    const credits = resolveKaraokeCredits(withIntro(), { title: 'T' })!;

    it('is fully visible through the credits and gone once the lyrics sing', () => {
        expect(karaokeCreditsOpacity(credits, 0)).toBe(1);
        expect(karaokeCreditsOpacity(credits, 5.9)).toBe(1);
        expect(karaokeCreditsOpacity(credits, credits.fadeEnd)).toBe(0);
        expect(karaokeCreditsOpacity(credits, 30)).toBe(0);
    });

    it('fades monotonically in between', () => {
        const samples = [6, 6.4, 7, 7.6, 8].map(time => karaokeCreditsOpacity(credits, time));

        expect(samples[0]).toBe(1);
        expect(samples[samples.length - 1]).toBe(0);
        samples.slice(1).forEach((value, index) => {
            expect(value).toBeLessThanOrEqual(samples[index]);
        });
    });
});
