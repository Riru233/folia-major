import type { BilibiliMvTuning } from '../../../types/bilibili';

// src/shinoinject/lab/bilibili/avSync.ts
// 音画对位的算法部分：把「歌曲播到第几秒」换成「MV 该放到第几秒」。纯函数，好单测。
//
// MV 是静音的，声音永远是歌曲自己的，所以这里是唯一能把两者对齐的地方：offsetSec 是用户在
// 面板里调的那个秒数（可以带小数），正数表示画面比声音晚（MV 从更早的位置开始放），负数表示
// 画面提前。不设上下限——片头差几秒、整段访谈差几十秒都是同一种情况，交给用户自己填。

/** 偏移的落盘精度：秒，保留到毫秒（三位小数）。不夹范围，想填多大就多大。 */
export const normalizeOffsetSec = (value: unknown): number => {
    const parsed = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(parsed)) return 0;
    return Math.round(parsed * 1000) / 1000;
};

/**
 * 歌曲时钟当前该让 MV 停在第几秒。`loop` 时按视频时长取模（视频比歌短，绕回去继续放），
 * 否则停在最后一帧；偏移把目标推到 0 之前时，两种情况都夹回开头，不出现黑屏。
 */
export const mvTargetTime = (
    clockSec: number,
    { durationSec, loop, offsetSec }: { durationSec: number; loop: boolean; offsetSec: number },
): number | null => {
    if (!Number.isFinite(durationSec) || durationSec <= 0) return null;
    const clock = Number.isFinite(clockSec) ? clockSec : 0;
    const shifted = clock - normalizeOffsetSec(offsetSec);
    if (loop) return ((shifted % durationSec) + durationSec) % durationSec;
    return Math.min(Math.max(shifted, 0), Math.max(0, durationSec - 0.05));
};

/**
 * 调校里的偏移是不是给这条 BV 的。`offsetBvid` 为空表示「还没绑到具体视频」，先当作通用；
 * 存的是别的 BV 时这条偏移不生效，等用户换回那条视频再自动回来。
 */
export const tuningAppliesTo = (tuning: BilibiliMvTuning | null | undefined, bvid: string | null | undefined): boolean => {
    if (!tuning || tuning.offsetSec === 0) return false;
    if (!tuning.offsetBvid) return true;
    return Boolean(bvid) && tuning.offsetBvid === bvid;
};
