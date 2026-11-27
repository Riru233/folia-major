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
    STRETCH_X,
    STRETCH_Y,
    isThumbAtEdge,
    stretchAmountForDrag,
    stretchAmountFromSpeed,
} from './thumbStretch';

// src/library/suites/grid/home/useHomeTabThumb.ts
// iOS-style active-tab thumb for the Grid3D center tab switcher. The thumb is a single element
// living outside the buttons. Pressing anywhere on the switcher track makes the thumb glide under
// the pointer, follow it freely while held, then on release spring onto the nearest tab by rounded
// centre distance (that tab becomes active). Every reposition that is not a live drag is animated
// through the same persistent spring, including the ResizeObserver re-measure, so the thumb never
// jumps. Because that spring retargets in place, a new target landing mid-flight (fast clicks)
// steers the running generator with its own velocity instead of restarting — the motion stays
// interruptible, which is what keeps rapid clicks from making the thumb appear to fly in.
// Continuous motion stays in MotionValues; the only React state written while dragging is the
// discrete active-tab change made on release. Pointer capture is taken only once a real drag starts,
// so a plain tap still lets the button's click fire normally.

export interface HomeTabThumbItem<K extends string = string> {
    key: K;
    disabled: boolean;
}

interface UseHomeTabThumbOptions<K extends string> {
    /** Element whose direct children are the tab buttons; positions are measured against it. */
    trackRef: React.RefObject<HTMLElement | null>;
    items: HomeTabThumbItem<K>[];
    activeKey: K;
    onActivate: (key: K) => void;
    /** Invoked when the track is tapped without dragging. */
    onTapActive?: () => void;
}

// One spring drives every glide. Because it is a persistent spring (not a one-shot animation),
// re-targeting mid-flight steers the running generator with its analytical velocity, so rapid
// re-targets (fast clicks, resize, drag release) stay velocity-continuous instead of restarting.
const THUMB_SPRING = { stiffness: 320, damping: 32, mass: 0.9 } as const;
const DRAG_SCALE = 2;
// 按住时把基准盒子放大到 DRAG_SCALE 倍用的弹簧（现在放大落在 width / height 上，不再是 scale）。
const DRAG_SCALE_SPRING = { stiffness: 500, damping: 30 } as const;
const TAP_MOVE_THRESHOLD_PX = 4;
// 拖动时的速度形变（squash & stretch）的全部参数在 ./thumbStretch.ts，这里只负责采样和写入。
// 松手把摇杆吸附到最近页签后不立刻切页面：等摇杆真的停下再等这样一拍，来回拖动时松手就不会
// 连发页面切换、把界面顶得卡顿。吸附弹簧本身仍可被下一次按下随时打断（见 handlePointerDown）。
const ACTIVATE_SETTLE_DELAY_MS = 150;

const activeKeyToIndex = <K extends string>(items: HomeTabThumbItem<K>[], key: K) => {
    const index = items.findIndex(item => item.key === key);
    return index < 0 ? 0 : index;
};

// 系统开了「减少动态效果」时不做速度形变（与 data-glass-jelly 的判断一致），只保留按住放大。
const prefersReducedMotion = () => (
    typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
);

export const useHomeTabThumb = <K extends string>({
    trackRef,
    items,
    activeKey,
    onActivate,
    onTapActive,
}: UseHomeTabThumbOptions<K>) => {
    // Persistent springs: continuous motion stays in MotionValues, and because these follow-values
    // retarget in place, every non-drag reposition is interruptible and keeps its velocity. `jump`
    // is used only for a true teleport (first placement, live drag) where no animation is wanted.
    // 摇杆的「基准盒子」：未放大、未形变时的位置与尺寸，所有手势与吸附几何（指针换算、边界钳制、
    // 最近页签）都只认这三个值，跟放大/形变完全解耦。三个都是弹簧：切换页签、重新测量、松手吸附时
    // 一起平滑滑到新盒子。宽度和高度现在直接写进 style（不再走 transform: scale），所以高度也必须
    // 从轨道量出来（见 measure），不能再靠 top-0 bottom-0 白拿。
    const thumbLeft = useSpring(0, THUMB_SPRING);
    const thumbWidth = useSpring(0, THUMB_SPRING);
    const thumbHeight = useSpring(0, THUMB_SPRING);
    // 整条轨道的内容宽度：大类切换时页签集合变多/变少，外层胶囊容器据此平滑改宽度，
    // 不再瞬间跳变。与摇杆共用同一组弹簧参数，两者节奏一致。
    const trackWidth = useSpring(0, THUMB_SPRING);
    // 按住时的基础缩放（1 → DRAG_SCALE）与速度形变强度（0 → 1）分开存，相乘后得到两个轴的比例：
    // 松手时基础缩放回到 1、形变同时收回 0，两段互不干扰。这些都是 MotionValue，拖动期间不触发 React 重渲染。
    const dragScale = useSpring(1, DRAG_SCALE_SPRING);
    // 速度算出来的目标形变（0 → 1）先写进 stretchTarget，再由 stretch 这个弹簧追上去：
    // 拖动时形变因此有迟滞和轻微过冲，像被手指拖着甩的对象，而不是硬贴着速度缩放。
    const stretchTarget = useMotionValue(0);
    const stretch = useSpring(stretchTarget, STRETCH_SPRING);
    const widthRatio = useTransform([dragScale, stretch], ([grow, amount]: number[]) => (
        grow * (1 + amount * STRETCH_X)
    ));
    const heightRatio = useTransform([dragScale, stretch], ([grow, amount]: number[]) => (
        grow * (1 - amount * STRETCH_Y)
    ));
    // 上面两个比例不进 transform，而是直接乘到宽高上——摇杆靠 width / height 长大和形变。
    // 锚点是摇杆中心：宽了就把 left 往回补「多出来的宽度的一半」，高了一样把 top 补「多出来高度的一半」，
    // 于是中心恒在 thumbLeft + 基准宽/2、基准高/2 上不动，只有两条边对称地往外/往里跑。
    const thumbBoxWidth = useTransform([thumbWidth, widthRatio], ([base, ratio]: number[]) => base * ratio);
    const thumbBoxHeight = useTransform([thumbHeight, heightRatio], ([base, ratio]: number[]) => base * ratio);
    const thumbBoxLeft = useTransform([thumbLeft, thumbWidth, thumbBoxWidth], ([left, base, box]: number[]) => (
        left - (box - base) / 2
    ));
    const thumbBoxTop = useTransform([thumbHeight, thumbBoxHeight], ([base, box]: number[]) => (base - box) / 2);
    const [dragging, setDragging] = useState(false);

    const layoutRef = useRef<{ left: number; width: number }[]>([]);
    const draggingRef = useRef(false);
    const positionedRef = useRef(false);
    // Viewport transform of the track, cached on press so dragging never reads layout per move.
    // The switcher is CSS-scaled (scale-90 / scale-100), so client px must be divided by the scale
    // to land in the buttons' own layout space where thumbLeft/offsetLeft live.
    const trackRectLeftRef = useRef(0);
    const trackScaleRef = useRef(1);
    // 轨道高度（摇杆基准盒子的高度）。各页签同高，所以只存一个数，不跟 left/width 一起进 layout 数组。
    const trackHeightRef = useRef(0);
    // Live pointer gesture: stays null when idle. `moved` flips true past the tap threshold.
    const gestureRef = useRef<{ pointerId: number; startX: number; moved: boolean } | null>(null);
    // 拖动中的指针位置（clientX）。宽度弹簧跟着指针所在页签变时，用它把摇杆中心重新钉回指针下，
    // 不然弹簧改宽而 left 只在 pointermove 时更新，停住不动的那一帧中心会漂。
    const dragPointerXRef = useRef<number | null>(null);
    // 形变的采样状态：上一次采样的位置/时间、平滑后的横向速度、停止计时器与正在跑的收回动画。
    const stretchSampleRef = useRef<{ x: number; t: number } | null>(null);
    const stretchSpeedRef = useRef(0);
    const stretchIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const stretchReturnRef = useRef<{ stop: () => void } | null>(null);
    // 这一轮手势是否做速度形变（按「减少动态效果」在按下时决定）。
    const stretchAllowedRef = useRef(true);
    // Mirror volatile inputs into refs so measuring/dragging never has to depend on array identity.
    const itemsRef = useRef(items);
    const activeKeyRef = useRef(activeKey);
    itemsRef.current = items;
    activeKeyRef.current = activeKey;

    // 松手后待处理的页面切换：摇杆停稳再等 ACTIVATE_SETTLE_DELAY_MS 才真正换页签。新的一次按下会取消它，
    // 所以吸附弹簧的打断不受影响。
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

    // 卸载时别把待处理的切换留着。
    useEffect(() => cancelPendingActivation, [cancelPendingActivation]);

    const activeIndex = Math.max(0, items.findIndex(item => item.key === activeKey));
    // Stable signature: re-measure only when the tab set or enabled state changes, not on re-render.
    const itemsSignature = items.map(item => `${item.key}:${item.disabled ? 1 : 0}`).join('|');

    const measure = useCallback(() => {
        const track = trackRef.current;
        if (!track) return;
        const buttons = Array.from(track.querySelectorAll<HTMLElement>('[data-home-tab]'));
        layoutRef.current = buttons.map(button => ({ left: button.offsetLeft, width: button.offsetWidth }));
        // 摇杆高度 = 轨道高度：所有页签一样高，宽度按页签量、高度整条轨道一个值。
        trackHeightRef.current = track.offsetHeight;
        // 轨道的自然内容宽度（页签 right 的最大值）：外层胶囊容器拿它改宽度。用 set 而非 jump，
        // 大类切换导致页签集合变化时容器宽度平滑过渡；首次定位时 jump，避免从 0 滑入。
        const contentWidth = layoutRef.current.reduce((right, entry) => Math.max(right, entry.left + entry.width), 0);
        if (contentWidth > 0) {
            if (!positionedRef.current || prefersReducedMotion()) trackWidth.jump(contentWidth);
            else trackWidth.set(contentWidth);
        }
    }, [trackRef, trackWidth]);

    // Glide onto a tab's measured box; used by every non-drag reposition so motion stays smooth.
    const glideToIndex = useCallback((index: number) => {
        const entry = layoutRef.current[Math.min(index, layoutRef.current.length - 1)];
        if (!entry) return;
        const height = trackHeightRef.current;
        if (!positionedRef.current) {
            // First placement has nothing to glide from: teleport so the thumb never slides in
            // from the wrong spot on mount.
            thumbLeft.jump(entry.left);
            thumbWidth.jump(entry.width);
            thumbHeight.jump(height);
            positionedRef.current = true;
            return;
        }
        // set() on a spring-backed value retargets the running spring in place (velocity-preserving),
        // which is what makes rapid clicks interruptible rather than restarting from scratch.
        thumbLeft.set(entry.left);
        thumbWidth.set(entry.width);
        // 高度通常在切页签/重测时并不变，set 同一个目标值不会产生运动，所以可以无条件写。
        thumbHeight.set(height);
    }, [thumbHeight, thumbLeft, thumbWidth]);

    // 摇杆吸附停稳后再延一拍才换页签；期间任何一次新的拖动/吸附都会让这次切换作废。
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
        // 摇杆还在弹就等它停下再计时；已经停在目标上就直接计时。
        if (thumbLeft.isAnimating()) {
            pending.unsubscribe = thumbLeft.on('animationComplete', () => {
                pending.unsubscribe?.();
                pending.unsubscribe = undefined;
                startCountdown();
            });
        } else {
            startCountdown();
        }
    }, [cancelPendingActivation, onActivate, thumbLeft]);

    // Re-measure on mount and whenever the tab set changes, snapping straight onto the active tab.
    useLayoutEffect(() => {
        measure();
        if (!draggingRef.current) glideToIndex(activeIndex);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [measure, itemsSignature]);

    // Font/label width drift (bold active label, resize) re-measures. Animating here instead of
    // setting directly matters: the active tab turning bold resizes it, and a direct set would cancel
    // the release snap and make it look instant.
    useEffect(() => {
        const track = trackRef.current;
        if (!track || typeof ResizeObserver === 'undefined') return;
        const observer = new ResizeObserver(() => {
            measure();
            if (draggingRef.current) return;
            glideToIndex(activeKeyToIndex(itemsRef.current, activeKeyRef.current));
        });
        observer.observe(track);
        track.querySelectorAll('[data-home-tab]').forEach(button => observer.observe(button));
        return () => observer.disconnect();
    }, [measure, trackRef, itemsSignature, glideToIndex]);

    // Glide onto the active tab when the selection changes from a click, keyboard or the host.
    // Measure first: the active tab flipping to bold reflows the row, so without a fresh read the
    // glide would target the pre-reflow box and the thumb would dart from a wrong spot before the
    // ResizeObserver corrected it (visible as "flying in" on rapid clicks).
    useLayoutEffect(() => {
        if (draggingRef.current) return;
        measure();
        glideToIndex(activeIndex);
    }, [activeIndex, measure, glideToIndex]);

    // 轨道两端在「摇杆 left」上的取值范围。触边判定与钳制共用这一份，免得两处各算一遍算出不同的端点。
    const leftBounds = useCallback((): { min: number; max: number } => {
        const layout = layoutRef.current;
        if (layout.length === 0) return { min: 0, max: Number.POSITIVE_INFINITY };
        const last = layout[layout.length - 1];
        return { min: 0, max: Math.max(0, last.left + last.width - thumbWidth.get()) };
    }, [thumbWidth]);

    // 指针位置换算进容器自身布局坐标（兼容 scale-90），得到摇杆「中心对齐指针」的 left 目标。
    // 同时把钳制后的 left 与上界一起交出去：拖动中判断「有没有触边」要用这两个值，
    // 用钳制后的而不是原始指针位置——指针拖出轨道之后 left 不再变化，那正是顶住的状态。
    const pointerTarget = useCallback((clientX: number): { left: number; max: number } => {
        const scale = trackScaleRef.current || 1;
        const localX = (clientX - trackRectLeftRef.current) / scale;
        const { max } = leftBounds();
        const rawLeft = localX - thumbWidth.get() / 2;
        return { left: Math.max(0, Math.min(max, rawLeft)), max };
    }, [leftBounds, thumbWidth]);

    const pointerTargetLeft = useCallback((clientX: number) => pointerTarget(clientX).left, [pointerTarget]);

    // 释放时按「摇杆中心到各可用页签中心的距离」四舍五入取最近的一个。
    const nearestTabIndex = useCallback((center: number) => {
        const layout = layoutRef.current;
        let best = -1;
        let bestDistance = Number.POSITIVE_INFINITY;
        for (let index = 0; index < layout.length; index += 1) {
            const item = itemsRef.current[index];
            if (!item || item.disabled) continue;
            const tabCenter = layout[index].left + layout[index].width / 2;
            const distance = Math.abs(tabCenter - center);
            if (distance < bestDistance) {
                bestDistance = distance;
                best = index;
            }
        }
        if (best >= 0) return best;
        return Math.min(activeKeyToIndex(itemsRef.current, activeKeyRef.current), Math.max(0, layout.length - 1));
    }, []);

    // 指针位置落在哪个页签上——纯点击的「按下即吸附」和拖动时的基准宽度都用它，判定与松手一致。
    // 中心换算沿用 pointerTarget 的 scale 处理；跳过不可用页签。
    const indexAtClient = useCallback((clientX: number) => {
        if (layoutRef.current.length === 0) return 0;
        const scale = trackScaleRef.current || 1;
        const localX = (clientX - trackRectLeftRef.current) / scale;
        return nearestTabIndex(localX);
    }, [nearestTabIndex]);

    // 拖动中按指针所在位置取「最近页签」的基准宽度，让摇杆宽度经过哪个页签就像哪个页签。
    const widthAtClient = useCallback((clientX: number) => {
        const layout = layoutRef.current;
        if (layout.length === 0) return thumbWidth.get();
        return layout[indexAtClient(clientX)]?.width ?? thumbWidth.get();
    }, [indexAtClient, thumbWidth]);

    // 宽度弹簧因跟随指针而改变时，把 left 同步到「新宽度下仍让中心对齐指针」的位置。
    // 只有真正拖动（moved）才需要这个补偿：left 平时由 pointermove 直接 jump，这里补上弹簧自己跑的那几帧。
    // 纯点击阶段（按下还没越过阈值）不做——此时 left 的目标是「页签中心」，由 pointerdown 里的
    // glideToIndex 统一负责；如果这里再把它拉回指针落点，就和 glideToIndex 抢目标，摇杆先滑到
    // 落点、再滑到页签中心，变成两段式移动（点在页签非中心处尤其明显）。
    useMotionValueEvent(thumbWidth, 'change', () => {
        if (!draggingRef.current) return;
        if (!gestureRef.current?.moved) return;
        const clientX = dragPointerXRef.current;
        if (clientX === null) return;
        thumbLeft.jump(pointerTargetLeft(clientX));
    });

    const clearStretchIdleTimer = useCallback(() => {
        if (stretchIdleTimerRef.current !== null) {
            clearTimeout(stretchIdleTimerRef.current);
            stretchIdleTimerRef.current = null;
        }
    }, []);

    // 速度降下来或停住：用 0.3s 把目标形变拉回 0，高度回升、宽度缩回基准尺寸。
    // 写目标值而不是直接写形变，是为了让上面的弹簧继续接管：收回去的过程也带一点回弹。
    // 走 tween 而不是弹簧，是因为这里要的正是一段固定时长、可预期的回弹。
    const settleStretch = useCallback(() => {
        clearStretchIdleTimer();
        stretchReturnRef.current?.stop();
        stretchSpeedRef.current = 0;
        stretchReturnRef.current = animate(stretchTarget, 0, {
            duration: STRETCH_RETURN_SECONDS,
            ease: STRETCH_RETURN_EASE,
        });
    }, [clearStretchIdleTimer, stretchTarget]);

    // 把「这一刻的横向移动速度」写进目标形变，并重新排停手计时。拖动时速度来自指针，滑行时来自摇杆自身，
    // 两条来源共用这一处，形变的手感和收回时机才不会分叉。
    // amount 不传就按速度的方向取符号（滑行用）；拖动中由调用方给「触边 / 不触边」那一套（见 thumbStretch）。
    const applyStretch = useCallback((amount: number) => {
        // 新的移动接上了：停掉正在收回的动画，形变重新交给速度。
        stretchReturnRef.current?.stop();
        stretchReturnRef.current = null;
        stretchTarget.set(amount);
        // 停下不动时没有新的采样，靠这个计时器把形变收回。
        clearStretchIdleTimer();
        stretchIdleTimerRef.current = setTimeout(settleStretch, STRETCH_IDLE_MS);
    }, [clearStretchIdleTimer, settleStretch, stretchTarget]);

    // 不拖动的移动（点页签后摇杆自己滑过去、重新测量、松手吸附回最近页签）也要有形变：
    // 这时没有指针速度可采样，改用摇杆自身的横向速度，符号沿用滑行方向。
    // 速度是 MotionValue 的实时值，只在摇杆真的在动时才有 change 事件，静止时这段监听不产生任何工作。
    useMotionValueEvent(thumbLeft, 'change', () => {
        if (draggingRef.current) return; // 拖动中一律用指针速度，避免和 jump 打架
        if (prefersReducedMotion()) return;
        applyStretch(stretchAmountFromSpeed(thumbLeft.getVelocity()));
    });

    // 兜底收尾：在元素外松开、拖到窗口外松手、切走窗口（blur）时，pointerup 不一定派发到切换器上，
    // 手势会一直挂在 dragging，形变也就一直挂着、看起来像「过一会儿才恢复」。这里只负责把这一轮
    // 手势结束并把形变收回，不切页签（切页签只走 endDrag 那条正常路径）。
    // 正常松手时 endDrag 先清掉 gestureRef，这个监听随后拿到空手势，直接跳过。
    useEffect(() => {
        if (!dragging) return;
        const release = (event: Event) => {
            const gesture = gestureRef.current;
            if (!gesture) return;
            if (event instanceof PointerEvent && event.pointerId !== gesture.pointerId) return;
            gestureRef.current = null;
            draggingRef.current = false;
            dragPointerXRef.current = null;
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

    // 拖动中每次移动采样一次横向速度，平滑后交给 stretchAmountForDrag：幅度由速度决定（有最小速度门槛），
    // 符号由「有没有触边」决定，不看拖动方向。结果写进目标形变，不进 React state；弹簧负责把目标化成形变。
    // 采样间隔太短时先跳过、不推进采样点，让下一次拿到一个稳定的时间窗。
    const sampleStretchSpeed = useCallback((clientX: number, timeStamp: number, atEdge: boolean) => {
        const sample = stretchSampleRef.current;
        if (!sample) {
            stretchSampleRef.current = { x: clientX, t: timeStamp };
            return;
        }
        const dt = timeStamp - sample.t;
        if (dt < SPEED_SAMPLE_MIN_MS) return;
        // 速度只用来量幅度（下面取绝对值），方向不参与符号：左右拖都是同一套规则。
        const instantSpeed = ((clientX - sample.x) / dt) * 1000;
        stretchSpeedRef.current = stretchSpeedRef.current * SPEED_SMOOTHING
            + instantSpeed * (1 - SPEED_SMOOTHING);
        stretchSampleRef.current = { x: clientX, t: timeStamp };
        applyStretch(stretchAmountForDrag(stretchSpeedRef.current, atEdge));
    }, [applyStretch]);

    useEffect(() => () => {
        stretchReturnRef.current?.stop();
        stretchReturnRef.current = null;
        if (stretchIdleTimerRef.current !== null) clearTimeout(stretchIdleTimerRef.current);
    }, []);

    // 按下切换器任意处：摇杆平滑滑到鼠标正下方，进入按住状态；此时不夺指针、不阻止默认行为，
    // 所以纯点击仍会走页签自身的 click。
    const handlePointerDown = useCallback((event: React.PointerEvent<HTMLElement>) => {
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        if (gestureRef.current) return;
        // 新的一次按下作废上一次松手排下的页面切换，吸附弹簧照旧可被打断。
        cancelPendingActivation();
        draggingRef.current = true;
        setDragging(true);
        const track = trackRef.current;
        const rect = track?.getBoundingClientRect();
        trackRectLeftRef.current = rect?.left ?? 0;
        trackScaleRef.current = track && rect && track.offsetWidth > 0 ? rect.width / track.offsetWidth : 1;
        gestureRef.current = { pointerId: event.pointerId, startX: event.clientX, moved: false };
        dragPointerXRef.current = event.clientX;
        // 按下即吸附到「落点所在页签」的完整几何（中心 + 宽度），一条弹簧直达目标页签。
        // 之前这里只 set 到指针落点，等 pointerup 再 glide 到页签中心，两段式移动看起来一顿一顿；
        // 直接 glideToIndex 后，纯点击从按下到松手目标始终是同一个页签中心，路径平滑不折返。
        // 真正拖动时 pointermove 会立刻接管成跟手，不受这个初始吸附影响。
        glideToIndex(indexAtClient(event.clientX));
        dragScale.set(DRAG_SCALE);
        // 系统开了「减少动态效果」就只保留放大、不做速度形变（与 data-glass-jelly 的处理一致）。
        stretchAllowedRef.current = !prefersReducedMotion();
        if (!stretchAllowedRef.current) return;
        // 形变从按下这一刻重新采样：上一次手势残留的速度不能带进来。
        clearStretchIdleTimer();
        stretchSpeedRef.current = 0;
        stretchSampleRef.current = { x: event.clientX, t: event.timeStamp };
    }, [cancelPendingActivation, clearStretchIdleTimer, dragScale, glideToIndex, indexAtClient, trackRef]);

    // 越过阈值才算真正拖动：这时才夺指针并阻止默认行为（否则点页签的 click 会被吞掉）。
    const handlePointerMove = useCallback((event: React.PointerEvent<HTMLElement>) => {
        const gesture = gestureRef.current;
        if (!gesture || gesture.pointerId !== event.pointerId) return;
        if (!gesture.moved && Math.abs(event.clientX - gesture.startX) > TAP_MOVE_THRESHOLD_PX) {
            gesture.moved = true;
            event.currentTarget.setPointerCapture(event.pointerId);
            event.preventDefault();
        }
        dragPointerXRef.current = event.clientX;
        // 越过阈值前的轻微漂移仍算纯点击：left 保持 pointerdown 设下的「页签中心」目标不动，
        // 也不改宽度——否则每次微小移动都 retarget 一次，摇杆会在页签中心和指针落点之间来回抖。
        if (!gesture.moved) return;
        // 真正拖动才跟手：宽度跟着指针所在页签实时变（set 补间），change 监听把 left 补偿回指针下。
        thumbWidth.set(widthAtClient(event.clientX));
        const target = pointerTarget(event.clientX);
        thumbLeft.jump(target.left);
        // 幅度跟着这一下的横向速度走，方向由「触没触边」定：顶到轨道两端时往上鼓，中间自由跟手时往两边甩。
        if (stretchAllowedRef.current) {
            sampleStretchSpeed(event.clientX, event.timeStamp, isThumbAtEdge(target.left, target.max));
        }
    }, [pointerTarget, sampleStretchSpeed, thumbLeft, thumbWidth, widthAtClient]);

    const endDrag = useCallback((event: React.PointerEvent<HTMLElement>) => {
        const gesture = gestureRef.current;
        if (!gesture || gesture.pointerId !== event.pointerId) return;
        gestureRef.current = null;
        draggingRef.current = false;
        dragPointerXRef.current = null;
        setDragging(false);
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
        }

        // 松手：基础缩放回 1（弹簧），形变同时用 0.3s 收回拖动时的值；两段一起收，看起来就是一下弹回。
        dragScale.set(1);
        settleStretch();
        stretchSampleRef.current = null;

        // 松手：按「松手指针位置」而不是摇杆当前值算最近页签——纯点击时吸附动画才刚开始，
        // 当前的 thumbLeft 还停在旧位置，用它取整会选错页签并来回摆动。
        const center = pointerTargetLeft(event.clientX) + thumbWidth.get() / 2;
        const target = nearestTabIndex(center);
        glideToIndex(target);
        const key = itemsRef.current[target]?.key;
        if (key && key !== activeKeyRef.current) {
            // 不立刻切：先把摇杆吸附到目标，停稳后再等一拍才换页签。
            armActivationAfterSettle(key);
        }
        if (!gesture.moved) onTapActive?.();
    }, [armActivationAfterSettle, dragScale, glideToIndex, nearestTabIndex, onTapActive, pointerTargetLeft, settleStretch, thumbWidth]);

    return {
        // 基准盒子（未放大、未形变）：位置与宽度仍是吸附/几何的唯一来源，一般不需要直接渲染。
        thumbLeft,
        thumbWidth,
        thumbDragging: dragging,
        // 真正写进 style 的盒子：宽高已含按住放大与速度形变，left / top 已按中心锚点补偿好。
        // 直接用这四个量撑住摇杆的 left / top / width / height，不要再用 transform: scale。
        thumbBoxLeft,
        thumbBoxTop,
        thumbBoxWidth,
        thumbBoxHeight,
        // 轨道内容宽度弹簧：给外层胶囊容器设 width，大类切换时平滑伸缩。
        trackWidth,
        thumbHandlers: {
            onPointerDown: handlePointerDown,
            onPointerMove: handlePointerMove,
            onPointerUp: endDrag,
            onPointerCancel: endDrag,
        },
    };
};
