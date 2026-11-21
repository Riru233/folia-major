import type React from 'react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { animate, useMotionValue, useMotionValueEvent, useSpring, useTransform } from 'framer-motion';
import {
    SPEED_SAMPLE_MIN_MS,
    SPEED_SMOOTHING,
    STRETCH_IDLE_MS,
    STRETCH_RETURN_EASE,
    STRETCH_RETURN_SECONDS,
    STRETCH_SPRING,
    isThumbAtEdge,
    stretchAmountForDrag,
    stretchAmountFromSpeed,
} from './thumbStretch';

// src/library/suites/grid/home/useNavTabThumb.ts
// 浮层导航的摇杆。逻辑逐条照搬页头那颗摇杆（useHomeTabThumb）：同一组弹簧、同一套「按下吸附 / 拖到阈值
// 才夺指针 / 松手吸附最近项 / 停稳一拍再切页签 / 速度形变」的时序，只把它从「只能横着」推广成
// 「沿任意一条轴排」，因为浮层导航宽松档是竖排的。
//
// 与页头那版的三处差别，都是浮层导航本身带来的：
//   1) 一条轴只排一行（列）项，所以位置只要「沿轴位置 + 沿轴尺寸」，次轴尺寸另存一个（次轴永远居中）。
//   2) 导航自己会滚（横条横滚、竖栏超过 70vh 竖滚）：滚动量要从摇杆位置里减掉，否则内容一动摇杆就偏。
//   3) 里头的格子只有五六十像素，页头那组 0.1 / 0.3 的形变比例在这么小的盒子上看不出方向，
//      所以沿轴拉到 0.3、次轴压到 0.24，两条轴的幅度接近，拉长/压扁一眼能辨。
//
// 摇杆是「放在导航栏上面的一块透镜」：层级压在日常项之上（拖起来时再抬高到盖住文字），
// 但页签文字自己带更高的层级，静止时不会被透镜糊掉。

export interface NavTabThumbItem<K extends string = string> {
    key: K;
    disabled: boolean;
}

interface UseNavTabThumbOptions<K extends string> {
    /** 直接子级里带 `[data-home-tab]` 的容器：位置都相对它量。 */
    trackRef: React.RefObject<HTMLElement | null>;
    items: NavTabThumbItem<K>[];
    /** 当前选中项的 key；没有选中（扩展页签接管）时传空串，摇杆就停在第一项。 */
    activeKey: K | '';
    onActivate: (key: K) => void;
}

/** 一条弹簧驱动所有滑行：中途改目标会带着当前速度接着走，连点不会「重新飞一遍」。 */
const THUMB_SPRING = { stiffness: 320, damping: 32, mass: 0.9 } as const;
/** 按住时放大到几倍（与页头摇杆一致）。 */
const DRAG_SCALE = 2;
const DRAG_SCALE_SPRING = { stiffness: 500, damping: 30 } as const;
/** 越过这个位移才算拖动：没越过就仍是点击，页签自己的 click 照常触发。 */
const TAP_MOVE_THRESHOLD_PX = 4;
/** 松手吸附到位后等这样一拍再切页签：来回拖动时不会连发切页。 */
const ACTIVATE_SETTLE_DELAY_MS = 150;
/** 沿拖动轴拉长 / 次轴压扁的比例（未触底；触底时符号反过来）。 */
const STRETCH_ALONG = 0.3;
const STRETCH_CROSS = 0.24;

const prefersReducedMotion = () => (
    typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
);

export const useNavTabThumb = <K extends string>({
    trackRef,
    items,
    activeKey,
    onActivate,
    axis,
}: UseNavTabThumbOptions<K> & { axis: 'x' | 'y' }) => {
    const vertical = axis === 'y';

    // 基准盒子：沿轴位置、沿轴尺寸、次轴尺寸。跟放大/形变完全解耦，几何换算只认这三个值。
    const thumbPos = useSpring(0, THUMB_SPRING);
    const thumbSize = useSpring(0, THUMB_SPRING);
    const thumbCross = useSpring(0, THUMB_SPRING);
    // 按住时的基础放大（1 → DRAG_SCALE）与速度形变强度（-1 → 1）分开存，相乘得到两个轴的比例。
    const dragScale = useSpring(1, DRAG_SCALE_SPRING);
    const stretchTarget = useMotionValue(0);
    const stretch = useSpring(stretchTarget, STRETCH_SPRING);
    const alongRatio = useTransform([dragScale, stretch], ([grow, amount]: number[]) => (
        grow * (1 + amount * STRETCH_ALONG)
    ));
    const crossRatio = useTransform([dragScale, stretch], ([grow, amount]: number[]) => (
        grow * (1 - amount * STRETCH_CROSS)
    ));
    // 尺寸直接写进 style（不走 transform: scale），圆角与玻璃位移图才不会被拉歪。
    const boxAlong = useTransform([thumbSize, alongRatio], ([base, ratio]: number[]) => base * ratio);
    const boxCross = useTransform([thumbCross, crossRatio], ([base, ratio]: number[]) => base * ratio);
    // 沿轴：中心锚点（多出来的那一半往回补），再减掉滚动量。
    const scrollPos = useMotionValue(0);
    const boxAlongPos = useTransform(
        [thumbPos, thumbSize, boxAlong, scrollPos],
        ([pos, base, box, scroll]: number[]) => pos - (box - base) / 2 - scroll,
    );
    // 次轴：永远压在这条轴的中心线上（居中放大），与项自身的位置、尺寸无关。
    const crossCenter = useMotionValue(0);
    const boxCrossPos = useTransform([crossCenter, boxCross], ([center, box]: number[]) => center - box / 2);

    const boxLeft = vertical ? boxCrossPos : boxAlongPos;
    const boxTop = vertical ? boxAlongPos : boxCrossPos;
    const boxWidth = vertical ? boxCross : boxAlong;
    const boxHeight = vertical ? boxAlong : boxCross;

    const [dragging, setDragging] = useState(false);
    // 第一次量到尺寸之前不画摇杆：0 宽的方块在左上角闪一下很难看。
    const [ready, setReady] = useState(false);

    type Entry = { pos: number; size: number; cross: number };
    const layoutRef = useRef<Entry[]>([]);
    const draggingRef = useRef(false);
    const positionedRef = useRef(false);
    const trackStartRef = useRef(0);
    const trackScaleRef = useRef(1);
    const gestureRef = useRef<{ pointerId: number; start: number; moved: boolean } | null>(null);
    const stretchSampleRef = useRef<{ pos: number; t: number } | null>(null);
    const stretchSpeedRef = useRef(0);
    const stretchIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const stretchReturnRef = useRef<{ stop: () => void } | null>(null);
    const stretchAllowedRef = useRef(true);
    const itemsRef = useRef(items);
    const activeKeyRef = useRef(activeKey);
    itemsRef.current = items;
    activeKeyRef.current = activeKey;

    const pendingActivationRef = useRef<{
        timer: ReturnType<typeof setTimeout> | null;
        unsubscribe?: VoidFunction;
    } | null>(null);

    const cancelPendingActivation = useCallback(() => {
        const pending = pendingActivationRef.current;
        if (!pending) return;
        if (pending.timer !== null) clearTimeout(pending.timer);
        pending.unsubscribe?.();
        pendingActivationRef.current = null;
    }, []);

    useEffect(() => cancelPendingActivation, [cancelPendingActivation]);

    const activeIndex = Math.max(0, items.findIndex(item => item.key === activeKey));
    const itemsSignature = items.map(item => `${item.key}:${item.disabled ? 1 : 0}`).join('|');

    const measure = useCallback(() => {
        const track = trackRef.current;
        if (!track) return;
        const buttons = Array.from(track.querySelectorAll<HTMLElement>('[data-home-tab]'));
        // 轨道上方可能还有别的行（比如搬进来的设置按钮）：按钮的 offsetTop / offsetLeft 是相对轨道的，
        // 而摇杆绝对定位在导航容器里，所以要把轨道自己的偏移补上，否则整块摇杆会少算一截。
        const trackOffset = vertical ? track.offsetTop : track.offsetLeft;
        layoutRef.current = buttons.map(button => ({
            pos: trackOffset + (vertical ? button.offsetTop : button.offsetLeft),
            size: vertical ? button.offsetHeight : button.offsetWidth,
            cross: vertical ? button.offsetWidth : button.offsetHeight,
        }));
        // 次轴中心取滚动区的中心（offsetLeft / offsetTop 与按钮的 offsetLeft / offsetTop 同一坐标系）。
        crossCenter.set(vertical
            ? track.offsetLeft + track.clientWidth / 2
            : track.offsetTop + track.clientHeight / 2);
    }, [crossCenter, trackRef, vertical]);

    // 导航内部滚动时把滚动量记下来：摇杆是绝对定位的，内容动了它得跟着动。
    useEffect(() => {
        const track = trackRef.current;
        if (!track) return undefined;
        const sync = () => scrollPos.set(vertical ? track.scrollTop : track.scrollLeft);
        track.addEventListener('scroll', sync, { passive: true });
        sync();
        return () => track.removeEventListener('scroll', sync);
    }, [scrollPos, trackRef, vertical]);

    /** 滑到某一项：第一次直接落位，之后交给弹簧（中途改目标会带速度接着走）。 */
    const glideToIndex = useCallback((index: number) => {
        if (layoutRef.current.length === 0) return;
        const entry = layoutRef.current[Math.min(index, layoutRef.current.length - 1)];
        if (!positionedRef.current) {
            thumbPos.jump(entry.pos);
            thumbSize.jump(entry.size);
            thumbCross.jump(entry.cross);
            positionedRef.current = true;
            setReady(true);
            return;
        }
        thumbPos.set(entry.pos);
        thumbSize.set(entry.size);
        thumbCross.set(entry.cross);
    }, [thumbCross, thumbPos, thumbSize]);

    const armActivationAfterSettle = useCallback((key: K) => {
        cancelPendingActivation();
        const pending: { timer: ReturnType<typeof setTimeout> | null; unsubscribe?: VoidFunction } = { timer: null };
        pendingActivationRef.current = pending;
        const startCountdown = () => {
            if (pendingActivationRef.current !== pending) return;
            pending.timer = setTimeout(() => {
                if (pendingActivationRef.current !== pending) return;
                pendingActivationRef.current = null;
                if (draggingRef.current) return;
                if (key !== activeKeyRef.current) onActivate(key);
            }, ACTIVATE_SETTLE_DELAY_MS);
        };
        if (thumbPos.isAnimating()) {
            pending.unsubscribe = thumbPos.on('animationComplete', () => {
                pending.unsubscribe?.();
                pending.unsubscribe = undefined;
                startCountdown();
            });
        } else {
            startCountdown();
        }
    }, [cancelPendingActivation, onActivate, thumbPos]);

    useLayoutEffect(() => {
        measure();
        if (!draggingRef.current) glideToIndex(activeIndex);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- itemsSignature 已经把 items 的 key / disabled 变化算进来，依赖数组里不需要 items 本体
    }, [measure, itemsSignature, vertical]);

    // 字号、标签宽度、折行变化都要重量（当前项切粗体会改变宽度，直接 set 会打断吸附弹簧）。
    useEffect(() => {
        const track = trackRef.current;
        if (!track || typeof ResizeObserver === 'undefined') return undefined;
        const observer = new ResizeObserver(() => {
            measure();
            if (draggingRef.current) return;
            glideToIndex(Math.max(0, itemsRef.current.findIndex(item => item.key === activeKeyRef.current)));
        });
        observer.observe(track);
        track.querySelectorAll('[data-home-tab]').forEach(button => observer.observe(button));
        return () => observer.disconnect();
    }, [glideToIndex, measure, itemsSignature, trackRef]);

    // 选中项变了（点击、键盘、宿主切页签）：先重量再滑——当前项切粗体会让整行重排，
    // 用过期的盒子会从错误的位置起步。
    useLayoutEffect(() => {
        if (draggingRef.current) return;
        measure();
        glideToIndex(activeIndex);
    }, [activeIndex, measure, glideToIndex]);

    const posBounds = useCallback((): { min: number; max: number } => {
        const layout = layoutRef.current;
        if (layout.length === 0) return { min: 0, max: Number.POSITIVE_INFINITY };
        const last = layout[layout.length - 1];
        return { min: 0, max: Math.max(0, last.pos + last.size - thumbSize.get()) };
    }, [thumbSize]);

    const pointerTarget = useCallback((clientAlong: number): { pos: number; max: number } => {
        const scale = trackScaleRef.current || 1;
        const local = (clientAlong - trackStartRef.current) / scale;
        const { max } = posBounds();
        const raw = local - thumbSize.get() / 2;
        return { pos: Math.max(0, Math.min(max, raw)), max };
    }, [posBounds, thumbSize]);

    const pointerTargetPos = useCallback((clientAlong: number) => pointerTarget(clientAlong).pos, [pointerTarget]);

    const nearestTabIndex = useCallback((center: number) => {
        const layout = layoutRef.current;
        let best = -1;
        let bestDistance = Number.POSITIVE_INFINITY;
        for (let index = 0; index < layout.length; index += 1) {
            if (itemsRef.current[index].disabled) continue;
            const tabCenter = layout[index].pos + layout[index].size / 2;
            const distance = Math.abs(tabCenter - center);
            if (distance < bestDistance) {
                bestDistance = distance;
                best = index;
            }
        }
        return best >= 0 ? best : Math.max(0, layout.length - 1);
    }, []);

    const clearStretchIdleTimer = useCallback(() => {
        if (stretchIdleTimerRef.current !== null) {
            clearTimeout(stretchIdleTimerRef.current);
            stretchIdleTimerRef.current = null;
        }
    }, []);

    const settleStretch = useCallback(() => {
        clearStretchIdleTimer();
        stretchReturnRef.current?.stop();
        stretchSpeedRef.current = 0;
        stretchReturnRef.current = animate(stretchTarget, 0, {
            duration: STRETCH_RETURN_SECONDS,
            ease: STRETCH_RETURN_EASE,
        });
    }, [clearStretchIdleTimer, stretchTarget]);

    const applyStretch = useCallback((amount: number) => {
        stretchReturnRef.current?.stop();
        stretchReturnRef.current = null;
        stretchTarget.set(amount);
        clearStretchIdleTimer();
        stretchIdleTimerRef.current = setTimeout(settleStretch, STRETCH_IDLE_MS);
    }, [clearStretchIdleTimer, settleStretch, stretchTarget]);

    // 不拖动时的滑行（点页签、松手吸附、重新测量）也带形变：没有指针速度可采，就用摇杆自身的速度，
    // 符号沿用滑行方向。静止时这段监听不产生任何工作。
    useMotionValueEvent(thumbPos, 'change', () => {
        if (draggingRef.current) return;
        if (prefersReducedMotion()) return;
        applyStretch(stretchAmountFromSpeed(thumbPos.getVelocity()));
    });

    const sampleStretchSpeed = useCallback((pos: number, timeStamp: number, atEdge: boolean) => {
        const sample = stretchSampleRef.current;
        if (!sample) {
            stretchSampleRef.current = { pos, t: timeStamp };
            return;
        }
        const dt = timeStamp - sample.t;
        if (dt < SPEED_SAMPLE_MIN_MS) return;
        const instantSpeed = ((pos - sample.pos) / dt) * 1000;
        stretchSpeedRef.current = stretchSpeedRef.current * SPEED_SMOOTHING
            + instantSpeed * (1 - SPEED_SMOOTHING);
        stretchSampleRef.current = { pos, t: timeStamp };
        applyStretch(stretchAmountForDrag(stretchSpeedRef.current, atEdge));
    }, [applyStretch]);

    useEffect(() => () => {
        stretchReturnRef.current?.stop();
        stretchReturnRef.current = null;
        if (stretchIdleTimerRef.current !== null) clearTimeout(stretchIdleTimerRef.current);
    }, []);

    // 按下：摇杆平滑滑到指针下面并放大。此刻不夺指针、不阻止默认，纯点击仍会走页签自己的 click。
    const handlePointerDown = useCallback((event: React.PointerEvent<HTMLElement>) => {
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        if (gestureRef.current) return;
        cancelPendingActivation();
        draggingRef.current = true;
        setDragging(true);
        const track = trackRef.current;
        const rect = track?.getBoundingClientRect();
        trackStartRef.current = (vertical ? rect?.top : rect?.left) ?? 0;
        trackScaleRef.current = track && rect
            ? (vertical
                ? (track.offsetHeight > 0 ? rect.height / track.offsetHeight : 1)
                : (track.offsetWidth > 0 ? rect.width / track.offsetWidth : 1))
            : 1;
        const along = vertical ? event.clientY : event.clientX;
        gestureRef.current = { pointerId: event.pointerId, start: along, moved: false };
        thumbPos.set(pointerTargetPos(along));
        dragScale.set(DRAG_SCALE);
        stretchAllowedRef.current = !prefersReducedMotion();
        if (!stretchAllowedRef.current) return;
        clearStretchIdleTimer();
        stretchSpeedRef.current = 0;
        stretchSampleRef.current = { pos: along, t: event.timeStamp };
    }, [cancelPendingActivation, clearStretchIdleTimer, dragScale, pointerTargetPos, thumbPos, trackRef, vertical]);

    // 越过阈值才算真正拖动：这时才夺指针并阻止默认（否则页签的 click 会被吞掉）。
    const handlePointerMove = useCallback((event: React.PointerEvent<HTMLElement>) => {
        const gesture = gestureRef.current;
        if (!gesture || gesture.pointerId !== event.pointerId) return;
        const along = vertical ? event.clientY : event.clientX;
        if (!gesture.moved && Math.abs(along - gesture.start) > TAP_MOVE_THRESHOLD_PX) {
            gesture.moved = true;
            event.currentTarget.setPointerCapture(event.pointerId);
            event.preventDefault();
        }
        // 跟手用 jump（即时响应、不引入弹簧滞后），松手吸附才交给弹簧。
        const target = pointerTarget(along);
        thumbPos.jump(target.pos);
        if (gesture.moved && stretchAllowedRef.current) {
            sampleStretchSpeed(along, event.timeStamp, isThumbAtEdge(target.pos, target.max));
        }
    }, [pointerTarget, sampleStretchSpeed, thumbPos, vertical]);

    const endDrag = useCallback((event: React.PointerEvent<HTMLElement>) => {
        const gesture = gestureRef.current;
        if (!gesture || gesture.pointerId !== event.pointerId) return;
        gestureRef.current = null;
        draggingRef.current = false;
        setDragging(false);
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
        }
        dragScale.set(1);
        settleStretch();
        stretchSampleRef.current = null;

        // 用松手时的指针位置取最近项：纯点击时吸附动画才刚开始，用当前 thumbPos 取整会选错。
        const along = vertical ? event.clientY : event.clientX;
        const center = pointerTargetPos(along) + thumbSize.get() / 2;
        const target = nearestTabIndex(center);
        glideToIndex(target);
        const key = itemsRef.current[target]?.key;
        if (key && key !== activeKeyRef.current) armActivationAfterSettle(key);
    }, [armActivationAfterSettle, dragScale, glideToIndex, nearestTabIndex, pointerTargetPos, settleStretch, thumbSize, vertical]);

    // 在导航外松手、拖出窗口、切走窗口：pointerup 不一定派发到这里，这里只负责收摊（不切页签）。
    useEffect(() => {
        if (!dragging) return undefined;
        const release = (event: Event) => {
            const gesture = gestureRef.current;
            if (!gesture) return;
            if (event instanceof PointerEvent && event.pointerId !== gesture.pointerId) return;
            gestureRef.current = null;
            draggingRef.current = false;
            stretchSampleRef.current = null;
            setDragging(false);
            dragScale.set(1);
            settleStretch();
        };
        window.addEventListener('pointerup', release);
        window.addEventListener('pointercancel', release);
        window.addEventListener('blur', release);
        return () => {
            window.removeEventListener('pointerup', release);
            window.removeEventListener('pointercancel', release);
            window.removeEventListener('blur', release);
        };
    }, [dragging, dragScale, settleStretch]);

    return {
        thumbDragging: dragging,
        thumbBoxLeft: boxLeft,
        thumbBoxTop: boxTop,
        thumbBoxWidth: boxWidth,
        thumbBoxHeight: boxHeight,
        /** 第一次量到尺寸之前不画摇杆：0 宽的方块在左上角闪一下很难看。 */
        thumbReady: ready,
        thumbHandlers: {
            onPointerDown: handlePointerDown,
            onPointerMove: handlePointerMove,
            onPointerUp: endDrag,
            onPointerCancel: endDrag,
        },
    };
};
