import React, { useId, useLayoutEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import {
    Compass, Disc3, FolderOpen, Gift, Layers, ListMusic, Radio, Server, Theater,
    type LucideIcon,
} from 'lucide-react';
import type { LibraryHomeTabKey, LibraryHomeTabView } from '../../../core/home/homeModel.contract';
import type { LibraryHomeExtraTab } from '../../../core/suite/suite.contract';
import { useIsBottomLayoutCompact } from '../../../../stores/useBottomDockStore';
import { useReducedMotionFor } from '../../../../hooks/useReducedMotionFor';
import { pillChromeClassesFor } from '../../../../components/shared/pillChrome';
import { useGlass } from '@/shinoinject/useGlass';

// src/library/suites/grid/home/Grid3DNav.tsx
// 网格首页的页签导航，与 Grid3D 页头那一排用的是同一份数据（homeTabs + 扩展页签 + 舞台）。
// 紧凑档（窗口窄于 960，见 useBottomLayoutCompact）铺成贴着底边的水平导航条；宽松档立成左侧的垂直导航栏。
// 两档都是 floating：不改页面布局，宿主按需把内容让出边距即可。

/**
 * 页签的图标：只按 `LibraryHomeTabKey` 认，未知页签（宿主贡献的扩展页签）退到 Layers。
 * 图标是页签的辅助图形，文字照旧是 `label`，读屏只读文字。
 */
const TAB_ICONS: Partial<Record<LibraryHomeTabKey, LucideIcon>> = {
    playlist: ListMusic,
    radio: Radio,
    explore: Compass,
    albums: Disc3,
    local: FolderOpen,
    navidrome: Server,
    welfare: Gift,
};
const FALLBACK_ICON = Layers;
const STAGE_ICON = Theater;

/**
 * 导航里的一项：原生页签、宿主贡献的扩展页签、舞台都摊平成同一形状。
 * 用 id 区分（扩展页签的 id 与原生页签的 key 由宿主保证不撞）。
 */
type Grid3DNavItem = {
    id: string;
    label: string;
    Icon: LucideIcon;
    /** 不可用的原因：有值时按钮置灰，提示用它。 */
    disabledReason?: string;
    /** 画选中块的那一项（同一时刻最多一个，`layoutId` 只认一个）。 */
    active: boolean;
    /**
     * 舞台正在放：只标 `data-stage-active`，不画选中态——此刻首页还停在某个原生页签上，
     * 两边都点亮会同时出现两个「当前」。与 Grid3D 页头、Bravais 的工具条同一套约定。
     */
    stageActive?: boolean;
    select: () => void;
};

interface Grid3DNavProps {
    /** 原生页签（homeSources.tabs，已翻译好 label）。 */
    tabs: readonly LibraryHomeTabView[];
    /** 当前页签（homeSources.tab）。 */
    activeTab: LibraryHomeTabKey;
    /** 切页签：与 Grid3D 页头一样，切完顺手把焦点交回海报轨道。 */
    onSelectTab: (tab: LibraryHomeTabKey) => void;
    /** 宿主贡献的页签（模组的首页页面）：有 active 为 true 时原生页签不算选中。 */
    extraTabs?: readonly LibraryHomeExtraTab[];
    stageEnabled?: boolean;
    stageIsActive?: boolean;
    onOpenStagePlayer?: () => void;
    isDaylight: boolean;
    /** 覆盖档位判定（预览、截图测试用）；不传就跟随 useBottomLayoutCompact。 */
    compact?: boolean;
    /** 紧凑档导航条离底边的距离（px），默认贴底；底部还有播放胶囊时传它的高度。 */
    bottomOffset?: number;
    /** 宽松档导航栏离左边的距离（px）。 */
    sideOffset?: number;
    className?: string;
}

/**
 * 玻璃表面，与页头那颗搜索钮、SwitcherPill 的 header 模式同源（Grid3D.headerGlassStyle）。
 * 横向那条只描上下两条高光边；竖向栏要把左右两条长边也描上，否则一条 70vh 高的竖栏只剩两个短边发亮。
 */
const navGlassSurface = (isDaylight: boolean, vertical: boolean): React.CSSProperties => {
    const edge = isDaylight ? '1px solid #fff6' : '1px solid #fff5';
    return {
        backgroundColor: isDaylight ? 'rgba(215,215,215,0.42)' : 'rgba(40, 40, 40, 0.42)',
        borderTop: edge,
        borderBottom: edge,
        ...(vertical ? { borderLeft: edge, borderRight: edge } : {}),
        outline: '1px solid rgba(35,35,35,0.3)',
        boxShadow: '0px 8px 16px rgba(40,40,40,0.2)',
        color: isDaylight ? '#000' : '#fff',
    };
};

export const Grid3DNav: React.FC<Grid3DNavProps> = ({
    tabs,
    activeTab,
    onSelectTab,
    extraTabs,
    stageEnabled = false,
    stageIsActive = false,
    onOpenStagePlayer,
    isDaylight,
    compact,
    bottomOffset = 0,
    sideOffset = 12,
    className = '',
}) => {
    const { t } = useTranslation();
    // 宿主没给档位就自己跟着底部布局走：没有挂档位追踪的页面（OBS 之类）一直是宽松档。
    const compactFromStore = useIsBottomLayoutCompact();
    const isCompact = compact ?? compactFromStore;
    const reduceMotion = useReducedMotionFor('uiMicroMotion');
    const chrome = pillChromeClassesFor(isDaylight);
    // 选中块按实例分隔：同一时刻可能有两个同档导航（预览页），共用一条 layoutId 会让高亮在两份之间跳。
    const instanceId = useId();
    const navRef = useRef<HTMLElement>(null);
    const activeItemRef = useRef<HTMLButtonElement>(null);
    useGlass();

    // 扩展页签开着时原生页签都不算选中（见 LibraryHomeExtraTab.active 的约定）。
    const extraTabActive = Boolean(extraTabs?.some(tab => tab.active));
    const primaryItems: Grid3DNavItem[] = [
        ...tabs.map(tab => ({
            id: tab.key,
            label: tab.label,
            Icon: TAB_ICONS[tab.key] ?? FALLBACK_ICON,
            ...(tab.disabledReason ? { disabledReason: tab.disabledReason } : {}),
            active: !extraTabActive && tab.key === activeTab,
            select: () => onSelectTab(tab.key),
        })),
        ...(extraTabs ?? []).map(tab => ({
            id: tab.id,
            label: tab.label,
            Icon: FALLBACK_ICON,
            active: tab.active,
            select: tab.select,
        })),
    ];
    // 舞台是「去哪儿」，不是「在哪页」：排在最后，与页签之间隔一条细线。
    const trailingItems: Grid3DNavItem[] = stageEnabled
        ? [{
            id: 'stage',
            label: t('home.stage'),
            Icon: STAGE_ICON,
            active: false,
            stageActive: stageIsActive,
            select: () => onOpenStagePlayer?.(),
        }]
        : [];
    const activeId = [...primaryItems, ...trailingItems].find(item => item.active)?.id ?? null;

    // 选中项滚进可视区：横条是横着滚的、竖栏会超过 70vh，两边都可能把当前项留在视野外
    // （宿主用 Tab 循环切页签时不会经过鼠标）。useLayoutEffect：切完这一帧就摆好，别让人先看到错位再修。
    // block/inline 都用 nearest：默认的居中会把整个固定的导航条连同页面一起挪。
    useLayoutEffect(() => {
        if (activeId === null) return;
        activeItemRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }, [isCompact, activeId]);

    // 横条用左右键、竖栏用上下键在可用项之间挪焦点（Home / End 到两头）。
    // 只挪焦点、不直接切页签：Tab 到某一项再回车，和原生页签按钮的行为一致。
    // 带修饰键的一律让出去（Alt+←/→ 是浏览器后退，Cmd+←/→ 也有自己的含义）。
    const handleKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
        if (event.altKey || event.ctrlKey || event.metaKey) return;
        const forward = isCompact ? 'ArrowRight' : 'ArrowDown';
        const backward = isCompact ? 'ArrowLeft' : 'ArrowUp';
        const nodes = Array.from(
            navRef.current?.querySelectorAll<HTMLButtonElement>('[data-grid3d-nav-item]:not(:disabled)') ?? [],
        );
        if (nodes.length === 0) return;
        const current = nodes.indexOf(document.activeElement as HTMLButtonElement);
        let next: HTMLButtonElement | undefined;
        if (event.key === forward) {
            next = nodes[current < 0 ? 0 : (current + 1) % nodes.length];
        } else if (event.key === backward) {
            next = nodes[current < 0 ? nodes.length - 1 : (current - 1 + nodes.length) % nodes.length];
        } else if (event.key === 'Home') {
            next = nodes[0];
        } else if (event.key === 'End') {
            next = nodes[nodes.length - 1];
        }
        if (!next) return;
        event.preventDefault();
        // preventScroll 挡住浏览器的默认滚动，焦点挪出可视区时由这里自己补一下。
        next.focus({ preventScroll: true });
        next.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    };

    // 选中块在横条与竖栏里各是一条 layoutId：换档时不做横条↔竖栏的位移动画，只在同一形态内跟手滑动。
    const activeIndicatorProps = reduceMotion
        ? {}
        : { layoutId: `${instanceId}-grid3d-nav-active`, transition: { type: 'spring' as const, stiffness: 420, damping: 34 } };

    const renderItem = (item: Grid3DNavItem) => (
        <button
            key={item.id}
            ref={item.active ? activeItemRef : undefined}
            type="button"
            data-grid3d-nav-item={item.id}
            data-stage-active={item.stageActive === undefined ? undefined : item.stageActive ? 'true' : 'false'}
            disabled={Boolean(item.disabledReason)}
            title={item.disabledReason || item.label}
            aria-label={item.label}
            aria-current={item.active ? 'page' : undefined}
            onClick={item.select}
            className={`relative flex shrink-0 flex-col items-center justify-center rounded-2xl font-medium transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-[color:var(--text-primary)] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-35 ${isCompact
                ? `min-w-[56px] gap-0.5 px-2 py-1.5 ${item.active ? chrome.strongText : chrome.softText}`
                // 竖栏宽 104px，英文标签（Queue collage、Navidrome）放不下：允许折成两行，不靠省略号。
                : `w-full gap-1 px-2 py-2 leading-snug break-words whitespace-normal ${item.active ? chrome.strongText : chrome.softText}`}`}
        >
            {item.active && (
                <motion.span
                    aria-hidden="true"
                    className={`absolute inset-0 rounded-2xl ${chrome.activePill}`}
                    {...activeIndicatorProps}
                />
            )}
            <item.Icon size={18} className="relative z-10 shrink-0" aria-hidden="true" />
            <span className={`relative z-10 min-w-0 text-center ${isCompact ? 'text-[10px] whitespace-nowrap' : 'text-[10px]'}`}>
                {item.label}
            </span>
        </button>
    );

    // 舞台与页签之间的分隔线：横条竖着画，竖栏横着画。
    const divider = trailingItems.length > 0 && primaryItems.length > 0 ? (
        <span
            key="grid3d-nav-divider"
            aria-hidden="true"
            className={`shrink-0 ${chrome.divider} ${isCompact ? 'mx-0.5 h-6 w-px' : 'my-0.5 h-px w-full'}`}
        />
    ) : null;

    // 两档共用同一个 <nav>：只换外层定位与自身朝向，换档时不重挂 DOM。
    // 重挂会再挂一份玻璃（makeGlass 往 #filter-defs 里追加 filter，工具里没有回收路径），拖窗口跨断点会越积越多。
    //
    // 层级压在 z-20：比页头高一点没用，要的是比 GridMap 那层（z-[110] 的整屏地图）和底部播放胶囊（z-60）都低。
    // Grid3D 的根节点带 backdrop-blur（自成层叠上下文），所以这里的 z 只在那一层内比较，不能再往上抬。
    return (
        <div
            className={`pointer-events-none fixed z-20 ${isCompact ? 'inset-x-0 flex justify-center px-3' : 'top-1/2 -translate-y-1/2'} ${className}`}
            style={isCompact
                ? { bottom: bottomOffset, paddingBottom: 'env(safe-area-inset-bottom)' }
                : { left: sideOffset }}
        >
            <nav
                ref={navRef}
                aria-label={t('home.navMenu')}
                data-glass
                data-glass-jelly
                data-glass-light
                data-testid="grid3d-nav"
                onKeyDown={handleKeyDown}
                className={`pointer-events-auto backdrop-blur-md [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${isCompact
                    ? 'flex max-w-full flex-row items-center gap-1 overflow-x-auto rounded-[22px] p-1.5'
                    : 'flex max-h-[70vh] w-[104px] flex-col gap-1 overflow-y-auto rounded-[26px] p-1.5'}`}
                style={navGlassSurface(isDaylight, !isCompact)}
            >
                {primaryItems.map(renderItem)}
                {divider}
                {trailingItems.map(renderItem)}
            </nav>
        </div>
    );
};

export default Grid3DNav;
