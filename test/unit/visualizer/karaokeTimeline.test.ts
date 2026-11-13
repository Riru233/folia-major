import { describe, expect, it } from 'vitest';
import type { KaraokeCredits } from '@/components/visualizer/karaoke/karaokeCredits';
import { buildKaraokeTimeline } from '@/components/visualizer/karaoke/karaokeTimeline';

// test/unit/visualizer/karaokeTimeline.test.ts
// 设置面板的时间轴预览：信息块、交叉窗、三个预备点消失的时刻都按渲染器那套公式算，
// 这里钉住换算是同一个结果，免得预览和实际播放对不上。

const credits = (fadeStart: number, fadeEnd: number): KaraokeCredits => ({
    title: 'T',
    rows: ['作词：A'],
    hiddenIndexes: [0, 1],
    fadeStart,
    fadeEnd,
});

describe('buildKaraokeTimeline', () => {
    it('hands back an empty axis when the song has no info block', () => {
        const timeline = buildKaraokeTimeline({
            credits: null,
            leadInSeconds: 3,
            leadInGapSeconds: 1,
            advanceSeconds: 0,
        });

        expect(timeline.info).toBeNull();
        expect(timeline.overlap).toBeNull();
        expect(timeline.dots).toEqual([]);
        expect(timeline.lyricStart).toBeNull();
        expect(timeline.span).toBeGreaterThan(0);
    });

    it('puts the overlap window right before the first lyric', () => {
        const timeline = buildKaraokeTimeline({
            credits: credits(6, 6.8),
            leadInSeconds: 3,
            leadInGapSeconds: 1,
            advanceSeconds: 0,
        });

        expect(timeline.lyricStart).toBeCloseTo(6.8);
        expect(timeline.overlap).toEqual({ start: 3.8, end: 6.8 });
        // 信息从头就在屏幕上，起点钉在 0s，只有淡完的时刻跟着走。
        expect(timeline.info).toEqual({ start: 0, end: 6.8 });
    });

    it('spreads the three dots evenly and keeps them before the crossfade point', () => {
        const timeline = buildKaraokeTimeline({
            credits: credits(6, 6.8),
            leadInSeconds: 3,
            leadInGapSeconds: 1,
            advanceSeconds: 0,
        });

        // 红、绿、蓝：蓝最先没，红最后没，都停在交叉点之前。
        expect(timeline.dots).toEqual([3.8, 4.8, 5.8]);
        timeline.dots.forEach(at => expect(at).toBeLessThan(6.8));
    });

    it('narrows a gap wider than a third of the overlap', () => {
        const timeline = buildKaraokeTimeline({
            credits: credits(6, 6.8),
            leadInSeconds: 3,
            leadInGapSeconds: 5,
            advanceSeconds: 0,
        });

        expect(timeline.dots).toEqual([3.8, 4.8, 5.8]);
    });

    it('drops the dots when the overlap is zero', () => {
        const timeline = buildKaraokeTimeline({
            credits: credits(6, 6.8),
            leadInSeconds: 0,
            leadInGapSeconds: 1,
            advanceSeconds: 0,
        });

        expect(timeline.dots).toEqual([]);
        expect(timeline.overlap).toEqual({ start: 6.8, end: 6.8 });
    });

    it('moves the info block earlier without touching the crossfade window', () => {
        const timeline = buildKaraokeTimeline({
            credits: credits(6, 6.8),
            leadInSeconds: 3,
            leadInGapSeconds: 1,
            advanceSeconds: 1,
        });

        // 提前消失只把「淡完的时刻」往前挪，起点仍然是 0s。
        expect(timeline.info).toEqual({ start: 0, end: 5.8 });
        expect(timeline.overlap).toEqual({ start: 3.8, end: 6.8 });
        expect(timeline.dots).toEqual([3.8, 4.8, 5.8]);
    });

    it('stops the advance at the start of the overlap', () => {
        const timeline = buildKaraokeTimeline({
            credits: credits(6, 6.8),
            leadInSeconds: 3,
            leadInGapSeconds: 1,
            advanceSeconds: 5,
        });

        expect(timeline.info?.end).toBeCloseTo(3.8);
    });

    it('never draws a negative time when the intro is very short', () => {
        const timeline = buildKaraokeTimeline({
            credits: credits(0.2, 0.5),
            leadInSeconds: 3,
            leadInGapSeconds: 1,
            advanceSeconds: 2,
        });

        expect(timeline.lyricStart).toBe(0.5);
        expect(timeline.overlap?.start).toBe(0);
        expect(timeline.info?.start).toBeGreaterThanOrEqual(0);
        expect(timeline.dots.every(at => at >= 0)).toBe(true);
    });
});
