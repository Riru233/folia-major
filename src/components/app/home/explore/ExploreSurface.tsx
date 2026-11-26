import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Loader2, RefreshCw } from 'lucide-react';
import { useGlass } from '@/shinoinject/useGlass';
import { useThemeSettingsStore } from '../../../../stores/useThemeSettingsStore';
import type { SongResult } from '../../../../types';
import type { OmniCollection, OmniProviderId } from '../../../../types/onlineMusic';
import { exploreScroll, useExploreFeedStore } from '../../../../stores/useExploreFeedStore';
import { ExploreEdgeBlur } from './ExploreEdgeBlur';
import { ExploreLight } from './ExploreLight';
import { ExploreScrollbar } from './ExploreScrollbar';
import { EXPLORE_PILL, EXPLORE_TOKENS, ExploreSections } from './ExploreSections';
import { useExploreTilt } from './exploreTilt';
import { OWN_SECTION_IDS, listenedSongsOf, useOwnExploreSections } from './ownSections';
import { LoadingRing } from '../../../shared/LoadingRing';

// src/components/app/home/explore/ExploreSurface.tsx
// The explore tab of the home screen, as sections one under another. A section is the same
// thing wherever it comes from (`OmniExploreSection`), and comes from one of two places:
//  - the app's own sections (ownSections.ts), made of what was played here: they stand first,
//    are the same under every provider, and are shown whatever state the provider's page is in
//    (being read, not read, empty), with that state under them;
//  - the active provider's recommendation page (useExploreFeedStore, behind it the provider's
//    `OnlineExploreProvider`). Reaching the end of the list reads the page's further sections.
// Nothing here knows which provider it is: another one needs its own `OnlineExploreProvider`.
// The page's own control ("refresh") is not part of the list: it floats over the list's bottom
// right corner as a large liquid-glass button and stays there while the list scrolls under it.
// What passes under the list's edges blurs and fades out (ExploreEdgeBlur.tsx).
// Two things belong to the page as a whole and not to any entry: its light (ExploreLight.tsx),
// which stands behind the list, and that a picture leans to the pointer over it (exploreTilt.ts).

// How far down from its top edge the list fades what has scrolled up to it, in pixels.
const TOP_FADE = 120;
// How far up from its bottom edge the list fades what has not been scrolled to yet, in pixels.
const BOTTOM_FADE = 70;
// The mark that more is being read and the offer to try again, at the list's end, are EDGE_BLURSone height: the list does not move under a listener who stands there when one takes the other's place. (It does once, by this much, when the list turns out to end there.)
const END = 'flex h-28 items-center justify-center';
const NO_BATCHES = {};

interface ExploreSurfaceProps {
    providerId: OmniProviderId;
    /** The account the page is read for; '' when nobody is signed in. */
    accountId: string;
    /** The account and the language the page is read for; another scope is another page. */
    scope: string;
    onPlaySong: (song: SongResult, queue: SongResult[]) => void;
    onOpenCollection: (collection: OmniCollection) => void;
}

export const ExploreSurface: React.FC<ExploreSurfaceProps> = ({ providerId, accountId, scope, onPlaySong, onOpenCollection }) => {
    const { t } = useTranslation();
    const isDaylight = useThemeSettingsStore(state => state.isDaylight);
    // The refresh button is liquid glass: wire the page's own glass scan (idempotent, every commit).
    useGlass();
    const key = `${providerId}:${scope}`;
    const keptKey = useExploreFeedStore(state => state.key);
    const feed = useExploreFeedStore(state => (state.key === key ? state.feed : null));
    const show = useExploreFeedStore(state => state.show);
    const refresh = useExploreFeedStore(state => state.refresh);
    const loadMore = useExploreFeedStore(state => state.loadMore);
    const loadMoreOf = useExploreFeedStore(state => state.loadMoreOf);
    // Entered: hold the sections back for a moment behind a loading ring. The sections carry motion
    // transitions that are heavy enough to drop frames against the tab's own slide-in; giving that
    // animation a clear frame first is what keeps the entry smooth. The provider's page is still
    // read meanwhile, so it is usually there by the time the ring goes.
    const [ready, setReady] = useState(false);
    useEffect(() => {
        const id = window.setTimeout(() => setReady(true), 1000);
        return () => window.clearTimeout(id);
    }, []);
    const list = useRef<HTMLDivElement>(null);
    // The floating scrollbar points at the list through this id; one page per surface.
    const listId = useId();
    const end = useRef<HTMLDivElement>(null);
    useExploreTilt(list);
    // What follows the scroll without a render: how far the list's edges fade what passes under
    // them (nothing at the very top / bottom). The refresh button floats at a fixed corner, so
    // it needs no scroll-driven state.
    const follow = useCallback(() => {
        const element = list.current;
        if (!element) return;
        const top = element.scrollTop;
        // What still stands below the bottom edge: nothing at the end, so nothing to fade there.
        const below = element.scrollHeight - element.clientHeight - top;
        element.style.setProperty('--ex-top-fade', `${Math.min(top, TOP_FADE)}px`);
        element.style.setProperty('--ex-bottom-fade', `${Math.min(Math.max(below, 0), BOTTOM_FADE)}px`);
    }, []);
    // The width of the list's scrollbar, which comes and goes with what the list holds: the
    // control keeps clear of it, in line with the heading rows.
    const [barWidth, setBarWidth] = useState(0);
    useLayoutEffect(() => {
        const element = list.current;
        if (!element || typeof ResizeObserver === 'undefined') return undefined;
        const measure = () => {
            setBarWidth(element.offsetWidth - element.clientWidth);
            // Sections arriving (or the list changing height) change what stands below the
            // bottom edge without a scroll event.
            follow();
        };
        const observer = new ResizeObserver(measure);
        observer.observe(element);
        if (element.firstElementChild) observer.observe(element.firstElementChild);
        measure();
        return () => observer.disconnect();
    }, [follow]);

    // What the listener played here, as it is when the provider's page is read: the provider may make sections out of it.
    const listened = useCallback(() => listenedSongsOf(providerId, accountId), [providerId, accountId]);
    const readAgain = useCallback(() => refresh(listened()), [refresh, listened]);
    // Also when the store let go of this key: a read overtaken by a provider switch leaves nothing kept.
    useEffect(() => { show(key, listened()); }, [key, keptKey, show, listened]);

    // A section that holds nothing is not shown; a page of such sections is an empty page.
    const provided = (feed?.sections ?? []).filter(section => section.items.length > 0);
    const own = useOwnExploreSections(providerId, accountId);
    const sections = own.length > 0 ? [...own, ...provided] : provided;
    const hasMore = Boolean(feed?.nextCursor);
    const hasSections = sections.length > 0;
    // Back where the listener left the kept page; another page starts from its top.
    useLayoutEffect(() => {
        if (hasSections && list.current) list.current.scrollTop = exploreScroll.top;
        follow();
        // (`ready`: while the ring stands in the list holds nothing, so the place can only be put back once the sections are on the page.)
        // (`feed?.status`: the control is put over the list when the provider's page has arrived, which with sections of the app's own on screen is none of the other moments.)
    }, [follow, hasSections, feed?.status, feed?.read, ready]);

    // Not while another page is being read in place of this one: its end asks for nothing then.
    const awaitsMore = hasMore && !feed?.loadingMore && !feed?.moreFailed && !feed?.refreshing;
    // Watched anew after every answer: an end that is still in view then asks for the next page.
    useEffect(() => {
        if (!awaitsMore || !end.current || typeof IntersectionObserver === 'undefined') return undefined;
        const observer = new IntersectionObserver(entries => {
            if (entries.some(entry => entry.isIntersecting)) void loadMore();
        }, { root: list.current, rootMargin: '200px' });
        observer.observe(end.current);
        return () => observer.disconnect();
    }, [awaitsMore, loadMore, sections.length]);

    const isLoading = !feed || feed.status === 'loading';
    const failed = (
        <div className="flex flex-col items-center gap-4 py-24 text-sm text-[color:var(--ex-soft)]">
            <span>{t('home.exploreFailed')}</span>
            <button type="button" data-explore-retry-page onClick={readAgain} className={`h-8 px-4 ${EXPLORE_PILL}`}>{t('home.exploreRetry')}</button>
        </div>
    );
    // The page's own control: read the provider's page anew. It floats as a large liquid-glass
    // button over the list's bottom right corner. The page shown stays while the next one is read;
    // a read that failed leaves a mark on the control, which then tries again.
    const hasRefresh = !isLoading && feed.status !== 'error';
    const refreshLabel = t(feed?.refreshFailed ? 'home.exploreRetry' : 'home.exploreRefresh');
    return (
        <div className="relative h-full w-full self-stretch" style={EXPLORE_TOKENS}>
            {hasRefresh && ready && (
                <motion.div
                    // It comes with the page it belongs to, as quietly as the page's first heading does.
                    initial={{ opacity: 0, scale: 0.85 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.3 }}
                    className="pointer-events-none absolute inset-x-0 bottom-8 z-20"
                    style={{ paddingRight: barWidth }}
                >
                    <div className="mx-auto flex w-full max-w-7xl justify-end px-4 md:px-8">
                        <button
                            type="button"
                            data-explore-refresh
                            data-glass
                            data-glass-light
                            data-glass-jelly
                            disabled={feed.refreshing}
                            title={feed.refreshFailed ? t('home.exploreFailed') : refreshLabel}
                            aria-label={refreshLabel}
                            onClick={readAgain}
                            className="pointer-events-auto relative flex h-10 w-10 items-center justify-center rounded-full"
                            style={{
                                backgroundColor: isDaylight
                                    ? "rgba(215,215,215,0.42)"
                                    : "rgba(40, 40, 40, 0.42)",
                                borderTop: isDaylight
                                    ? "1px solid #fff6"
                                    : "1px solid #fff5",
                                borderBottom: isDaylight
                                    ? "1px solid #fff6"
                                    : "1px solid #fff5",
                                outline: "1px solid rgba(35,35,35,0.3)",
                                boxShadow: "0px 8px 16px rgba(40,40,40,0.2)",
                            }}
                        >
                            <RefreshCw size={16} className={feed.refreshing ? 'animate-spin' : ''} />
                            {feed.refreshFailed && <span data-explore-refresh-failed className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-amber-400" />}
                        </button>
                    </div>
                </motion.div>
            )}
            {/* Before the list, which is drawn over it. */}
            <ExploreLight list={list} />
            <motion.div
                ref={list}
                id={listId}
                data-explore-surface
                // Entries that change places are followed from where they stood in this list.
                layoutScroll
                onScroll={event => {
                    if (hasSections) exploreScroll.top = event.currentTarget.scrollTop;
                    follow();
                }}
                // 铺满整个窗口：这一层（首页页签层）自己就是 fixed inset-0，滚动区用 absolute inset-0 撑满它。
                // 不再用 position:fixed —— 页签层要做缩放动画（transform），fixed 后代会因此被压回该层的盒子。
                className="absolute inset-0 h-full w-full overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                style={{
                    maskImage: 'linear-gradient(to bottom, transparent, black var(--ex-top-fade, 0px), black calc(100% - var(--ex-bottom-fade, 0px)), transparent)',
                }}
            >
                <ExploreEdgeBlur edge="top" />
                <div className="mx-auto w-full max-w-7xl pb-12 pt-[120px] pr-8 pl-[95px]">
                    {!ready ? (
                        // Just entered: the ring stands in until the sections are put on the page.
                        <div className="flex justify-center py-24" aria-busy="true"><LoadingRing /></div>
                    ) : sections.length === 0 ? (
                        // No section to show: the state of the provider's page stands alone.
                        isLoading ? (
                            <div className="flex justify-center py-24" aria-busy="true"><Loader2 size={28} className="animate-spin opacity-30" /></div>
                        ) : feed.status === 'error' ? failed : (
                            <div className="flex justify-center py-24 text-sm text-[color:var(--ex-soft)]">{t('home.exploreEmpty')}</div>
                        )
                    ) : (
                        <>
                            <ExploreSections
                                page={feed?.read ?? 0}
                                sections={sections}
                                batches={feed?.kept ?? NO_BATCHES}
                                ownSectionIds={OWN_SECTION_IDS}
                                isStale={Boolean(feed?.refreshing)}
                                loadingSectionIds={feed?.loadingSectionIds ?? []}
                                onPlaySong={onPlaySong}
                                onOpenCollection={onOpenCollection}
                                onLoadMoreOf={sectionId => void loadMoreOf(sectionId)}
                            />
                            {/* Under the sections, the state of the provider's page: what the app keeps itself is shown through all of it. */}
                            {isLoading ? (
                                <div className={END} aria-busy="true"><Loader2 size={20} className="animate-spin opacity-30" /></div>
                            ) : feed.status === 'error' ? failed : hasMore && (feed.moreFailed ? (
                                <div className={END}>
                                    <button type="button" data-explore-retry onClick={() => void loadMore()} className={`h-8 px-4 ${EXPLORE_PILL}`}>{t('home.exploreRetry')}</button>
                                </div>
                            ) : (
                                <div ref={end} className={END}><Loader2 size={20} className="animate-spin opacity-30" /></div>
                            ))}
                        </>
                    )}
                </div>
                <ExploreEdgeBlur edge="bottom" />
            </motion.div>
            <ExploreScrollbar list={list} controls={listId} />
        </div>
    );
};

export default ExploreSurface;
