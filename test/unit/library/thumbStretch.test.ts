// test/unit/library/thumbStretch.test.ts
// Grid3D 摇杆速度形变的「速度 → 强度」曲线：门槛以下不变形、区间内按幂曲线上升、满速封顶，
// 强度带方向符号（右为正、左为负），同一速度向左向右大小相同、符号相反。
import { describe, expect, it } from 'vitest';
import {
    SPEED_FOR_FULL_STRETCH,
    STRETCH_CURVE_POWER,
    STRETCH_MIN_SPEED,
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
