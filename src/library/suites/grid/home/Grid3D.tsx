import React, { useState, useEffect, useRef, useDeferredValue } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, Loader2, Settings, PanelsTopLeft } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { resolveSearchSource, useSearchNavigationStore } from '../../../../stores/useSearchNavigationStore';
import { useShallow } from 'zustand/react/shallow';
import { SongResult, LocalSong, LocalPlaylist, LocalLibraryGroup, Theme, type StatusMessage } from '../../../../types';
import LocalGrid3DView from './LocalGrid3DView';
import NavidromeGrid3DView from './NavidromeGrid3DView';
import { useGrid3DTabKeys } from './useGrid3DTabKeys';
import DesktopGrid3DSurface from './DesktopGrid3DSurface';
import OnlineProviderAccountlessPanel from '../account/OnlineProviderAccountlessPanel';
import HomeLoginPanel from '../../../../components/login/HomeLoginPanel';
import SwitcherPill from '../../../../components/login/SwitcherPill';
import ExploreSurface from '../../../../components/app/home/explore/ExploreSurface';
import { createOnlineGridViewCollection } from '../../../../components/app/home/gridViewCollectionAdapters';
import { hasExploreWallEntries } from '../../../../components/app/lattice/exploreWall';
import type { ProviderCollection, ProviderUser } from '../../../../types/onlineMusic';
import { useThemeSettingsStore } from '../../../../stores/useThemeSettingsStore';
import type { LatticeSource } from '../../../../stores/useAppViewStore';
import { useExploreFeedStore } from '../../../../stores/useExploreFeedStore';
import { countRender } from '../../../../dev/renderCount';
import type { LibraryAccountController } from '../../../core/account/account.contract';
import type { LibraryDirectoryBatchController } from '../../../core/directory/directory.contract';
import type { LibraryLocalCatalogSnapshot } from '../../../core/home/home.contract';
import type { LibraryHomeResources } from '../../../core/home/homeModel.contract';
import type { LibraryHomeExtraTab, LibraryDeclaredActions } from '../../../core/suite/suite.contract';
import type { LibraryHomeCard, LibraryHomeListState } from '../../../core/home/homeModel.contract';
import { useLibraryHomeSources } from '../../../core/home/useLibraryHomeSources';
import { useLibraryHomeOnline } from '../../../core/home/online/useLibraryHomeOnline';
import { useLibraryHomeActions } from '../../../core/home/useLibraryHomeActions';
import { useLibraryHomeDirectory } from '../../../core/home/useLibraryHomeDirectory';
import { useLibraryHomeListRegistration, useLibraryHomeTabsRegistration } from '../../../core/home/useLibraryHomeSurfaceRegistration';
import { cycleIndex, isOnlineHomeTab } from '../../../core/home/homeSources';
import { useUpdateIndicator } from '../../../../hooks/useUpdateIndicator';
import { useReducedMotionFor } from '../../../../hooks/useReducedMotionFor';
import { useGlass } from '@/shinoinject/useGlass';
import { useHomeTabThumb } from './useHomeTabThumb';

// src/library/suites/grid/home/Grid3D.tsx
// Glassmorphic interactive desktop home view replacing the legacy 3D carousel.
// Supports cover sliding with auto-fading header controls and delegates GridView opening upward.

interface Grid3DProps {
    /** 在线账户 controller（宿主创建，见 LibraryHomeSurfaceProps）：登录按钮与右下角的切换器读它，换平台、登录、退出都在登录窗口里。 */
    account: LibraryAccountController;
    onPlaySong: (song: SongResult, playlistCtx?: SongResult[], isFmCall?: boolean) => void;
    onBackToPlayer: () => void;
    onRefreshUser: () => void;
    user: ProviderUser | null;
    playlists: ProviderCollection[];
    cloudPlaylist?: ProviderCollection | null;
    currentTrack?: SongResult | null;
    localSongs: LocalSong[];
    localLibraryCatalog: LibraryLocalCatalogSnapshot;
    localPlaylists: LocalPlaylist[];
    onRefreshLocalSongs: () => Promise<void> | void;
    localMusicState: {
        activeRow: 0 | 1 | 2 | 3;
        selectedGroup: LocalLibraryGroup | null;
        detailStack: LocalLibraryGroup[];
        detailOriginView: 'home' | 'player' | null;
        focusedFolderIndex: number;
        focusedAlbumIndex: number;
        focusedArtistIndex: number;
        focusedPlaylistIndex: number;
    };
    setLocalMusicState: React.Dispatch<React.SetStateAction<{
        activeRow: 0 | 1 | 2 | 3;
        selectedGroup: LocalLibraryGroup | null;
        detailStack: LocalLibraryGroup[];
        detailOriginView: 'home' | 'player' | null;
        focusedFolderIndex: number;
        focusedAlbumIndex: number;
        focusedArtistIndex: number;
        focusedPlaylistIndex: number;
    }>>;
    navidromeFocusedAlbumIndex?: number;
    setNavidromeFocusedAlbumIndex?: (index: number) => void;
    onSearchCommitted: (query: string, sourceTab: any, replace?: boolean) => void;
    theme: Theme;
    onOpenSettings?: (initialTab?: 'help' | 'options') => void;
    /** `source`: what the wall shows; the play queue when left out. */
    onOpenLattice?: (source?: LatticeSource) => void;
    navidromeEnabled?: boolean;
    onPlayAll?: (songs: SongResult[]) => void;
    onAddAllToQueue?: (songs: SongResult[]) => void;
    onStatusMessage?: (message: StatusMessage) => void;
    onOpenGridView?: (collection: any) => void;
    stageEnabled?: boolean;
    stageIsActive?: boolean;
    onOpenStagePlayer?: () => void;
    isInteractive?: boolean;
    /** 本地目录的批量动作控制器（宿主创建，见 LibraryHomeSurfaceProps）。 */
    directoryActions?: LibraryDirectoryBatchController;
    /** 首页资源（在线收藏专辑、电台 feed；宿主创建，见 library/app/useLibraryHomeResources）。 */
    homeResources: LibraryHomeResources;
    extraTabs?: readonly LibraryHomeExtraTab[];
    onNativeTabSelected?: () => void;
    /** 网格 suite 在 entry 里声明的首页动作（宿主经 registry 传入）：GridMap 的目录 surface 只发布声明 ∩ core 判定。 */
    declaredActions?: LibraryDeclaredActions;
}

// 一级页签切换时整块首页视图的进出：往页签顺序的右边走就从右边进、旧视图往左出，反向往回。
// direction 为 0（只在同一页签内部换账户面板视图时）不横移，只做淡入淡出。
const HOME_SURFACE_VARIANTS = {
    enter: (direction: number) => ({ x: direction === 0 ? 0 : direction * 40, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (direction: number) => ({ x: direction === 0 ? 0 : direction * -40, opacity: 0 }),
};

// 进出同时进行（AnimatePresence 默认 sync 模式），旧视图淡出、新视图淡入，容器 overflow-hidden 裁掉横移。
// 用同一条 easeOut 曲线、同一个时长，横移与透明度一起落定，看起来才是一块内容在滑动而不是两段动画。
const HOME_SURFACE_TRANSITION = { duration: 0.26, ease: [0.22, 1, 0.36, 1] as const };

export const Grid3D: React.FC<Grid3DProps> = (props) => {
    countRender('Grid3D');
    const {
        onPlaySong,
        onBackToPlayer,
        user,
        playlists,
        cloudPlaylist = null,
        currentTrack,
        localSongs,
        localLibraryCatalog,
        localPlaylists,
        localMusicState,
        setLocalMusicState,
        navidromeFocusedAlbumIndex = 0,
        setNavidromeFocusedAlbumIndex,
        onSearchCommitted,
        theme,
        onOpenSettings,
        onOpenLattice,
        navidromeEnabled = false,
        onOpenGridView,
        stageEnabled = false,
        stageIsActive = false,
        onOpenStagePlayer,
        account,
        isInteractive = true,
        directoryActions,
        homeResources,
        declaredActions,
    } = props;

    const { t, i18n } = useTranslation();
    const {
        isDaylight,
    } = useThemeSettingsStore(useShallow(state => ({
        isDaylight: state.isDaylight,
    })));
    const {
        searchQuery,
        setSearchQuery,
        isSearching,
        submitSearch,
    } = useSearchNavigationStore(useShallow(state => ({
        searchQuery: state.searchQuery,
        setSearchQuery: state.setSearchQuery,
        isSearching: state.isSearching,
        submitSearch: state.submitSearch,
    })));

    // 来源、页签与在线列表都来自 Library Core 的首页模型（core/home/homeSources、homeCards 与首页资源）；
    // 这里只剩展示：布局、登录入口、更新徽标、扫描进度胶囊。
    const homeSources = useLibraryHomeSources({
        account,
        user,
        playlists,
        cloudPlaylist,
        navidromeEnabled,
    });
    const { tab: homeViewTab, setTab: setHomeViewTab, isOnlineTab, online, tabs: homeTabs } = homeSources;
    const activeProviderId = online.providerId;
    const activeProviderLabel = online.providerLabel;
    const activeUser = online.user;
    const activeAccountView = online.accountView;
    const activeProviderNeedsRelogin = online.needsRelogin;

    // 切页签时页签高亮照旧立刻跟上，但下面这整套首页视图（几十张卡片、封面解码、图表与各自的一堆
    // effect）不在同一帧挂上/卸下：交给 useDeferredValue 排进低优先级、可打断的渲染。这样松手切页时
    // 摇杆的吸附弹簧不会被挂载顶掉帧，新视图随后换上（与 VisualizerRenderer 的 shownMode 同一套做法）。
    // 视图用到的派生态（列表、目录会话 key）都跟着 shownTab 走：延迟渲染落地前的那一帧和上一帧完全
    // 一致，旧视图不会被半途换掉 props（否则会先闪一下空列表 / 目录会话与视图错配）。
    const shownTab = useDeferredValue(homeViewTab);
    const shownIsOnlineTab = isOnlineHomeTab(shownTab);
    const shownShowOnlineList = shownIsOnlineTab
        && shownTab !== 'explore'
        && activeAccountView !== 'accountless'
        && activeAccountView !== 'resolving'
        && activeAccountView !== 'guest';

    // 进出方向按页签在一级页签里的先后定：向后面的页签走，新视图从右侧进（direction=1）。
    const shownTabIndex = homeTabs.findIndex(tab => tab.key === shownTab);
    const prevTabIndexRef = useRef(shownTabIndex);
    const tabDirection = shownTabIndex === prevTabIndexRef.current
        ? 0
        : shownTabIndex > prevTabIndexRef.current ? 1 : -1;
    useEffect(() => {
        prevTabIndexRef.current = shownTabIndex;
    }, [shownTabIndex]);

    const reduceMotion = useReducedMotionFor('uiMicroMotion');

    const onlineList = useLibraryHomeOnline(homeResources, { ...homeSources, tab: shownTab });
    const homeActions = homeResources.actions;
    const { snapshot: homeActionState, scanPercent: scanProgressPercent } = useLibraryHomeActions(homeActions);
    const scanProgress = homeActionState.scan;
    // 当前列表的目录会话 key 与隐藏作用域只在首页模型里算一次（core/home/homeSources），交给三个列表视图。
    const { directoryKey, hiddenScope } = useLibraryHomeDirectory({
        tab: shownTab,
        providerId: activeProviderId,
        localRow: localMusicState.activeRow,
    });
    // On the explore tab the wall (队列拼贴) shows the page's entries, not the play queue: it is
    // offered there once the page has an entry to show, with or without a song on the player.
    const opensExploreWall = homeViewTab === 'explore' && online.canUseExplore;
    const hasExploreWall = useExploreFeedStore(state => opensExploreWall && hasExploreWallEntries(state.feed));

    const [focusedIndex, setFocusedIndex] = useState(0);
    const gridRootRef = useRef<HTMLDivElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const [scanDetailsExpanded, setScanDetailsExpanded] = useState(false);

    const showUpdateIndicator = useUpdateIndicator();

    // Reset focused index when switching tabs.
    useEffect(() => {
        setFocusedIndex(0);
    }, [homeViewTab]);

    useEffect(() => {
        setFocusedIndex(0);
    }, [activeProviderId, activeUser?.id]);

    // Delegate GridView opening to the app-level host so Grid3D remains only the home surface.
    // If Personal FM is clicked, it plays Personal FM directly instead of opening GridView.
    const handleSelectCollectionCard = (card: LibraryHomeCard) => {
        void homeActions.openOnlineCard(card, activeProviderId, collection => onOpenGridView?.(collection));
    };

    // 首页模型交给 core 的首页 surface 句柄：页签条，以及在线页签的列表（本地与 Navidrome 由各自的视图注册）。
    useLibraryHomeTabsRegistration({
        getState: () => ({ active: homeViewTab, tabs: homeTabs }),
        setTab: tab => {
            const target = homeTabs.find(candidate => candidate.key === tab);
            if (!target || target.disabledReason) return false;
            props.onNativeTabSelected?.();
            setHomeViewTab(tab);
            return true;
        },
    });
    useLibraryHomeListRegistration({
        enabled: shownShowOnlineList,
        getState: (): LibraryHomeListState => ({
            tab: shownTab,
            directoryKey,
            hiddenScope,
            sections: [],
            items: onlineList.items,
            isLoading: onlineList.isLoading,
            actions: [],
            batchSelectionType: null,
        }),
        setSection: () => false,
        runAction: () => false,
    });

    // Search committed callback
    const handleSearch = async (e?: React.FormEvent) => {
        e?.preventDefault();
        const query = searchQuery.trim();
        if (!query) return;

        const searchSource = isOnlineTab ? activeProviderId : resolveSearchSource(homeViewTab);
        const didSearch = await submitSearch({
            query,
            sourceTab: searchSource,
            deps: {
                localSongs,
                localLibraryCatalog,
                t: (key, fallback) => t(key, fallback ?? ''),
            },
        });

        if (didSearch) {
            onSearchCommitted(query, searchSource);
        }
    };

    const isSearchingActive = isSearching;

    // Background style mappings
    const mainBg = isDaylight ? 'bg-white/40' : 'bg-black/20';
    const inputBg = isDaylight ? 'bg-black/5 focus:bg-black/10' : 'bg-white/5 focus:bg-white/10';
    const navPillInactiveText = isDaylight ? 'text-black/60 hover:text-black' : 'text-white/60 hover:text-white';
    const activeTabBg = 'text-#fff';

    const bottomPadding = currentTrack ? 'pb-28 md:pb-32' : '';

    const focusActiveSlider = () => {
        requestAnimationFrame(() => {
            gridRootRef.current
                ?.querySelector<HTMLElement>('[data-grid3d-slider]')
                ?.focus({ preventScroll: true });
        });
    };

    // 白色摇杆：脱离 button 的独立元素，可拖动、拖动时放大、按所在页签激活；点击页签时自动吸附。
    const pillTrackRef = useRef<HTMLDivElement>(null);
    const { thumbLeft, thumbWidth, thumbDragging, thumbScale, thumbHandlers } =
        useHomeTabThumb({
            trackRef: pillTrackRef,
            items: homeTabs.map(tab => ({
                key: tab.key,
                disabled: Boolean(tab.disabledReason),
            })),
            activeKey: homeViewTab,
            onActivate: setHomeViewTab,
            onTapActive: focusActiveSlider,
        });

    // Tab / Shift+Tab 在可用页签之间循环，切完把焦点交回海报轨道，和点胶囊一样。
    // Tab / Shift+Tab includes contributed pages; opening one hands keyboard focus to its own navigation.
    // Its host disables this native surface while the page is open, so subsequent Tab stays inside the page.
    const navigationTabs = [
        ...homeTabs.map(tab => ({ id: tab.key, enabled: !tab.disabledReason, select: () => {
            setHomeViewTab(tab.key);
            focusActiveSlider();
        } })),
        ...(props.extraTabs ?? []).map(tab => ({ ...tab, enabled: true })),
    ];
    useGrid3DTabKeys({
        isActive: isInteractive,
        onCycleTab: delta => {
            const next = cycleIndex(navigationTabs, navigationTabs.findIndex(tab => tab.id === homeViewTab), delta, tab => tab.enabled);
            if (next < 0 || navigationTabs[next].id === homeViewTab) return;
            navigationTabs[next].select();
        },
    });

    useGlass();

    return (
        <div
            ref={gridRootRef}
            data-ponder-page-scope="grid-page"
            className={`relative w-full h-full flex flex-col font-sans overflow-hidden ${mainBg} pointer-events-auto ${bottomPadding}`}
        >

            {/* Main Header Container (Fades out when sliding/interacting) */}
            <div className="transition-opacity duration-300 ease-in-out z-20 opacity-100 select-none">
                <div className="grid grid-cols-2 md:grid-cols-3 items-center w-full max-w-7xl mx-auto p-4 md:p-8 gap-y-4 md:gap-y-0">
                    {/* Left title and settings */}
                    <div className="flex items-center justify-start order-1 md:order-none gap-[10px]">
                        {/* 左侧按钮组 */}
                        <button
                            data-glass
                            data-glass-jelly
                            data-glass-light
                            onClick={() => onOpenSettings?.('help')}
                            className={`relative flex items-center gap-1.5 p-2.5 rounded-full hover:bg-white/10 transition-all ml-4 w-[40px] h-[40px]`}
                            style={{
                                backgroundColor: isDaylight
                                ? "rgba(255,255,255,0.42)"
                                : "rgba(0, 0, 0, 0.42)",
                                borderTop: isDaylight
                                ? "1px solid rgba(0,0,0,0.08)"
                                : "1px solid rgba(255,255,255,0.12)",
                                borderBottom: isDaylight
                                ? "1px solid rgba(0,0,0,0.08)"
                                : "1px solid rgba(255,255,255,0.12)",
                                outline: "1px solid rgba(40,40,40,0.2)",
                                boxShadow: "2px 2px 8px 2px rgba(40,40,40,0.4)",
                            }}
                            title={t('ui.options')}
                        >
                            <Settings size={20} style={{ color: 'var(--text-primary)' }} />
                            {showUpdateIndicator && (
                                <span className="text-[10px] font-medium text-zinc-800 dark:text-zinc-200 opacity-80 whitespace-nowrap bg-zinc-200/50 dark:bg-white/10 px-2 py-0.5 rounded-md">
                                    {t('options.updateAvailable')}
                                </span>
                            )}
                        </button>
                        
            {onOpenLattice && currentTrack && (
              <button
                data-glass
                data-glass-jelly
                data-glass-light
                onClick={() => onOpenLattice(opensExploreWall ? 'explore' : 'queue')}
                data-testid="home-lattice-pill"
                title={t("home.lattice")}
                aria-label={t("home.lattice")}
                className={`group relative inline-flex items-center justify-center p-2.5 rounded-full text-xs md:text-sm font-medium transition-colors duration-300 whitespace-nowrap ${navPillInactiveText} min-w-[40px] h-[40px]`}
                style={{
                  backgroundColor: isDaylight
                    ? "rgba(255,255,255,0.42)"
                    : "rgba(0, 0, 0, 0.42)",
                  borderTop: isDaylight
                    ? "1px solid rgba(0,0,0,0.08)"
                    : "1px solid rgba(255,255,255,0.12)",
                  borderBottom: isDaylight
                    ? "1px solid rgba(0,0,0,0.08)"
                    : "1px solid rgba(255,255,255,0.12)",
                  outline: "1px solid rgba(40,40,40,0.2)",
                  boxShadow: "2px 2px 8px 2px rgba(40,40,40,0.4)",
                }}
              >
                <PanelsTopLeft size={18} className="relative shrink-0" />
                <span
                  aria-hidden="true"
                  className="relative z-10 max-w-0 overflow-hidden opacity-0 transition-all duration-300 ease-out group-hover:ml-2.5 group-hover:max-w-28 group-hover:opacity-100 group-focus-visible:ml-1.5 group-focus-visible:max-w-28 group-focus-visible:opacity-100"
                >
                  {t("home.latticeLabel")}
                </span>
              </button>
            )}
                        {scanProgress?.active && (
                            <div
                                className="relative ml-3"
                                onMouseEnter={() => setScanDetailsExpanded(true)}
                                onMouseLeave={() => setScanDetailsExpanded(false)}
                            >
                                <button
                                    onClick={() => setScanDetailsExpanded(prev => !prev)}
                                    className="relative rounded-full p-px transition-all"
                                    style={{
                                        background: `conic-gradient(from -90deg, ${isDaylight ? (theme?.accentColor || 'rgba(17,24,39,0.92)') : 'rgba(255,255,255,0.98)'} 0deg ${scanProgressPercent * 3.6}deg, ${isDaylight ? 'rgba(24,24,27,0.16)' : 'rgba(255,255,255,0.14)'} ${scanProgressPercent * 3.6}deg 360deg)`,
                                        borderRadius: '999px'
                                    }}
                                    title={t('options.scanProgress')}
                                >
                                    <div
                                        className={`relative flex items-center justify-center min-w-[56px] h-7 px-2.5 rounded-full backdrop-blur-md ${isDaylight ? 'bg-white/95 text-zinc-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]' : 'bg-zinc-950/92 text-zinc-100'
                                            }`}
                                    >
                                        <span className="relative z-10 text-[10px] font-semibold tabular-nums leading-none">
                                            {scanProgressPercent}%
                                        </span>
                                    </div>
                                </button>
                                <AnimatePresence>
                                    {scanDetailsExpanded && (
                                        <motion.div
                                            initial={{ opacity: 0, y: -6 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: -6 }}
                                            className={`absolute left-0 top-full mt-2 w-72 p-4 rounded-2xl border backdrop-blur-xl shadow-xl ${isDaylight ? 'bg-white/85 border-black/10 text-zinc-800' : 'bg-black/60 border-white/10 text-zinc-100'
                                                }`}
                                        >
                                            <div className="text-sm font-semibold truncate">
                                                {t('options.scanningFolder', { folderName: scanProgress.folderName })}
                                            </div>
                                            <div className={`text-xs mt-1 ${isDaylight ? 'text-zinc-600' : 'text-zinc-300/70'}`}>
                                                {t('options.scanProgressDesc')}
                                            </div>
                                            <div className="mt-3 flex items-center justify-between text-xs font-mono">
                                                <span>{t('ui.progress')}</span>
                                                <span>{Math.min(scanProgress.completedSongs, scanProgress.totalSongs)} / {scanProgress.totalSongs}</span>
                                            </div>
                                            <div className={`mt-2 w-full h-2 rounded-full overflow-hidden ${isDaylight ? 'bg-black/10' : 'bg-white/10'}`}>
                                                <div
                                                    className="h-full rounded-full transition-[width] duration-300 ease-out"
                                                    style={{
                                                        width: `${scanProgress.totalSongs > 0 ? (scanProgress.completedSongs / scanProgress.totalSongs) * 100 : 0}%`,
                                                        backgroundColor: theme?.accentColor || 'var(--text-primary)'
                                                    }}
                                                />
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        )}
                    </div>

                    {/* Center Tab Switcher */}
                    <div
                        data-glass-jelly
                        className="flex justify-center order-3 md:order-none col-span-2 md:col-span-1"
                    >
                        <div className="relative scale-90 md:scale-100 origin-center rounded-full -inset-1" style={{ overflow: 'visible' }}>
                            {/* 玻璃底色单独做绝对定位层，与摇杆、页签同为兄弟层级：摇杆不再嵌在玻璃元素里，
                                否则它自己的液态玻璃 backdrop 只能采到父级已经模糊过的背景，被削弱。 */}
                            <div
                                data-glass-light
                                data-glass
                                aria-hidden="true"
                                className="absolute -inset-1 rounded-full"
                                style={{
                                    backgroundColor: isDaylight ? 'rgba(255,255,255,0.42)' : 'rgba(0, 0, 0, 0.42)',
                                    borderTop: isDaylight ? '1px solid rgba(0,0,0,0.08)' : '1px solid rgba(255,255,255,0.12)',
                                    borderBottom: isDaylight ? '1px solid rgba(0,0,0,0.08)' : '1px solid rgba(255,255,255,0.12)',
                                    outline: '1px solid rgba(40,40,40,0.2)',
                                    boxShadow: '2px 2px 8px 2px rgba(40,40,40,0.4)',
                                }}
                            />
                            {/* 摇杆：按住切换器任意处即吸附到鼠标并跟手，松手按最近页签吸附。层级与玻璃层平级，
                                pointer-events-none 让按下穿透到下面的页签轨道，不挡拖动与点击。 */}
                            <motion.div
                                data-glass-jelly
                                data-glass
                                data-glass-blur="0"
                                aria-hidden="true"
                                className={`absolute top-0 bottom-0 z-10 rounded-full shadow-sm pointer-events-none transition-[background-color,box-shadow] duration-200 ease-out outline outline-1 outline-[rgba(40,40,40,0.2)] ${isDaylight ? 'border-y border-black/[0.08]' : 'border-y border-white/[0.12]'} ${thumbDragging ? 'bg-transparent z-888 shadow-[2px_2px_8px_2px_rgba(40,40,40,0.4)]' : 'bg-[var(--text-accent)]/20 shadow-[2px_2px_8px_2px_rgba(40,40,40,0.4)]'}`}
                                style={{
                                    left: thumbLeft,
                                    width: thumbWidth,
                                    pointerEvents: 'none',
                                    // 按住摇杆（拖动中）时去掉底色，只留摇杆自身的液态玻璃；底色与阴影的进出
                                    // 由上面的 transition 补间，松手复原时不再瞬间跳变。
                                    boxShadow: thumbDragging ? '0 0 4px #000,0 0 8px #fffa' : '',
                                }}
                                animate={{ scale: thumbScale }}
                                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                            />
                            <div
                                ref={pillTrackRef}
                                {...thumbHandlers}
                                className="relative flex items-center gap-0 cursor-grab active:cursor-grabbing touch-none"
                            >
                                {homeTabs.map((tab) => {
                                    const isActive = homeViewTab === tab.key;
                                    return (
                                        <span
                                            key={tab.key}
                                            title={tab.disabledReason || tab.label}
                                            className="inline-flex"
                                        >
                                            <button
                                                data-home-tab
                                                disabled={Boolean(tab.disabledReason)}
                                                aria-label={tab.disabledReason || tab.label}
                                                onClick={() => {
                                                    setHomeViewTab(tab.key);
                                                    focusActiveSlider();
                                                }}
                                                className={`relative inline-flex items-center justify-center px-4 py-1.5 rounded-full text-xs md:text-sm font-medium transition-colors duration-300 whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-35 ${isActive ? activeTabBg : navPillInactiveText}`}
                                            >
                                                <span className="relative z-20">{tab.label}</span>
                                            </button>
                                        </span>
                                    );
                                })}
                                {props.extraTabs?.map(tab => (
                                    <button key={tab.id} type="button" onClick={tab.select}
                                        className={`relative inline-flex items-center justify-center px-4 py-1.5 rounded-full text-xs md:text-sm font-medium whitespace-nowrap ${navPillInactiveText}`}>
                                        {tab.label}
                                    </button>
                                ))}
                                {stageEnabled && (
                                    <button
                                        onClick={() => onOpenStagePlayer?.()}
                                        data-stage-active={stageIsActive ? 'true' : 'false'}
                                        className={`relative inline-flex items-center justify-center px-4 py-1.5 rounded-full text-xs md:text-sm font-medium transition-colors duration-300 whitespace-nowrap ${navPillInactiveText}`}
                                    >
                                        <span className="relative z-10">{t('home.stage')}</span>
                                    </button>
                                )}
                                {/* 播放队列的海报视图和 Stage 一样属于「去哪儿」，所以它在这一排，
                                    而不是标题旁的工具图标。没有在播歌曲时队列也是空的，直接不出现。
                                    平时只占一个图标的宽度，指针悬停或键盘聚焦时才展开文字——这一排
                                    已经有五个内容 tab，多一个常驻文字就把胶囊撑得太长。点击始终直达。
                                    在「探索」页签上它打开的是同一面墙，铺的是探索页的条目（探索拼贴）：
                                    探索页有条目可铺时出现，不看有没有在播歌曲。 */}
                            </div>
                        </div>
                    </div>

                    {/* Right Search Bar */}
                    <div className="flex justify-end order-2 md:order-none">
                        <form
                        onSubmit={handleSearch}
                        className="relative w-full md:w-56 transition-all focus-within:md:w-72  rounded-full"
                        data-glass
                        data-glass-jelly
                        data-glass-light
                        style={{
                            backgroundColor: isDaylight
                            ? "rgba(255,255,255,0.42)"
                            : "rgba(0, 0, 0, 0.42)",
                            borderTop: isDaylight
                            ? "1px solid rgba(0,0,0,0.08)"
                            : "1px solid rgba(255,255,255,0.12)",
                            borderBottom: isDaylight
                            ? "1px solid rgba(0,0,0,0.08)"
                            : "1px solid rgba(255,255,255,0.12)",
                            outline: "1px solid rgba(40,40,40,0.2)",
                            boxShadow: "2px 2px 8px 2px rgba(40,40,40,0.4)",
                            color: isDaylight ? "#000" : "#fff",
                            overflow: "auto",
                        }}
                        >
                            {isSearchingActive ? (
                                <Loader2 className="absolute left-3 top-1/2 w-4 h-4 animate-spin opacity-40 -mt-2" />
                            ) : (
                                <Search
                                    className="absolute left-3 top-1/2 -translate-y-1/2 opacity-40 w-4 h-4 cursor-pointer hover:opacity-100 transition-opacity"
                                    onClick={() => handleSearch()}
                                />
                            )}
                            <input
                                ref={searchInputRef}
                                type="text"
                                placeholder={homeViewTab === 'local' ? t('home.searchLocal') : homeViewTab === 'navidrome' ? t('home.searchNavidrome') : t('home.searchDatabase')}
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                className={`w-full border border-white/10 rounded-full py-2 pl-10 pr-4 text-sm focus:outline-none focus:border-white/20 transition-all placeholder:text-current placeholder:opacity-40 select-text`}
                                style={{ color: 'var(--text-primary)' }}
                            />
                        </form>
                    </div>
                </div>
            </div>

            {/* Desktop Canvas Surface。AnimatePresence 按 shownTab 换视图：旧视图淡出、新视图淡入，
                同时做一次横移（HOME_SURFACE_VARIANTS）。Cross 期间两个视图都绝对定位叠着，所以用
                overflow-hidden 裁掉横移出去的部分。 */}
            <div className="flex-1 min-h-0 relative overflow-hidden">
                <AnimatePresence initial={false} custom={tabDirection} mode="sync">
                    <motion.div
                        key={shownTab}
                        custom={tabDirection}
                        variants={HOME_SURFACE_VARIANTS}
                        initial="enter"
                        animate="center"
                        exit="exit"
                        transition={reduceMotion ? { duration: 0 } : HOME_SURFACE_TRANSITION}
                        className="absolute inset-0 flex flex-col items-center justify-center"
                    >
                {shownIsOnlineTab && activeAccountView === 'accountless' ? (
                    <OnlineProviderAccountlessPanel
                        providerLabel={activeProviderLabel}
                        isDaylight={isDaylight}
                        onSearch={() => searchInputRef.current?.focus()}
                    />
                ) : shownIsOnlineTab && activeAccountView === 'resolving' ? (
                    <div className="flex flex-1 w-full items-center justify-center" aria-busy="true">
                        <Loader2 className="animate-spin opacity-30" size={28} />
                    </div>
                ) : shownIsOnlineTab && activeAccountView === 'guest' ? (
                    // One button: it opens the sign-in window, where the platform is chosen.
                    <HomeLoginPanel account={account} />
                ) : shownTab === 'explore' ? (
                    online.canUseExplore && (
                        <ExploreSurface
                            // Another platform or account starts from its own: how far a section was opened is not carried over.
                            key={`${activeProviderId}:${activeUser?.id ?? ''}`}
                            providerId={activeProviderId}
                            accountId={String(activeUser?.id ?? '')}
                            scope={`${activeUser?.id ?? ''}:${i18n.language}`}
                            onPlaySong={(song, queue) => onPlaySong(song, queue, false)}
                            onOpenCollection={collection => onOpenGridView?.(createOnlineGridViewCollection(collection, activeProviderId))}
                        />
                    )
                ) : shownShowOnlineList ? (
                    <DesktopGrid3DSurface
                        focusMemoryScope={JSON.stringify(['online', activeProviderId, activeUser?.id ?? null, shownTab])}
                        title={onlineList.title}
                        mapButtonLabel={t('home.allAlbums')}
                        items={onlineList.items}
                        focusedIndex={focusedIndex}
                        onFocusedIndexChange={setFocusedIndex}
                        onSelect={item => handleSelectCollectionCard(item as LibraryHomeCard)}
                        isLoading={onlineList.isLoading}
                        emptyMessage={onlineList.emptyMessage}
                        theme={theme}
                        isDaylight={isDaylight}
                        isInteractive={isInteractive}
                        hasFloatingPlayer={Boolean(currentTrack)}
                        playlistVisibilityScope={hiddenScope}
                        directoryKey={directoryKey}
                        declaredHomeActions={declaredActions}
                    />
                ) : shownTab === 'local' ? (
                    <div className="w-full h-full flex-1">
                        <LocalGrid3DView
                            localSongs={localSongs}
                            localPlaylists={localPlaylists}
                            localLibraryCatalog={localLibraryCatalog}
                            activeRow={localMusicState.activeRow}
                            setActiveRow={(row) => setLocalMusicState(prev => ({ ...prev, activeRow: row }))}
                            focusedFolderIndex={localMusicState.focusedFolderIndex}
                            setFocusedFolderIndex={(index) => setLocalMusicState(prev => ({ ...prev, focusedFolderIndex: index }))}
                            focusedAlbumIndex={localMusicState.focusedAlbumIndex}
                            setFocusedAlbumIndex={(index) => setLocalMusicState(prev => ({ ...prev, focusedAlbumIndex: index }))}
                            focusedArtistIndex={localMusicState.focusedArtistIndex}
                            setFocusedArtistIndex={(index) => setLocalMusicState(prev => ({ ...prev, focusedArtistIndex: index }))}
                            focusedPlaylistIndex={localMusicState.focusedPlaylistIndex}
                            setFocusedPlaylistIndex={(index) => setLocalMusicState(prev => ({ ...prev, focusedPlaylistIndex: index }))}
                            homeActions={homeActions}
                            directoryTreesResource={homeResources.localDirectoryTrees}
                            directoryKey={directoryKey}
                            theme={theme}
                            isDaylight={isDaylight}
                            isInteractive={isInteractive}
                            hasFloatingPlayer={Boolean(currentTrack)}
                            onOpenGridView={onOpenGridView}
                            directoryActions={directoryActions}
                            declaredHomeActions={declaredActions}
                        />
                    </div>
                ) : (
                    <div className="w-full h-full flex-1">
                        <NavidromeGrid3DView
                            theme={theme}
                            isDaylight={isDaylight}
                            isInteractive={isInteractive}
                            focusedAlbumIndex={navidromeFocusedAlbumIndex}
                            setFocusedAlbumIndex={setNavidromeFocusedAlbumIndex ?? (() => { })}
                            hasFloatingPlayer={Boolean(currentTrack)}
                            homeActions={homeActions}
                            overview={homeResources.navidromeOverview}
                            directoryKey={directoryKey}
                            declaredHomeActions={declaredActions}
                            onOpenSettings={() => onOpenSettings?.('help')}
                            onOpenGridView={onOpenGridView}
                        />
                    </div>
                )}
                    </motion.div>
                </AnimatePresence>
            </div>

            {/* The active account and the way back to the player; the sign-in window opens from it. */}
            <SwitcherPill account={account} onBackToPlayer={onBackToPlayer} />

        </div>
    );
};

export default Grid3D;
