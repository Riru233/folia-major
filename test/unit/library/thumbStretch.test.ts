// test/unit/library/thumbStretch.test.ts
// Grid3D 摇杆速度形变的「速度 → 强度」曲线：门槛以下不变形、区间内按幂曲线上升、满速封顶。
// 两条用途分开测：
//   · 滑行（stretchAmountFromSpeed）：强度带方向符号（右为正、左为负），同速左右大小相同、符号相反；
//   · 拖动（stretchAmountForDrag）：幅度看速度，符号只看有没有触边，左右同一套规则。
import { describe, expect, it } from 'vitest';
import {
    SPEED_FOR_FULL_STRETCH,
    STRETCH_CURVE_POWER,
    STRETCH_MIN_SPEED,
    isThumbAtEdge,
    stretchAmountForDrag,
    stretchAmountFromSpeed,
} from '../../../src/library/suites/grid/home/thumbStretch';

describe('thumbStretch 速度曲线', () => {
    it('门槛及以下完全不变形', () => {
        expect(stretchAmountFromSpeed(0)).toBe(0);
        expect(stretchAmountFromSpeed(STRETCH_MIN_SPEED - 1)).toBe(0);
        expect(stretchAmountFromSpeed(STRETCH_MIN_SPEED)).toBe(0);
    });

    it('慢拖（远低于门槛）不会让摇杆变形', () => {
        // 手抖、点按这类几百毫秒内挪几像素的速度都该落在门槛以下
        expect(stretchAmountFromSpeed(40)).toBe(0);
        expect(stretchAmountFromSpeed(120)).toBe(0);
    });

    it('满速拉满，超过满速仍然封顶在 1', () => {
        expect(stretchAmountFromSpeed(SPEED_FOR_FULL_STRETCH)).toBeCloseTo(1, 6);
        expect(stretchAmountFromSpeed(SPEED_FOR_FULL_STRETCH * 4)).toBe(1);
        expect(stretchAmountFromSpeed(Number.POSITIVE_INFINITY)).toBe(1);
    });

    it('区间内单调递增，不会跳变', () => {
        const steps = 32;
        let previous = 0;
        for (let index = 1; index <= steps; index += 1) {
            const speed = STRETCH_MIN_SPEED + ((SPEED_FOR_FULL_STRETCH - STRETCH_MIN_SPEED) * index) / steps;
            const amount = stretchAmountFromSpeed(speed);
            expect(amount).toBeGreaterThanOrEqual(previous);
            expect(amount).toBeLessThanOrEqual(1);
            previous = amount;
        }
    });

    it('走的是幂曲线而不是直线：中点处的强度等于归一化中点取幂', () => {
        const mid = (STRETCH_MIN_SPEED + SPEED_FOR_FULL_STRETCH) / 2;
        expect(stretchAmountFromSpeed(mid)).toBeCloseTo(0.5 ** STRETCH_CURVE_POWER, 6);
        // 曲线指数 < 1 时，过门槛后先起得快，中点强度高于线性的 0.5
        if (STRETCH_CURVE_POWER < 1) {
            expect(stretchAmountFromSpeed(mid)).toBeGreaterThan(0.5);
        }
    });

    it('非有限速度按不变形处理', () => {
        expect(stretchAmountFromSpeed(Number.NaN)).toBe(0);
    });

    it('强度带方向符号：向左为负、大小与同速向右相同', () => {
        const right = stretchAmountFromSpeed(SPEED_FOR_FULL_STRETCH);
        const left = stretchAmountFromSpeed(-SPEED_FOR_FULL_STRETCH);
        expect(right).toBeGreaterThan(0);
        expect(left).toBe(-right);

        const midSpeed = (STRETCH_MIN_SPEED + SPEED_FOR_FULL_STRETCH) / 2;
        expect(stretchAmountFromSpeed(-midSpeed)).toBeCloseTo(-stretchAmountFromSpeed(midSpeed), 12);
    });

    it('向左拖的速度低于门槛同样不变形', () => {
        expect(stretchAmountFromSpeed(-STRETCH_MIN_SPEED)).toBe(0);
        expect(stretchAmountFromSpeed(-(STRETCH_MIN_SPEED - 1))).toBe(0);
    });
});

describe('thumbStretch 拖动中的触边规则', () => {
    it('不触边时为正：宽度拉长、高度压扁，左右拖都一样', () => {
        const right = stretchAmountForDrag(SPEED_FOR_FULL_STRETCH, false);
        const left = stretchAmountForDrag(-SPEED_FOR_FULL_STRETCH, false);
        expect(right).toBeCloseTo(1, 6);
        expect(left).toBeCloseTo(1, 6);
        expect(left).toBe(right);
    });

    it('触边时为负：宽度缩短、高度拉长，左右拖都一样', () => {
        const right = stretchAmountForDrag(SPEED_FOR_FULL_STRETCH, true);
        const left = stretchAmountForDrag(-SPEED_FOR_FULL_STRETCH, true);
        expect(right).toBeCloseTo(-1, 6);
        expect(left).toBeCloseTo(-1, 6);
        expect(left).toBe(right);
    });

    it('符号只由触边决定，与拖动方向无关', () => {
        const mid = (STRETCH_MIN_SPEED + SPEED_FOR_FULL_STRETCH) / 2;
        for (const speed of [mid, -mid, SPEED_FOR_FULL_STRETCH, -SPEED_FOR_FULL_STRETCH]) {
            expect(Math.sign(stretchAmountForDrag(speed, false))).toBe(1);
            expect(Math.sign(stretchAmountForDrag(speed, true))).toBe(-1);
        }
    });

    it('幅度仍然来自速度：没过门槛一律不变形，触边也不例外', () => {
        expect(stretchAmountForDrag(0, true)).toBe(0);
        expect(stretchAmountForDrag(STRETCH_MIN_SPEED, true)).toBe(0);
        expect(stretchAmountForDrag(-(STRETCH_MIN_SPEED - 1), false)).toBe(0);
        expect(stretchAmountForDrag(Number.NaN, true)).toBe(0);
    });

    it('触边与否的幅度相同，只是符号相反', () => {
        const mid = (STRETCH_MIN_SPEED + SPEED_FOR_FULL_STRETCH) / 2;
        expect(stretchAmountForDrag(mid, true)).toBeCloseTo(-stretchAmountForDrag(mid, false), 12);
    });
});

describe('thumbStretch 触边判定', () => {
    it('贴在两端算触边', () => {
        expect(isThumbAtEdge(0, 300)).toBe(true);
        expect(isThumbAtEdge(300, 300)).toBe(true);
    });

    it('落在中间不算触边', () => {
        expect(isThumbAtEdge(150, 300)).toBe(false);
        expect(isThumbAtEdge(1.5, 300)).toBe(false);
        expect(isThumbAtEdge(298.4, 300)).toBe(false);
    });

    it('半像素容差：恰好压线的浮点误差仍算触边', () => {
        expect(isThumbAtEdge(0.4, 300)).toBe(true);
        expect(isThumbAtEdge(299.7, 300)).toBe(true);
    });

    it('轨道放不下一根摇杆时（上界为 0）始终算触边', () => {
        expect(isThumbAtEdge(0, 0)).toBe(true);
        expect(isThumbAtEdge(0, -5)).toBe(true);
    });
});
