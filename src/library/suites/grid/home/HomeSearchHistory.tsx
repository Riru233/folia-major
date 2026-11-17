import React, { useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { useGlass } from '@/shinoinject/useGlass';


// src/library/suites/grid/home/HomeSearchHistory.tsx
// 首页搜索框点开时贴在它下面的搜索历史：一条一个标签，标签本身点了就再搜一次，
// 右边的叉删这一条，右上角「清空」删整份。数据是全局那一份（useSearchNavigationStore 的 searchHistory）。
// 面板上的按下都挡住默认行为：那样输入框不会先失焦，面板也就不会在点击落下之前消失。
// 面板必须挂在 body 上（HomeSearchHistoryPopover）：搜索框自己是块玻璃、身上带 backdrop-filter，
// 挂在它里面会让面板的 backdrop-filter 取样根被截在表单内部，取样结果是一片透明——玻璃直接失效。

type HomeSearchHistoryProps = {
    items: readonly string[];
    onPick: (query: string) => void;
    onRemove: (query: string) => void;
    onClear: () => void;
    isDaylight: boolean;
    /**
     * 铺满调用方给的那一块：紧凑档的搜索层占满整条页头，历史面板也跟着同宽；桌面档收成固定的 288px。
     * 两档的面板是同一个组件、同一套玻璃属性，只是宽度跟着搜索框走。
     */
    stretch?: boolean;
    className?: string;
};

/** 让输入框保持焦点：面板上的点击不用先 blur 再 click。 */
const keepFocus = (event: React.MouseEvent) => event.preventDefault();

export const HomeSearchHistory: React.FC<HomeSearchHistoryProps> = ({
    items,
    onPick,
    onRemove,
    onClear,
    isDaylight,
    stretch = false,
    className = '',
}) => {
    const { t } = useTranslation();

    const surface = isDaylight
        ? 'text-zinc-800'
        : 'text-zinc-100';
    const chip = isDaylight
        ? 'border-black/10 bg-black/[0.04] hover:bg-black/[0.08]'
        : 'border-white/10 bg-white/[0.06] hover:bg-white/[0.12]';
    useGlass();
    return (
        <div
            data-glass data-glass-jelly data-glass-light
            /* 面板挂在 body 上，不在搜索表单里：页头「点外面收起」的白名单靠它自己这个标记认出里面。 */
            data-home-search-layer
            id="home-search-history"
            data-testid="home-search-history"
            className={`max-w-[calc(100vw-2rem)] rounded-2xl border-none p-3 ${stretch ? 'w-full' : 'w-72'} ${surface} ${className}`}
            style={{
                backgroundColor: isDaylight ? 'rgba(215,215,215,0.42)' : 'rgba(40, 40, 40, 0.42)',
                borderTop: isDaylight ? '1px solid #fff6' : '1px solid #fff5',
                borderBottom: isDaylight ? '1px solid #fff6' : '1px solid #fff5',
                outline: '1px solid rgba(35,35,35,0.3)',
                boxShadow: '2px 2px 8px 2px rgba(40,40,40,0.4)',
            }}
        >
            <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-[11px] font-medium uppercase tracking-wide opacity-50">
                    {t('home.searchHistory')}
                </span>
                <button
                    type="button"
                    onMouseDown={keepFocus}
                    onClick={onClear}
                    className="rounded-md px-1.5 py-0.5 text-[11px] opacity-55 transition-opacity hover:opacity-100"
                >
                    {t('home.searchHistoryClear')}
                </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
                {items.map(item => (
                    <span
                        key={item}
                        className={`inline-flex min-w-0 max-w-full items-center rounded-full border transition-colors ${chip}`}
                    >
                        <button
                            type="button"
                            onMouseDown={keepFocus}
                            onClick={() => onPick(item)}
                            title={item}
                            className="min-w-0 truncate py-1 pl-2.5 pr-1 text-xs"
                        >
                            {item}
                        </button>
                        <button
                            type="button"
                            onMouseDown={keepFocus}
                            onClick={() => onRemove(item)}
                            aria-label={t('home.searchHistoryRemove', { query: item })}
                            title={t('home.searchHistoryRemove', { query: item })}
                            className="mr-1 grid h-4 w-4 shrink-0 place-items-center rounded-full opacity-45 transition-opacity hover:opacity-100"
                        >
                            <X size={10} />
                        </button>
                    </span>
                ))}
            </div>
        </div>
    );
};

/** 面板贴在搜索框下沿的哪一种对齐：桌面档右对齐那 288px，紧凑档跟搜索框同宽。 */
type HomeSearchHistoryPopoverProps = {
    open: boolean;
    /** 量位置的锚点：桌面档是搜索表单，紧凑档是占满页头的那个搜索表单。 */
    anchorRef: React.RefObject<HTMLElement | null>;
    align?: 'end' | 'stretch';
    children: React.ReactNode;
};

type PopoverBox = { top: number; left: number; width: number };

const DESKTOP_PANEL_WIDTH = 288;
const PANEL_GAP = 8;

// 挂在 body 上、按锚点矩形定位的浮层。搜索框本身是玻璃（backdrop-filter），面板做它的后代时
// backdrop-filter 的取样根会被截在搜索框内部，取样到的是「搜索框自己的底色」而不是页面，
// 于是玻璃看起来完全失效。挪到 body 上、用 fixed 定位视觉上仍贴在搜索框下沿，取样根回到页面。
// 动画只做 y：祖先的 opacity 动画同样会截断取样根，位移不会。
export const HomeSearchHistoryPopover: React.FC<HomeSearchHistoryPopoverProps> = ({
    open,
    anchorRef,
    align = 'end',
    children,
}) => {
    const [box, setBox] = useState<PopoverBox | null>(null);

    useLayoutEffect(() => {
        if (!open) return;
        const measure = () => {
            const anchor = anchorRef.current;
            if (!anchor) return;
            const rect = anchor.getBoundingClientRect();
            const width = align === 'stretch'
                ? rect.width
                : Math.min(DESKTOP_PANEL_WIDTH, window.innerWidth - 32);
            // 右侧对齐时用 left 换算好再夹回窗口内：面板比锚点宽时可以往左探出去。
            const left = align === 'stretch'
                ? rect.left
                : Math.max(16, Math.min(rect.right - width, window.innerWidth - width - 16));
            setBox({ top: rect.bottom + PANEL_GAP, left, width });
        };
        measure();
        // 紧凑档的搜索层是滑进来的：面板打开的那一帧锚点还在页头右侧之外（translateX(100%)），
        // 只量一次会把它定位到屏幕外一整屏宽。滑入的这段时间里跟着锚点重量，位置一稳定就停：
        // 不留下常驻的逐帧回调（那是热路径）。桌面档第一帧就已经对，第二帧就停了。
        let frame = 0;
        let previousLeft = Number.NaN;
        const FOLLOW_LIMIT_MS = 600;
        const startedAt = performance.now();
        const follow = () => {
            const anchor = anchorRef.current;
            if (!anchor) return;
            const current = anchor.getBoundingClientRect().left;
            measure();
            const stable = Math.abs(current - previousLeft) < 0.5;
            previousLeft = current;
            if (stable || performance.now() - startedAt > FOLLOW_LIMIT_MS) return;
            frame = requestAnimationFrame(follow);
        };
        frame = requestAnimationFrame(follow);
        // 滑完之后再对一次：位置稳定判据够不到时（例如动画被系统降级成瞬移）这里兜底。
        const anchor = anchorRef.current;
        const onTransitionEnd = () => measure();
        anchor?.addEventListener('transitionend', onTransitionEnd);
        window.addEventListener('resize', measure);
        // 捕获阶段听滚动：页头虽然不动，内容区滚动也会让锚点位置变。
        window.addEventListener('scroll', measure, true);
        return () => {
            cancelAnimationFrame(frame);
            anchor?.removeEventListener('transitionend', onTransitionEnd);
            window.removeEventListener('resize', measure);
            window.removeEventListener('scroll', measure, true);
        };
    }, [open, align, anchorRef]);

    if (typeof document === 'undefined') return null;

    return createPortal(
        <AnimatePresence>
            {open && box && (
                <motion.div
                    initial={{ y: -6 }}
                    animate={{ y: 0 }}
                    exit={{ y: -6 }}
                    transition={{ duration: 0.16 }}
                    style={{
                        position: 'fixed',
                        top: box.top,
                        left: box.left,
                        width: box.width,
                        zIndex: 60,
                    }}
                >
                    {children}
                </motion.div>
            )}
        </AnimatePresence>,
        document.body,
    );
};

export default HomeSearchHistory;
