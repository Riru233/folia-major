import type { Line } from '../../../types';

// src/components/visualizer/karaoke/karaokePaging.ts
// 卡拉OK「两句一页」的划分：同一页放两句，第一句靠左、第二句靠右，第二句唱完才翻页。
//
// 关键是按**可见歌词**编号：开头的「歌名 / 作词 / 作曲」被提出来单独显示后，它们既不参与跟唱，
// 也不该占页内的格子。如果照原数组下标算（`index - index % 2`），三行署名会把第一句真歌词排到
// 页面的第二行、第一行留个空位——看上去就是「歌词从第二行才开始」。

export interface KaraokePage {
    /** 页在可见歌词里的起点；负数表示这一帧没有页（当前句就是被提走的署名行）。 */
    pageStart: number;
    firstLine: Line | null;
    secondLine: Line | null;
}

export interface KaraokePageOptions {
    /**
     * 还没有可跟唱的句子时，先把第一页亮出来。
     *
     * 开头那屏「歌名 / 作词 / 作曲」期间锚点落在署名行上（它不参与跟唱），原本会一页都没有；
     * 打开这个开关就让第一句歌词提前排在第一行等着，只是还没开始扫色。
     */
    previewFirstPage?: boolean;
}

/**
 * @param lines 整首歌词
 * @param hiddenIndexes 被提走的行（开头署名）在 `lines` 里的下标
 * @param anchorIndex 当前页的锚点，仍是 `lines` 的下标；句间空档传刚唱完那句
 */
export const resolveKaraokePage = (
    lines: readonly Line[],
    hiddenIndexes: ReadonlySet<number>,
    anchorIndex: number,
    options: KaraokePageOptions = {},
): KaraokePage => {
    const visibleLines = hiddenIndexes.size > 0
        ? lines.filter((_, index) => !hiddenIndexes.has(index))
        : lines;

    // 锚点自己就是署名行时没有可跟唱的句子：开了 previewFirstPage 就退回第一页。
    const anchorVisibleIndex = anchorIndex >= 0 && !hiddenIndexes.has(anchorIndex)
        ? visibleLines.indexOf(lines[anchorIndex])
        : -1;
    const pageStart = anchorVisibleIndex >= 0
        ? anchorVisibleIndex - (anchorVisibleIndex % 2)
        : (options.previewFirstPage && visibleLines.length > 0 ? 0 : -1);

    return {
        pageStart,
        firstLine: pageStart >= 0 ? visibleLines[pageStart] ?? null : null,
        secondLine: pageStart >= 0 ? visibleLines[pageStart + 1] ?? null : null,
    };
};
