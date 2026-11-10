import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion, useMotionValue, useSpring } from 'framer-motion';
import { Loader2, PanelsTopLeft, Search, Settings } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import type { SongResult } from '../../../types';
import type { LibraryHomeSurfaceProps } from '../../core/suite/suite.contract';
import type { LibraryHomeCard } from '../../core/home/homeModel.contract';
import { useLibraryHomeSources } from '../../core/home/useLibraryHomeSources';
import { useLibraryHomeOnline } from '../../core/home/online/useLibraryHomeOnline';
import { useLibraryHomeDirectory } from '../../core/home/useLibraryHomeDirectory';
import { useLibraryHomeListRegistration, useLibraryHomeTabsRegistration } from '../../core/home/useLibraryHomeSurfaceRegistration';
import { isOnlineHomeTab } from '../../core/home/homeSources';
import { LOCAL_HOME_SECTIONS, buildLocalHomeCards, buildLocalHomeGroups } from '../../core/home/localHomeModel';
import { getLocalCoverAssetUrl } from '../../../services/localCoverAssetUrl';
import { createOnlineGridViewCollection } from '../../../components/app/home/gridViewCollectionAdapters';
import { useOwnExploreSections } from '../../../components/app/home/explore/ownSections';
import { useExploreFeedStore } from '../../../stores/useExploreFeedStore';
import { useThemeSettingsStore } from '../../../stores/useThemeSettingsStore';
import { resolveSearchSource, useSearchNavigationStore } from '../../../stores/useSearchNavigationStore';
import { useReducedMotionFor } from '../../../hooks/useReducedMotionFor';
import { useGlass } from '@/shinoinject/useGlass';
import VerticalShelf, { type VerticalShelfItem } from './VerticalShelf';
import './vertical.css';

// src/library/suites/vertical/VerticalHome.tsx
// 垂直样式（Windows Media Center 那种）：一棵竖着的树。一级页签是树上的几根枝，从上往下排成单列，
// 滚到中间的那一根就地展开自己的内容——入口、封面、说明都缩进在它的标签下面，不是另起一栏。
//
// - 没有左右分栏：标题和展开的内容在同一个纵向流里，展开只把下面的枝往下推。
// - 展开跟着滚动走：停止滚动后停在中间的那根自动成为当前枝并展开；点任意一根，它自己滚到中间。
// - 数据全来自 core/home（与网格同一套 hook）；封面、本地的四组、探索的分区由这一套件自己画，不引用别的 suite。
// - 顶部只有三个入口：设置、队列拼贴、搜索。

/** 一次滚轮手势内连发的 delta 合并成一次，免得触控板一下滑过好几根。 */
const WHEEL_STEP_LOCK_MS = 200;
/** 当前标题底边与内容块上沿之间留的空隙。 */
const PANEL_GAP = 18;

type ExploreEntry = {
    id: string;
    name: string;
    coverUrl?: string;
    song?: SongResult;
    collection?: Parameters<typeof createOnlineGridViewCollection>[0];
};

const VerticalHome: React.FC<LibraryHomeSurfaceProps> = (props) => {
    const {
        account,
        homeResources,
        onPlaySong,
        onBackToPlayer,
        localSongs,
        localPlaylists,
        localLibraryCatalog,
        localMusicState,
        setLocalMusicState,
        navidromeEnabled = false,
        onOpenGridView,
        onOpenSettings,
        onOpenLattice,
        onSearchCommitted,
        currentTrack,
        user,
        playlists,
        cloudPlaylist = null,
    } = props;
    const { t, i18n } = useTranslation();
    const isDaylight = useThemeSettingsStore(useShallow(state => state.isDaylight));
    const calm = useReducedMotionFor('uiMicroMotion');
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
    const searchInputRef = useRef<HTMLInputElement>(null);

    const homeSources = useLibraryHomeSources({ account, user, playlists, cloudPlaylist, navidromeEnabled });
    const { tab, setTab, tabs, online } = homeSources;
    const activeProviderId = online.providerId;
    const activeUser = online.user;
    const activeAccountView = online.accountView;
    const activeProviderLabel = online.providerLabel;

    const onlineList = useLibraryHomeOnline(homeResources, { ...homeSources, tab });
    const homeActions = homeResources.actions;
    const { directoryKey, hiddenScope } = useLibraryHomeDirectory({
        tab,
        providerId: activeProviderId,
        localRow: localMusicState.activeRow,
    });

    const activeIndex = Math.max(tabs.findIndex(candidate => candidate.key === tab), 0);

    // ---------- 树：内容钉在正中，标题是一根绕着它滑的轨道 ----------
    const stageRef = useRef<HTMLDivElement>(null);
    const railRef = useRef<HTMLDivElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const branchRefs = useRef(new Map<string, HTMLButtonElement>());
    const wheelStepAt = useRef(0);
    const [panelHeight, setPanelHeight] = useState(0);
    // 轨道的位移：让当前枝的底边停在内容块上沿之上 PANEL_GAP 处。走 spring，换枝滑过去。
    const railYTarget = useMotionValue(0);
    const railYSpring = useSpring(railYTarget, { stiffness: 340, damping: 36, mass: 0.9 });
    const railY = calm ? railYTarget : railYSpring;

    // 内容块高度固定（CSS 给的），只随窗口变，所以它永远是同一个位置。
    useLayoutEffect(() => {
        const panel = panelRef.current;
        if (!panel) return;
        const sync = () => setPanelHeight(panel.offsetHeight);
        sync();
        const observer = new ResizeObserver(sync);
        observer.observe(panel);
        return () => observer.disconnect();
    }, []);

    const measureRail = useCallback(() => {
        const stage = stageRef.current;
        const rail = railRef.current;
        const node = branchRefs.current.get(tab);
        if (!stage || !rail || !node || panelHeight <= 0) return;
        // 用 offsetTop 累加而不是 rect：rect 里已经含了正在做动画的 transform，越量越偏。
        let top = 0;
        let current: HTMLElement | null = node;
        while (current && current !== rail) {
            top += current.offsetTop;
            current = current.offsetParent as HTMLElement | null;
        }
        const bottom = top + node.offsetHeight;
        const panelTop = stage.clientHeight / 2 - panelHeight / 2;
        railYTarget.set(panelTop - PANEL_GAP - bottom);
    }, [panelHeight, tab, railYTarget]);

    useLayoutEffect(() => {
        measureRail();
    }, [measureRail]);

    useLayoutEffect(() => {
        const stage = stageRef.current;
        if (!stage) return;
        const observer = new ResizeObserver(() => measureRail());
        observer.observe(stage);
        return () => observer.disconnect();
    }, [measureRail]);

    // 上下键 / 滚轮 / 外部循环命令：按枝走一格，跳过不可用的。
    const step = useCallback((delta: 1 | -1) => {
        const count = tabs.length;
        if (count === 0) return;
        for (let offset = 1; offset <= count; offset += 1) {
            const candidate = tabs[(((activeIndex + delta * offset) % count) + count) % count];
            if (candidate && !candidate.disabledReason) {
                setTab(candidate.key);
                return;
            }
        }
    }, [activeIndex, setTab, tabs]);

    // 滚轮：不做平滑滚动，一次手势换一根——往下滚下一根，往上滚上一根；位移交给树自己的弹簧。
    // 用原生非 passive 监听，否则 preventDefault 不起作用，容器还会自己滚。
    useEffect(() => {
        const stage = stageRef.current;
        if (!stage) return;
        const onWheel = (event: WheelEvent) => {
            if (Math.abs(event.deltaY) < 4) return;
            event.preventDefault();
            const now = Date.now();
            if (now - wheelStepAt.current < WHEEL_STEP_LOCK_MS) return;
            wheelStepAt.current = now;
            step(event.deltaY > 0 ? 1 : -1);
        };
        stage.addEventListener('wheel', onWheel, { passive: false });
        return () => stage.removeEventListener('wheel', onWheel);
    }, [step]);

    useLibraryHomeTabsRegistration({
        getState: () => ({ active: tab, tabs }),
        setTab: key => {
            const target = tabs.find(candidate => candidate.key === key);
            if (!target || target.disabledReason) return false;
            setTab(key);
            return true;
        },
        cycleTab: delta => {
            step(delta);
            return true;
        },
    });
    const showOnlineList = isOnlineHomeTab(tab) && tab !== 'explore'
        && activeAccountView !== 'accountless'
        && activeAccountView !== 'resolving'
        && activeAccountView !== 'guest';
    useLibraryHomeListRegistration({
        enabled: showOnlineList,
        getState: () => ({
            tab,
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

    // ---------- 探索：分区（子入口）与分区里的条目 ----------
    const exploreAccountId = String(activeUser?.id ?? '');
    const exploreScope = `${exploreAccountId}:${i18n.language}`;
    const exploreKey = `${activeProviderId}:${exploreScope}`;
    const exploreFeed = useExploreFeedStore(state => (state.key === exploreKey ? state.feed : null));
    const ownExploreSections = useOwnExploreSections(activeProviderId, exploreAccountId);
    const exploreSections = useMemo(() => {
        const provided = (exploreFeed?.sections ?? []).filter(section => section.items.length > 0);
        return ownExploreSections.length > 0 ? [...ownExploreSections, ...provided] : provided;
    }, [ownExploreSections, exploreFeed]);
    const [exploreSectionId, setExploreSectionId] = useState<string | null>(null);
    useEffect(() => {
        setExploreSectionId(null);
    }, [exploreKey]);
    const activeExploreSection = exploreSections.find(section => section.id === exploreSectionId) ?? exploreSections[0];
    const exploreEntries = useMemo<ExploreEntry[]>(() => (activeExploreSection?.items ?? []).slice(0, 30).map(item => (
        item.kind === 'song'
            ? {
                id: `song-${item.song.id}`,
                name: item.song.name,
                coverUrl: item.wideCoverUrl ?? item.song.album.coverUrl,
                song: item.song as unknown as SongResult,
            }
            : {
                id: `collection-${item.collection.id}`,
                name: item.collection.name,
                coverUrl: item.wideCoverUrl ?? item.collection.coverUrl,
                collection: item.collection as unknown as Parameters<typeof createOnlineGridViewCollection>[0],
            }
    )), [activeExploreSection]);

    // ---------- 本地：四组 ----------
    const localGroups = useMemo(() => buildLocalHomeGroups(
        localSongs,
        localPlaylists,
        t,
        localLibraryCatalog ? { entities: localLibraryCatalog.entities, assignments: localLibraryCatalog.assignments } : undefined,
        getLocalCoverAssetUrl,
    ), [localLibraryCatalog, localPlaylists, localSongs, t]);
    const [localSectionKey, setLocalSectionKey] = useState<typeof LOCAL_HOME_SECTIONS[number]['key']>('folders');
    const localSection = LOCAL_HOME_SECTIONS.find(section => section.key === localSectionKey) ?? LOCAL_HOME_SECTIONS[0];
    const localCards = useMemo(() => buildLocalHomeCards(localGroups[localSection.key] ?? []), [localGroups, localSection.key]);

    const openLocalCard = (card: LibraryHomeCard) => {
        const group = card.raw;
        if (group && typeof group === 'object' && 'songs' in group) {
            homeActions.openLocalGroup(group as Parameters<typeof homeActions.openLocalGroup>[0], collection => onOpenGridView?.(collection));
        }
    };

    const handleSearch = async (event?: React.FormEvent) => {
        event?.preventDefault();
        const query = searchQuery.trim();
        if (!query) return;
        const source = isOnlineHomeTab(tab) ? activeProviderId : resolveSearchSource(tab);
        const didSearch = await submitSearch({
            query,
            sourceTab: source,
            deps: {
                localSongs,
                localLibraryCatalog,
                t: (key, fallback) => t(key, fallback ?? ''),
            },
        });
        if (didSearch) onSearchCommitted(query, source);
    };

    useGlass();

    // 顶部这几块与网格首页的按钮、搜索框是同一层玻璃：同一组底色 / 上下亮边 / 外描边 / 投影。
    // 数值逐字照抄 grid/home/Grid3D.tsx，改那边时这里要一起改，否则两套界面的质感会对不上。
    const glassChromeStyle: React.CSSProperties = {
        backgroundColor: isDaylight ? 'rgba(215,215,215,0.42)' : 'rgba(40, 40, 40, 0.42)',
        borderTop: isDaylight ? '1px solid rgba(255,255,255,0.32)' : '1px solid rgba(255,255,255,0.22)',
        borderBottom: isDaylight ? '1px solid rgba(255,255,255,0.32)' : '1px solid rgba(255,255,255,0.22)',
        outline: '1px solid rgba(40,40,40,0.2)',
        boxShadow: '2px 2px 8px 2px rgba(40,40,40,0.4)',
    };

    // ---------- 中间那一项展开的内容 ----------
    const onlineBlocked = activeAccountView === 'accountless' || activeAccountView === 'resolving' || activeAccountView === 'guest';

    const body = (() => {
        if (tab === 'local') {
            return {
                entries: LOCAL_HOME_SECTIONS.map(section => ({
                    id: section.key,
                    label: t(section.labelKey),
                    active: section.key === localSectionKey,
                    select: () => {
                        setLocalSectionKey(section.key);
                        setLocalMusicState(previous => ({ ...previous, activeRow: section.row }));
                    },
                })),
                caption: t(localSection.labelKey),
                shelf: (
                    <VerticalShelf
                        items={localCards.map(card => ({ id: card.id, name: card.name, coverUrl: card.coverUrl, description: card.description }))}
                        isLoading={Boolean(localLibraryCatalog && !localLibraryCatalog.ready)}
                        loadingLabel={t('libraryVertical.loading')}
                        emptyMessage={t(localSection.emptyKey)}
                        onSelect={(_item, index) => {
                            const card = localCards[index];
                            if (card) openLocalCard(card);
                        }}
                    />
                ),
            };
        }
        if (tab === 'explore') {
            if (!online.canUseExplore) {
                return { entries: [], caption: '', shelf: <div className="vertical-note">{t('libraryVertical.exploreUnavailable')}</div> };
            }
            return {
                entries: exploreSections.map(section => ({
                    id: section.id,
                    label: section.title,
                    active: section.id === activeExploreSection?.id,
                    select: () => setExploreSectionId(section.id),
                })),
                caption: activeExploreSection?.title ?? t('libraryVertical.exploreAll'),
                shelf: (
                    <VerticalShelf
                        items={exploreEntries.map(entry => ({ id: entry.id, name: entry.name, coverUrl: entry.coverUrl }))}
                        loadingLabel={t('libraryVertical.loading')}
                        onSelect={(_item, index) => {
                            const entry = exploreEntries[index];
                            if (!entry) return;
                            if (entry.song) onPlaySong(entry.song, [], false);
                            else if (entry.collection) onOpenGridView?.(createOnlineGridViewCollection(entry.collection, activeProviderId));
                        }}
                    />
                ),
            };
        }
        if (onlineBlocked) {
            return {
                entries: [],
                caption: '',
                shelf: <div className="vertical-note">{t('libraryVertical.needsSignIn', { name: activeProviderLabel })}</div>,
            };
        }
        const items: VerticalShelfItem[] = onlineList.items.map(item => ({
            id: item.id,
            name: item.name,
            coverUrl: item.coverUrl,
            description: item.description,
        }));
        return {
            entries: [],
            caption: onlineList.title,
            shelf: (
                <VerticalShelf
                    items={items}
                    isLoading={onlineList.isLoading}
                    loadingLabel={t('libraryVertical.loading')}
                    emptyMessage={onlineList.emptyMessage}
                    onSelect={(_item, index) => {
                        const card = onlineList.items[index] as unknown as LibraryHomeCard | undefined;
                        if (card) void homeActions.openOnlineCard(card, activeProviderId, collection => onOpenGridView?.(collection));
                    }}
                />
            ),
        };
    })();

    return (
        <div
            className="relative flex h-full w-full flex-col overflow-hidden font-sans"
            data-vertical-home
            data-daylight={isDaylight || undefined}
        >
            {/* 顶部只有三个入口：设置、队列拼贴、搜索。 */}
            <header className="vertical-topbar">
                {/* 左侧一组按钮照网格首页退 ml-4、间隔 10px。 */}
                <div className="ml-4 flex items-center gap-[10px]">
                    <button
                        type="button"
                        data-glass
                        data-glass-jelly
                        data-glass-light
                        className="vertical-icon-button"
                        style={glassChromeStyle}
                        onClick={() => onOpenSettings?.('help')}
                        title={t('ui.options')}
                        aria-label={t('ui.options')}
                    >
                        <Settings size={20} style={{ color: 'var(--text-primary)' }} />
                    </button>
                    {onOpenLattice && currentTrack && (
                        <button
                            type="button"
                            data-glass
                            data-glass-jelly
                            data-glass-light
                            className="vertical-icon-button"
                            style={glassChromeStyle}
                            onClick={() => onOpenLattice('queue')}
                            title={t('home.lattice')}
                            aria-label={t('home.lattice')}
                        >
                            <PanelsTopLeft size={20} style={{ color: 'var(--text-primary)' }} />
                        </button>
                    )}
                </div>
                <form
                    onSubmit={handleSearch}
                    role="search"
                    data-glass
                    data-glass-jelly
                    data-glass-light
                    className="vertical-search"
                    style={{ ...glassChromeStyle, color: 'var(--text-primary)' }}
                >
                    {isSearching
                        ? <Loader2 className="absolute left-3 top-1/2 -mt-2 h-4 w-4 animate-spin opacity-40" />
                        : (
                            <Search
                                className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 cursor-pointer opacity-40 transition-opacity hover:opacity-100"
                                onClick={() => void handleSearch()}
                            />
                        )}
                    <input
                        ref={searchInputRef}
                        type="text"
                        data-vertical-search
                        placeholder={tab === 'local' ? t('home.searchLocal') : tab === 'navidrome' ? t('home.searchNavidrome') : t('home.searchDatabase')}
                        value={searchQuery}
                        onChange={event => setSearchQuery(event.target.value)}
                    />
                </form>
            </header>

            {/* 树：中间那块内容钉住不动，标题是一根绕着它滑的轨道；当前枝停在内容块上沿。 */}
            <div
                ref={stageRef}
                className="vertical-tree-stage"
                data-vertical-tree
                onKeyDown={event => {
                    if (event.key === 'ArrowDown') {
                        event.preventDefault();
                        step(1);
                    } else if (event.key === 'ArrowUp') {
                        event.preventDefault();
                        step(-1);
                    }
                }}
            >
                <motion.div
                    ref={railRef}
                    className="vertical-tree-rail"
                    style={{ y: railY }}
                >
                    <ul className="vertical-tree" aria-label={t('libraryVertical.navLabel')}>
                        {tabs.map(candidate => {
                            const active = candidate.key === tab;
                            return (
                                <React.Fragment key={candidate.key}>
                                    <li
                                        className="vertical-branch"
                                        data-branch={candidate.key}
                                        data-open={active || undefined}
                                    >
                                        <motion.button
                                            type="button"
                                            ref={node => {
                                                if (node) branchRefs.current.set(candidate.key, node);
                                                else branchRefs.current.delete(candidate.key);
                                            }}
                                            data-vertical-branch={candidate.key}
                                            data-active={active || undefined}
                                            aria-expanded={active}
                                            disabled={Boolean(candidate.disabledReason)}
                                            title={candidate.disabledReason || candidate.label}
                                            className="vertical-branch-label"
                                            animate={{ opacity: active ? 1 : 0.5 }}
                                            transition={calm ? { duration: 0 } : { duration: 0.36, ease: [0.22, 1, 0.36, 1] }}
                                            onClick={() => {
                                                if (candidate.disabledReason) return;
                                                setTab(candidate.key);
                                            }}
                                        >
                                            {candidate.label}
                                        </motion.button>
                                    </li>
                                    {/* 当前枝下面让出内容块的位置：下面的标题才会落到内容块下方，而不是压在它上面。 */}
                                    {active && (
                                        <li
                                            className="vertical-tree-gap"
                                            aria-hidden
                                            style={{ height: panelHeight + PANEL_GAP * 2 }}
                                        />
                                    )}
                                </React.Fragment>
                            );
                        })}
                    </ul>
                </motion.div>

                {/* 内容块：位置和高度都由 CSS 钉死，换枝只换里面的东西，不跟着轨道动。 */}
                <div ref={panelRef} className="vertical-tree-panel" data-vertical-panel>
                    <AnimatePresence mode="wait" initial={false}>
                        <motion.div
                            key={`${tab}-${localSectionKey}-${activeExploreSection?.id ?? ''}`}
                            className="vertical-panel-body"
                            // 不做淡入淡出：从左上角开始，宽高从 0 一路展开到整块（clip 掉右下）。
                            initial={calm ? false : { clipPath: 'inset(0% 100% 100% 0%)' }}
                            animate={{ clipPath: 'inset(0% 0% 0% 0%)' }}
                            exit={{ clipPath: 'inset(0% 100% 100% 0%)' }}
                            transition={{ duration: calm ? 0 : 0.34, ease: [0.22, 1, 0.36, 1] }}
                        >
                            {body.entries.length > 0 && (
                                <div className="vertical-entries">
                                    {body.entries.map(entry => (
                                        <button
                                            key={entry.id}
                                            type="button"
                                            data-vertical-entry={entry.id}
                                            data-active={entry.active || undefined}
                                            className="vertical-entry"
                                            onClick={entry.select}
                                        >
                                            <span className="vertical-entry-mark" aria-hidden />
                                            <span className="vertical-entry-label">{entry.label}</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                            <div className="vertical-body-shelf">{body.shelf}</div>
                            {body.caption && <div className="vertical-caption">{body.caption}</div>}
                        </motion.div>
                    </AnimatePresence>
                </div>
            </div>

            {onBackToPlayer && (
                <div className="vertical-footer">
                    <button type="button" className="vertical-back" onClick={onBackToPlayer}>
                        {t('libraryVertical.backToPlayer')}
                    </button>
                </div>
            )}
        </div>
    );
};

export default VerticalHome;
