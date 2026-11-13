import { advanceKaraokeCreditsFade, type KaraokeCredits } from './karaokeCredits';
import { LEAD_IN_DOT_COUNT } from './karaokeLeadIn';

// src/components/visualizer/karaoke/karaokeTimeline.ts
// 卡拉OK 开头那一段的时间轴：信息块亮着的时间、交叉窗、三个预备点各自的消失时刻、第一句开口的位置。
// 设置面板的预览图用它，公式和渲染器同一套（重合开始、间隔收窄、提前消失的上限），
// 免得调好了滑块、实际播放又是另一个样子。

export interface KaraokeTimelineInput {
    /** 这首歌开头的歌曲信息；没有信息行就是 null。 */
    credits: KaraokeCredits | null;
    /** 交叉时间（秒），已经算进单曲覆盖值。 */
    leadInSeconds: number;
    /** 消失间隔（秒）。 */
    leadInGapSeconds: number;
    /** 歌曲信息提前消失（秒）。 */
    advanceSeconds: number;
}

export interface KaraokeTimeline {
    /** 横轴总长（秒）：从 0 到第一句之后留一点余量。 */
    span: number;
    /** 信息块亮着的时间段：起点恒为 0s，终点按「提前消失」前移。 */
    info: { start: number; end: number } | null;
    /** 交叉窗：标题和歌词同屏，三个预备点在这段里走完。 */
    overlap: { start: number; end: number } | null;
    /** 三个预备点消失的时刻，按下标排：0 红（最左）、1 绿、2 蓝（最右，最先没）。 */
    dots: number[];
    /** 第一句歌词开口的时刻，也就是交叉点。 */
    lyricStart: number | null;
}

/** 这首歌没有任何信息行时，横轴给这么长，图才不会空着。 */
const FALLBACK_SPAN = 6;

/** 第一句之后留一点余量，让人看得出交叉点后面还有歌词。 */
const TAIL_SECONDS = 1.5;

/**
 * 把调参换算成画图要的几个时间段。
 *
 * 点和渲染器完全一致：交叉点 = 信息淡完的时刻，交叉窗从交叉点往前推「交叉时间」，
 * 间隔收窄到「交叉时间 / 3」，蓝点最先没、红点最后没，三个都在交叉点之前走完。
 */
export const buildKaraokeTimeline = ({
    credits,
    leadInSeconds,
    leadInGapSeconds,
    advanceSeconds,
}: KaraokeTimelineInput): KaraokeTimeline => {
    if (!credits) {
        return { span: FALLBACK_SPAN, info: null, overlap: null, dots: [], lyricStart: null };
    }

    const lyricStart = Math.max(0, credits.fadeEnd);
    const seconds = Math.max(0, leadInSeconds);
    const overlapStart = Math.max(0, lyricStart - seconds);
    const fading = advanceKaraokeCreditsFade(credits, advanceSeconds, overlapStart);

    const step = seconds > 0 ? Math.min(Math.max(0, leadInGapSeconds), seconds / LEAD_IN_DOT_COUNT) : 0;
    const dots = step > 0
        ? Array.from({ length: LEAD_IN_DOT_COUNT }, (_, index) => (
            Math.max(0, lyricStart - (LEAD_IN_DOT_COUNT - index) * step)
        ))
        : [];

    return {
        span: Math.max(lyricStart + TAIL_SECONDS, fading.fadeEnd, 1),
        // 信息块从头就在屏幕上：起点钉死在 0s，只有「什么时候淡完」会随调参变。
        info: { start: 0, end: Math.max(0, fading.fadeEnd) },
        overlap: { start: overlapStart, end: lyricStart },
        dots,
        lyricStart,
    };
};
