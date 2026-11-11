import { describe, expect, it } from 'vitest';
import { mvTargetTime, normalizeOffsetSec, tuningAppliesTo } from '../../../src/shinoinject/lab/bilibili/avSync';

// test/unit/lab/bilibiliAvSync.test.ts
// 音画对位：歌曲时钟 → MV 该放第几秒。偏移以秒为单位（可带小数），正数让画面晚（MV 从更早的
// 位置开始），负数让画面提前，不设上下限。

describe('bilibili mv av sync', () => {
    it('keeps the offset in seconds to millisecond precision, without a limit', () => {
        expect(normalizeOffsetSec(12)).toBe(12);
        expect(normalizeOffsetSec(-12)).toBe(-12);
        expect(normalizeOffsetSec(0.1234)).toBe(0.123);
        expect(normalizeOffsetSec(-0.1234)).toBe(-0.123);
        // 大调也照收：几分钟、几小时都不是错，只是偏得多。
        expect(normalizeOffsetSec(3600)).toBe(3600);
        expect(normalizeOffsetSec(-7200)).toBe(-7200);
        expect(normalizeOffsetSec(Number.NaN)).toBe(0);
        expect(normalizeOffsetSec(undefined)).toBe(0);
        expect(normalizeOffsetSec('2.5')).toBe(2.5);
    });

    it('moves the picture later for a positive offset and earlier for a negative one', () => {
        const options = { durationSec: 200, loop: false };
        expect(mvTargetTime(30, { ...options, offsetSec: 0 })).toBe(30);
        // 画面晚 0.5s：歌到 30s 时，MV 只该放到 29.5s。
        expect(mvTargetTime(30, { ...options, offsetSec: 0.5 })).toBeCloseTo(29.5, 6);
        // 画面提前 0.5s：MV 已经到 30.5s 了。
        expect(mvTargetTime(30, { ...options, offsetSec: -0.5 })).toBeCloseTo(30.5, 6);
        // 整段访谈差十几秒也是同一种算法。
        expect(mvTargetTime(60, { ...options, offsetSec: 12 })).toBeCloseTo(48, 6);
    });

    it('wraps a looping MV around, including a negative target', () => {
        expect(mvTargetTime(11, { durationSec: 10, loop: true, offsetSec: 0 })).toBeCloseTo(1, 6);
        // 画面晚 3s，歌才到第 1 秒：目标落在片头之前，绕到视频末尾而不是停在 0。
        expect(mvTargetTime(1, { durationSec: 10, loop: true, offsetSec: 3 })).toBeCloseTo(8, 6);
        // 偏得比视频本身还长也照样绕回来。
        expect(mvTargetTime(1, { durationSec: 10, loop: true, offsetSec: 23 })).toBeCloseTo(8, 6);
    });

    it('stops at the first and last frame when the MV does not loop', () => {
        // 画面晚 3s，歌还在第 1 秒：MV 还没开始。
        expect(mvTargetTime(1, { durationSec: 10, loop: false, offsetSec: 3 })).toBe(0);
        // 歌比 MV 长：停在最后一帧之前一点点，不出现黑屏。
        expect(mvTargetTime(30, { durationSec: 10, loop: false, offsetSec: 0 })).toBeCloseTo(9.95, 6);
    });

    it('has no target without a playable duration', () => {
        expect(mvTargetTime(10, { durationSec: 0, loop: true, offsetSec: 0 })).toBeNull();
        expect(mvTargetTime(10, { durationSec: Number.NaN, loop: false, offsetSec: 0 })).toBeNull();
    });

    it('only applies an offset to the BV it was tuned against', () => {
        const tuning = { pinnedBvid: '', offsetBvid: 'BV1xx411c7mD', offsetSec: 0.12 };
        expect(tuningAppliesTo(tuning, 'BV1xx411c7mD')).toBe(true);
        expect(tuningAppliesTo(tuning, 'BV1yy411c7mE')).toBe(false);
        // 还没绑到具体视频的偏移先当作通用。
        expect(tuningAppliesTo({ ...tuning, offsetBvid: '' }, 'BV1yy411c7mE')).toBe(true);
        expect(tuningAppliesTo({ ...tuning, offsetSec: 0 }, 'BV1xx411c7mD')).toBe(false);
        expect(tuningAppliesTo(undefined, 'BV1xx411c7mD')).toBe(false);
    });
});
