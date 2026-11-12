// src/components/visualizer/karaoke/karaokeLeadIn.ts
// 开头那三个「预备点」：红、绿、蓝三个圆，从左到右排着，放在歌名那一屏和第一句歌词之间。
//
// 消失规则（不再单独调某个颜色，只调「消失间隔」）：
//   · 从右往左一个个消失，也就是先蓝、再绿、最后红；
//   · 立即消失，没有淡出过渡；
//   · 间隔均匀，一个走掉隔「消失间隔」秒再走下一个；
//   · 最左边的红点收在「交叉点前一个间隔」，也就是三个点都在交叉时间结束前走完，
//     交叉时间收尾那一段留空——不让红点拖到标题结束那一刻；
//   · 间隔最多把交叉时间切成三份，再大就收窄：三个点必须在交叉时间结束前走完。

/** 标准红、绿、蓝：从左到右排，消失时从右往左（蓝先没）。 */
export const LEAD_IN_DOT_COLORS = ['#ff0000', '#00ff00', '#0000ff'] as const;

export const LEAD_IN_DOT_COUNT = LEAD_IN_DOT_COLORS.length;

/** 默认的预备交叉时间（秒）：标题结束前三秒开始倒数。 */
export const DEFAULT_LEAD_IN_SECONDS = 3;

/** 默认的消失间隔（秒）：每个点之间隔一秒走掉。 */
export const DEFAULT_LEAD_IN_GAP_SECONDS = 1;

/**
 * 每个点在这一刻亮不亮。
 *
 * @param time 播放时间
 * @param end 标题结束（= 第一句歌词起唱）的时刻，也就是交叉点
 * @param seconds 预备交叉时间：倒数窗的长度，从 end 往前推；0 表示不要预备点
 * @param gap 消失间隔：相邻两个点消失之间隔多久
 * @param count 点的个数
 *
 * 红点（下标 0）在 end - gap 消失，绿点在 end - 2gap，蓝点在 end - 3gap：
 * 全部赶在交叉点之前走完。立即消失，所以返回值只有 0 / 1。
 */
export const resolveLeadInDotOpacities = (
    time: number,
    end: number,
    seconds: number = DEFAULT_LEAD_IN_SECONDS,
    gap: number = DEFAULT_LEAD_IN_GAP_SECONDS,
    count: number = LEAD_IN_DOT_COUNT,
): number[] => {
    if (!(end > 0) || !(seconds > 0) || !(gap > 0) || time < end - seconds || time >= end) {
        return new Array(count).fill(0);
    }

    // 间隔不能大到让红点越过交叉点：窗口三等分就是上限。
    const step = Math.min(gap, seconds / count);

    return Array.from({ length: count }, (_, index) => (
        // 从右往左：下标越大越早没；下标 0（红）最后一个走，但仍在交叉点之前。
        time < end - (index + 1) * step ? 1 : 0
    ));
};
