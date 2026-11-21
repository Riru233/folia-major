import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import {
    Compass,
    Disc3,
    FolderOpen,
    Gift,
    Layers,
    LayoutDashboard,
    ListMusic,
    Radio,
    Server,
    Settings,
    Theater,
} from 'lucide-react';
import { useGlass } from '@/shinoinject/useGlass';
import SwitcherPill from '../../../../components/login/SwitcherPill';
import type { LibraryAccountController } from '../../../core/account/account.contract';
import { isChromiumRenderer } from '../../../../utils/platform';
import type { LibraryHomeTabKey } from '../../../core/home/homeModel.contract';
import type { LibraryHomeExtraTab } from '../../../core/suite/suite.contract';
import { useNavTabThumb } from './useNavTabThumb';

// src/library/suites/grid/home/Grid3DNav.tsx
// 浮层导航竖栏。整块结构照搬页头那排页签胶囊（Grid3D.tsx 里的 pill + 摇杆）：
// 玻璃底色单独做一层绝对定位的兄弟、摇杆是 z-10 的透镜、页签文字 z-20 压在摇杆之上，
// 摇杆里四层渐进模糊 + 一层色散，按住放大一倍、按速度形变——都是同一套 DOM 和同一组属性，
// 只把「横着排」换成「竖着排」，把色散与渐进模糊的 mask 从「四周一圈」换成「上下两端」。
// 位置不写死：量页头设置按钮的盒子，挂在它下面 10px，窗口尺寸变化时重新量。

interface Grid3DNavProps {
    tabs: readonly { key: LibraryHomeTabKey; label: string; disabledReason?: string }[];
    activeTab: LibraryHomeTabKey;
    onSelectTab: (tab: LibraryHomeTabKey) => void;
    extraTabs?: readonly LibraryHomeExtraTab[];
    stageEnabled?: boolean;
    stageIsActive?: boolean;
    onOpenStagePlayer?: () => void;
    /** 队列拼贴：有可铺的墙时宿主传这个，按钮挂在竖栏下面。 */
    onOpenLattice?: () => void;
    showLattice?: boolean;
    /** 平台切换 / 登录入口：同样挂在竖栏下面，排在队列拼贴之后。 */
    account?: LibraryAccountController;
    /** 设置入口：从页头搬进来，放在竖栏最上面一行。 */
    onOpenSettings?: () => void;
    /** 有新版本时在设置钮右上角点一个强调色圆点（页头原先是一段文字，竖栏只有 40px 放不下）。 */
    updateAvailable?: boolean;
    isDaylight?: boolean;
    className?: string;
}

/** 摇杆边缘的色散滤镜 id：与页头那条分开，各用各的定义。 */
const NAV_DISPERSION_FILTER_ID = 'grid3d-nav-dispersion';

/** 浮动容器的定位：横向与页头左边距（px-4 16 + 8）对齐，纵向钉在距窗口顶部 45px。
    两个值都写死，不再去量页头里的元素——那块占位已经换成高亮标题了。 */
const COLUMN_LEFT_PX = 20;
const COLUMN_TOP_PX = 40;
/** 容器底边距：设置按钮钉在距窗口底部这个位置，与上方竖栏之间的间隔由窗口高度自动伸缩。 */
const COLUMN_BOTTOM_PX = 24;

const TAB_ICONS: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
    playlist: ListMusic,
    radio: Radio,
    explore: Compass,
    albums: Disc3,
    local: FolderOpen,
    navidrome: Server,
    welfare: Gift,
};

const iconFor = (key: string) => TAB_ICONS[key] ?? Layers;

const TabIcon = ({ tabKey }: { tabKey: string }) => {
    const Icon = iconFor(tabKey);
    return <Icon size={18} className="relative z-20 shrink-0" />;
};

interface NavTabButtonProps {
    label: string;
    title: string;
    active: boolean;
    icon: React.ReactNode;
    onClick: () => void;
    disabled?: boolean;
    dataStageActive?: string;
    /** 悬停 / 聚焦时把「标签 + 锚元素」报上去，由整根竖栏共用的一颗标签胶囊去显示。 */
    onHover?: (label: string, anchor: HTMLElement) => void;
    onHoverEnd?: () => void;
}

// 一项：只有图标；标签由整根竖栏共用的一颗胶囊统一显示（见 Grid3DNav 里那颗）。
// 不给每项各挂一颗：每颗都要 data-glass，等于常驻七份 backdrop-filter，滚动时最费的那部分。
const NavTabButton: React.FC<NavTabButtonProps> = ({
    label,
    title,
    active,
    icon,
    onClick,
    disabled,
    dataStageActive,
    onHover,
    onHoverEnd,
}) => (
    <button
        type="button"
        data-home-tab
        data-stage-active={dataStageActive}
        disabled={disabled}
        title={title}
        aria-label={title}
        aria-current={active ? 'page' : undefined}
        onClick={onClick}
        onPointerEnter={onHover ? event => onHover(label, event.currentTarget) : undefined}
        onPointerLeave={onHoverEnd}
        onFocus={onHover ? event => onHover(label, event.currentTarget) : undefined}
        onBlur={onHoverEnd}
        className="group relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors duration-300 disabled:cursor-not-allowed disabled:opacity-35"
        style={{ color: active ? 'var(--text-accent)' : 'var(--text-primary)' }}
    >
        {icon}
    </button>
);

export const Grid3DNav: React.FC<Grid3DNavProps> = ({
    tabs,
    activeTab,
    onSelectTab,
    extraTabs,
    stageEnabled,
    stageIsActive,
    onOpenStagePlayer,
    onOpenLattice,
    showLattice,
    account,
    onOpenSettings,
    updateAvailable = false,
    isDaylight = false,
    className = '',
}) => {
    const { t } = useTranslation();
    // 页头那份 useGlass 只扫它自己 commit 的那一帧；这里自己再扫一次，首帧就挂上玻璃。
    useGlass();

    // 摇杆需要的项与页头那排完全一致：不可用的页签带 disabled，拖动吸附时跳过它们。
    const thumbItems = React.useMemo(
        () => [
            ...tabs.map(tab => ({ key: tab.key, disabled: Boolean(tab.disabledReason) })),
            ...(extraTabs ?? []).map(tab => ({ key: tab.id, disabled: false })),
            ...(stageEnabled ? [{ key: '__stage__', disabled: false }] : []),
        ],
        [tabs, extraTabs, stageEnabled],
    );

    const trackRef = useRef<HTMLDivElement>(null);
    const {
        thumbDragging,
        thumbBoxLeft,
        thumbBoxTop,
        thumbBoxWidth,
        thumbBoxHeight,
        thumbReady,
        thumbHandlers,
    } = useNavTabThumb({
        trackRef,
        items: thumbItems,
        activeKey: stageIsActive ? '__stage__' : (extraTabs?.find(tab => tab.active)?.id ?? activeTab),
        onActivate: key => {
            if (key === '__stage__') {
                onOpenStagePlayer?.();
                return;
            }
            const extra = extraTabs?.find(tab => tab.id === key);
            if (extra) {
                extra.select();
                return;
            }
            onSelectTab(key as LibraryHomeTabKey);
        },
        axis: 'y',
    });

    // 与页头那颗玻璃同一套底色、描边与阴影。
    const glassStyle: React.CSSProperties = {
        backgroundColor: isDaylight ? 'rgba(215,215,215,0.42)' : 'rgba(40, 40, 40, 0.42)',
        borderTop: isDaylight ? '1px solid #fff6' : '1px solid #fff5',
        borderBottom: isDaylight ? '1px solid #fff6' : '1px solid #fff5',
        outline: '1px solid rgba(35,35,35,0.3)',
        boxShadow: '0px 8px 16px rgba(40,40,40,0.2)',
    };
    // 悬停标签：贴在栏右侧浮出的小胶囊。挂了 data-glass（useGlass 会扫到），
    // 所以底色留得透一点让背面透上来，边框与投影自己给，和页头那几颗玻璃观感一致。
    const tooltipStyle: React.CSSProperties = {
        backgroundColor: isDaylight ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)',
        borderTop: isDaylight ? '1px solid #fff6' : '1px solid #fff5',
        borderBottom: isDaylight ? '1px solid #fff6' : '1px solid #fff5',
        outline: '1px solid rgba(35,35,35,0.3)',
        boxShadow: '0px 8px 16px rgba(40,40,40,0.2)',
        color: isDaylight ? '#111' : '#fff',
        userSelect: 'none',
    };

    // 摇杆里的霜面层：拖动时淡出、松手淡回（与页头同一套时序与时长）。
    const frostFadeStyle = {
        opacity: thumbDragging ? 1 : 0,
        transition: 'opacity 260ms ease-out',
    } as const;

    // 悬停标签整根竖栏共用一颗：位置由被悬停那一项的盒子算出来，胶囊本身常驻（只挂一份 data-glass）。
    // 原先每项一颗，等于常驻七份 backdrop-filter —— 滚动和拖摇杆时最费的就是这部分。
    const [hovered, setHovered] = useState<{ label: string; top: number } | null>(null);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const handleHover = React.useCallback((label: string, anchorElement: HTMLElement) => {
        const wrapper = wrapperRef.current;
        if (!wrapper) return;
        const anchorRect = anchorElement.getBoundingClientRect();
        const wrapperRect = wrapper.getBoundingClientRect();
        setHovered({ label, top: anchorRect.top - wrapperRect.top + anchorRect.height / 2 });
    }, []);
    const clearHover = React.useCallback(() => setHovered(null), []);

    return (
        <div
            // 层级：压在页头（z-20）之上、GridMap（z-[110]）与底部播放胶囊（z-60）之下。
            // 高度撑满可视区：设置按钮用 mt-auto 钉到底部，中间那段间隔随窗口高度自己伸缩。
            className={`pointer-events-none fixed z-30 flex flex-col ${className}`}
            style={{ left: COLUMN_LEFT_PX, top: COLUMN_TOP_PX, bottom: COLUMN_BOTTOM_PX }}
            data-testid="grid3d-nav"
        >
            <div ref={wrapperRef} className="relative flex flex-1 flex-col items-start gap-2">
                {/* 平台切换（没人登录时就是登录入口）：浮动容器里排第一颗，设置按钮与它换了位置。
                    header 档就是页头那颗圆钮本身，尺寸 38，与竖栏 40 并排看着齐。 */}
                {account && (
                    <div className="pointer-events-auto flex w-10 justify-center" data-testid="grid3d-nav-account">
                        <SwitcherPill variant="header" account={account} />
                    </div>
                )}

                {/* 队列拼贴：紧跟在平台切换下面（同一套玻璃与悬停标签）。
                尺寸与设置按钮、竖栏同宽（40），圆角拉满。 */}
                {showLattice && onOpenLattice && (
                    <button
                        type="button"
                        data-glass
                        data-glass-jelly
                        data-glass-light
                        data-testid="home-lattice-pill"
                        onClick={onOpenLattice}
                        title={t('home.lattice')}
                        aria-label={t('home.lattice')}
                        onPointerEnter={event => handleHover(t('home.lattice'), event.currentTarget)}
                        onPointerLeave={clearHover}
                        onFocus={event => handleHover(t('home.lattice'), event.currentTarget)}
                        onBlur={clearHover}
                        className="group pointer-events-auto relative flex h-10 w-10 items-center justify-center rounded-full transition-colors duration-300"
                        style={glassStyle}
                    >
                        <LayoutDashboard size={18} style={{ color: 'var(--text-primary)' }} />
                    </button>
                )}

                <div
                    aria-label={t('home.navMenu')}
                    role="navigation"
                    className="pointer-events-auto relative flex w-10 flex-col rounded-[20px]"
                >
                    {/* 玻璃底色：与摇杆、页签同为兄弟层级（页头那颗胶囊也是这么分的）。 */}
                    <div
                        data-glass
                        data-glass-jelly
                        data-glass-light
                        aria-hidden="true"
                        className="absolute inset-0 rounded-[20px]"
                        style={glassStyle}
                    />

                    {/* 色散滤镜定义：竖栏的色散只落在上下两端，所以通道往上下错开、横向不动。 */}
                    <svg
                        aria-hidden="true"
                        width="0"
                        height="0"
                        style={{ position: 'absolute', left: 0, top: 0 }}
                    >
                        <filter
                            id={NAV_DISPERSION_FILTER_ID}
                            x="-20%"
                            y="-20%"
                            width="140%"
                            height="140%"
                            colorInterpolationFilters="sRGB"
                        >
                            <feColorMatrix
                                in="SourceGraphic"
                                type="matrix"
                                values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0"
                                result="dispR"
                            />
                            <feColorMatrix
                                in="SourceGraphic"
                                type="matrix"
                                values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0"
                                result="dispG"
                            />
                            <feColorMatrix
                                in="SourceGraphic"
                                type="matrix"
                                values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0"
                                result="dispB"
                            />
                            <feOffset in="dispR" dx="0" dy="-2.6" result="dispRShift" />
                            <feOffset in="dispB" dx="0" dy="2.6" result="dispBShift" />
                            <feBlend in="dispRShift" in2="dispG" mode="screen" result="dispRG" />
                            <feBlend in="dispRG" in2="dispBShift" mode="screen" />
                        </filter>
                    </svg>

                    {/* 摇杆：常驻单块（每项一块会让每挂一次都往 #filter-defs 塞一份 filter）。
                    层级压在日常项之上、拖起来时再抬高；文字自己 z-20，静止时不被透镜糊掉。 */}
                    <motion.div
                        aria-hidden="true"
                        data-testid="grid3d-nav-thumb"
                        className={`absolute rounded-full shadow-sm pointer-events-none transition-[background-color,box-shadow,opacity] duration-200 ease-out outline outline-1 outline-[rgba(35,35,35,0.3)] ${thumbDragging ? 'z-[60] bg-transparent' : 'z-10 bg-[var(--text-accent)]/40 shadow-[0px_8px_16px_rgba(40,40,40,0.2)]'}`}
                        style={{
                            left: thumbBoxLeft,
                            top: thumbBoxTop,
                            width: thumbBoxWidth,
                            height: thumbBoxHeight,
                            borderTop: isDaylight ? '1px solid #fff6' : '1px solid #fff5',
                            borderBottom: isDaylight ? '1px solid #fff6' : '1px solid #fff5',
                            pointerEvents: 'none',
                            // 不按就不画：display: none 让这四层渐进模糊 + 色散滤镜整块不参与合成，
                            // 空闲时一点 GPU 都不占（只写 opacity: 0 的话 backdrop-filter 仍然要算）。
                            // 按下（含纯点击）立刻回到正常显示，液态玻璃就在这一刻出现。
                            display: thumbDragging && thumbReady ? undefined : 'none',
                            boxShadow: thumbDragging ? '0 0 20px #0006' : '',
                        }}
                    >
                        {/* 摇杆自身的流体玻璃：参数与页头那颗一字不差。 */}
                        <div
                            data-glass
                            data-glass-len="0.95"
                            data-glass-strength="10"
                            data-glass-blur="0"
                            data-glass-bend="80"
                            data-glass-gamma="15"
                            data-glass-sat="1.2"
                            className="rounded-full relative top-0 left-0"
                            style={{ width: '100%', height: '100%' }}
                        />

                        {/* 色散：只留上下两端那一圈，铺满整块会把文字染出彩边。 */}
                        <div
                            className="rounded-full relative top-[-100%] left-0"
                            style={{
                                ...frostFadeStyle,
                                backdropFilter: isChromiumRenderer() ? `url(#${NAV_DISPERSION_FILTER_ID})` : undefined,
                                maskImage: 'linear-gradient(to bottom, #000 0, #0000 14px, #0000 calc(100% - 14px), #000 100%)',
                                WebkitMaskImage: 'linear-gradient(to bottom, #000 0, #0000 14px, #0000 calc(100% - 14px), #000 100%)',
                                width: '100%',
                                height: '100%',
                            }}
                        />

                        {/* 与页头同一组渐进模糊，只是 mask 收在上下两端。 */}
                        <div
                            className="rounded-full relative top-[-200%] left-0"
                            style={{
                                ...frostFadeStyle,
                                backdropFilter: 'blur(1px)',
                                maskImage: 'linear-gradient(to bottom, #000 0, #0000 13px, #0000 calc(100% - 13px), #000 100%)',
                                WebkitMaskImage: 'linear-gradient(to bottom, #000 0, #0000 13px, #0000 calc(100% - 13px), #000 100%)',
                                width: '100%',
                                height: '100%',
                            }}
                        />
                        <div
                            className="rounded-full relative top-[-300%] left-0"
                            style={{
                                ...frostFadeStyle,
                                backdropFilter: 'blur(2px)',
                                maskImage: 'linear-gradient(to bottom, #000 0, #0000 9px, #0000 calc(100% - 9px), #000 100%)',
                                WebkitMaskImage: 'linear-gradient(to bottom, #000 0, #0000 9px, #0000 calc(100% - 9px), #000 100%)',
                                width: '100%',
                                height: '100%',
                            }}
                        />
                        <div
                            className="rounded-full relative top-[-400%] left-0"
                            style={{
                                ...frostFadeStyle,
                                backdropFilter: 'blur(5px)',
                                maskImage: 'linear-gradient(to bottom, #000 0, #0000 6px, #0000 calc(100% - 6px), #000 100%)',
                                WebkitMaskImage: 'linear-gradient(to bottom, #000 0, #0000 6px, #0000 calc(100% - 6px), #000 100%)',
                                width: '100%',
                                height: '100%',
                            }}
                        />
                    </motion.div>

                    {/* 页签轨道：竖排。滚动挂在这里，摇杆的滚动补偿才量得到。 */}
                    <div
                        ref={trackRef}
                        {...thumbHandlers}
                        className="relative flex flex-col items-stretch gap-[7px] p-1 cursor-grab active:cursor-grabbing touch-none"
                    >
                        {tabs.map(tab => (
                            <NavTabButton
                                key={tab.key}
                                label={tab.label}
                                title={tab.disabledReason || tab.label}
                                active={!stageIsActive && !extraTabs?.some(item => item.active) && activeTab === tab.key}
                                disabled={Boolean(tab.disabledReason)}
                                icon={<TabIcon tabKey={tab.key} />}
                                onClick={() => onSelectTab(tab.key)}
                                onHover={handleHover}
                                onHoverEnd={clearHover}
                            />
                        ))}

                        {extraTabs?.map(tab => (
                            <NavTabButton
                                key={tab.id}
                                label={tab.label}
                                title={tab.label}
                                active={tab.active}
                                icon={<Layers size={18} className="relative z-20 shrink-0" />}
                                onClick={tab.select}
                                onHover={handleHover}
                                onHoverEnd={clearHover}
                            />
                        ))}

                        {stageEnabled && (
                            <NavTabButton
                                label={t('home.stage')}
                                title={t('home.stage')}
                                active={Boolean(stageIsActive)}
                                icon={<Theater size={18} className="relative z-20 shrink-0" />}
                                onClick={() => onOpenStagePlayer?.()}
                                onHover={handleHover}
                                onHoverEnd={clearHover}
                                dataStageActive={stageIsActive ? 'true' : 'false'}
                            />
                        )}
                    </div>
                </div>

                {/* 设置：原来页头左侧那颗，搬进这个浮动容器里、钉在最底部（mt-auto 把间隔全吃掉）。
                    尺寸与队列拼贴、竖栏同宽（40），圆角拉满；有新版本时右上角点一个强调色圆点。
                    外层 layout + spring：窗口高度变化时它不是瞬间跳过去，而是带一点回弹滑到新位置；
                    layout 只能挂在外层——里面那颗带 data-glass-jelly，transform 归果冻形变用。 */}
                {onOpenSettings && (
                    <motion.div
                        layout
                        transition={{ type: 'spring', stiffness: 260, damping: 26, mass: 0.9 }}
                        className="pointer-events-auto mt-auto"
                    >
                        <button
                            type="button"
                            data-glass
                            data-glass-jelly
                            data-glass-light
                            data-grid3d-settings
                            onClick={onOpenSettings}
                            title={t('ui.options')}
                            aria-label={t('ui.options')}
                            onPointerEnter={event => handleHover(t('ui.options'), event.currentTarget)}
                            onPointerLeave={clearHover}
                            onFocus={event => handleHover(t('ui.options'), event.currentTarget)}
                            onBlur={clearHover}
                            className="relative flex h-10 w-10 items-center justify-center rounded-full transition-colors duration-300"
                            style={glassStyle}
                        >
                            <Settings size={18} style={{ color: 'var(--text-primary)' }} />
                            {updateAvailable && (
                                <span
                                    aria-hidden="true"
                                    className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full"
                                    style={{ backgroundColor: 'var(--text-accent)' }}
                                />
                            )}
                        </button>
                    </motion.div>
                )}

                {/* 共用的悬停标签：常驻一份（一份 data-glass），只是没悬停时不可见。
                    贴着竖栏右侧浮出，纵向位置跟着被悬停的那一项走。 */}
                <span
                    aria-hidden="true"
                    data-glass
                    className="pointer-events-none absolute left-12 z-30 -translate-y-1/2 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-medium transition-opacity duration-150"
                    style={{
                        ...tooltipStyle,
                        top: hovered?.top ?? 0,
                        opacity: hovered ? 1 : 0,
                        visibility: hovered ? 'visible' : 'hidden',
                    }}
                >
                    {hovered?.label ?? ''}
                </span>
            </div>
        </div>
    );
};

export default Grid3DNav;
