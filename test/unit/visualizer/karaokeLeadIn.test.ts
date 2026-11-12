import { describe, expect, it } from 'vitest';
import {
    LEAD_IN_DOT_COLORS,
    LEAD_IN_DOT_COUNT,
    resolveLeadInDotOpacities,
} from '@/components/visualizer/karaoke/karaokeLeadIn';

// test/unit/visualizer/karaokeLeadIn.test.ts
// 开头三个预备点：红绿蓝三个圆，从左到右排着。消失只由「预备交叉时间」和「消失间隔」两项决定：
// 从右往左逐个立即消失（蓝、绿、红），相邻两个隔「消失间隔」秒，三个都赶在交叉点之前走完。
//
// 统一用交叉点 END = 8 秒。返回值的顺序是 [红, 绿, 蓝]（和屏幕上的排法一致）。

const END = 8;

describe('resolveLeadInDotOpacities', () => {
    it('is three dots in standard red, green and blue, left to right', () => {
        expect(LEAD_IN_DOT_COUNT).toBe(3);
        expect([...LEAD_IN_DOT_COLORS]).toEqual(['#ff0000', '#00ff00', '#0000ff']);
    });

    it('stays dark outside the cross window', () => {
        // 窗口是 end - 交叉时间 → end，也就是 5 秒到 8 秒
        expect(resolveLeadInDotOpacities(4.9, END, 3, 1)).toEqual([0, 0, 0]);
        expect(resolveLeadInDotOpacities(END, END, 3, 1)).toEqual([0, 0, 0]);
        expect(resolveLeadInDotOpacities(END + 5, END, 3, 1)).toEqual([0, 0, 0]);
    });

    it('takes them away right to left, one gap apart, before the cross point', () => {
        // 交叉点 8 秒、间隔 1 秒：5 秒蓝、6 秒绿、7 秒红；交叉时间最后那一秒没有点
        expect(resolveLeadInDotOpacities(5.5, END, 3, 1)).toEqual([1, 1, 0]);
        expect(resolveLeadInDotOpacities(6.0, END, 3, 1)).toEqual([1, 0, 0]);
        expect(resolveLeadInDotOpacities(7.0, END, 3, 1)).toEqual([0, 0, 0]);
    });

    it('snaps instead of fading', () => {
        // 差 0.01 秒时还亮着，到点直接没：没有中间值
        expect(resolveLeadInDotOpacities(5.99, END, 3, 1)).toEqual([1, 1, 0]);
        expect(resolveLeadInDotOpacities(6.01, END, 3, 1)).toEqual([1, 0, 0]);
        expect(resolveLeadInDotOpacities(6.99, END, 3, 1)).toEqual([1, 0, 0]);
        expect(resolveLeadInDotOpacities(7.01, END, 3, 1)).toEqual([0, 0, 0]);
    });

    it('never drops more than one dot at the same moment', () => {
        let previous = resolveLeadInDotOpacities(5, END, 3, 1);
        for (let time = 5.01; time < END; time += 0.01) {
            const current = resolveLeadInDotOpacities(time, END, 3, 1);
            const dropped = previous.reduce((sum, value, index) => sum + (value - current[index]), 0);
            expect(dropped).toBeLessThanOrEqual(1);
            previous = current;
        }
    });

    it('finishes before the cross point, never on it', () => {
        for (let time = END - 1; time < END; time += 0.05) {
            expect(resolveLeadInDotOpacities(time, END, 3, 1).filter(Boolean)).toHaveLength(0);
        }
    });

    it('keeps a shorter gap inside the window and shifts the sequence later', () => {
        // 间隔 0.5 秒：蓝 6.5、绿 7、红 7.5，三个都看得到
        expect(resolveLeadInDotOpacities(6.4, END, 3, 0.5)).toEqual([1, 1, 1]);
        expect(resolveLeadInDotOpacities(6.5, END, 3, 0.5)).toEqual([1, 1, 0]);
        expect(resolveLeadInDotOpacities(7.0, END, 3, 0.5)).toEqual([1, 0, 0]);
        expect(resolveLeadInDotOpacities(7.5, END, 3, 0.5)).toEqual([0, 0, 0]);
    });

    it('narrows a gap wider than a third of the cross window', () => {
        // 间隔再大也不让红点越过交叉点：5 秒的间隔按 3 / 3 = 1 秒算
        expect(resolveLeadInDotOpacities(5.5, END, 3, 5)).toEqual([1, 1, 0]);
        expect(resolveLeadInDotOpacities(6.0, END, 3, 5)).toEqual([1, 0, 0]);
        expect(resolveLeadInDotOpacities(7.0, END, 3, 5)).toEqual([0, 0, 0]);
    });

    it('scales with a longer cross window', () => {
        // 交叉时间 4 秒、间隔 1 秒：窗口从 4 秒开到 8 秒，蓝 5、绿 6、红 7
        expect(resolveLeadInDotOpacities(4.5, END, 4, 1)).toEqual([1, 1, 1]);
        expect(resolveLeadInDotOpacities(5.0, END, 4, 1)).toEqual([1, 1, 0]);
        expect(resolveLeadInDotOpacities(6.5, END, 4, 1)).toEqual([1, 0, 0]);
    });

    it('shows nothing when the feature is turned off or the song has no intro', () => {
        expect(resolveLeadInDotOpacities(5, END, 0, 1)).toEqual([0, 0, 0]);
        expect(resolveLeadInDotOpacities(5, 0, 3, 1)).toEqual([0, 0, 0]);
    });
});
