import React, { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, Loader2, Play, Plus, User } from 'lucide-react';
import type { BilibiliSearchHit } from '../../../../types/bilibili';
import type { BilibiliWeeklyIssue } from '../../../../shinoinject/lab/bilibili/api';
import type { SongResult, Theme } from '../../../../types';
import { useOnlineVideoStore } from '../../../../stores/useOnlineVideoStore';
import { useVideoExploreStore } from '../../../../stores/useVideoExploreStore';
import { recentVideos, replayedVideos, watchVideoPlays } from '../../../../services/bilibiliVideoHistory';
import { EXPLORE_PILL, EXPLORE_SERIF, EXPLORE_TOKENS } from '../../../../components/app/home/explore/ExploreParts';
import VideoIssueGridView from './VideoIssueGridView';

// src/library/suites/grid/home/OnlineVideoExplore.tsx
// 在线视频的「探索」页：版式照搬在线音乐探索页（衬线大字标题 + 一条横线、横向排开的卡片行），
// 内容换成 bilibili 的几段。
//
// 最前面两段是「本应用自己知道的」：最近播放、再看一次。它们读的是在线视频自己的播放记录
// （services/bilibiliVideoHistory.ts），和在线音乐的最近播放是两份互不相干的数据。
// 后面是 bilibili 视频源专属的几段：综合热门、每周必看（按期号）、入站必刷、排行榜。
// 除了排行榜（分区在标题下面横排，本身不「更多」），每段都只先露十条，右边有「更多」。
// 每周必看的卡片是一期，点开进入那一期的视频列表（盖在整页上，左上角返回）。
//
// 点任意一条视频即刻起播：交给 useOnlineVideoStore.playVideo，和推荐页同一条播放链。

const SOLID = 'bg-[var(--ex-tint-strong)]';
const FAINT = 'bg-[var(--ex-tint)]';

/** 排行榜的分区。rid 是 bilibili 的分区号，0 是全站。 */
const RANK_CATEGORIES: ReadonlyArray<{ rid: number; labelKey: string }> = [
    { rid: 0, labelKey: 'home.videoCategoryAll' },
    { rid: 13, labelKey: 'home.videoRankBangumi' },
    { rid: 168, labelKey: 'home.videoRankGuochuang' },
    { rid: 1, labelKey: 'home.videoCategoryAnime' },
    { rid: 3, labelKey: 'home.videoCategoryMusic' },
    { rid: 4, labelKey: 'home.videoCategoryGame' },
    { rid: 36, labelKey: 'home.videoCategoryKnowledge' },
    { rid: 188, labelKey: 'home.videoCategoryTech' },
    { rid: 119, labelKey: 'home.videoRankKichiku' },
    { rid: 129, labelKey: 'home.videoRankDance' },
    { rid: 5, labelKey: 'home.videoRankEntertainment' },
    { rid: 181, labelKey: 'home.videoRankFilm' },
    { rid: 211, labelKey: 'home.videoRankFood' },
    { rid: 160, labelKey: 'home.videoRankLife' },
    { rid: 223, labelKey: 'home.videoRankCar' },
    { rid: 234, labelKey: 'home.videoRankSports' },
    { rid: 202, labelKey: 'home.videoRankNews' },
    { rid: 155, labelKey: 'home.videoRankFashion' },
    { rid: 217, labelKey: 'home.videoRankAnimal' },
];

/** 1.2 万 → 1.2万。 */
const playCountText = (count: number): string => (
    count >= 100000000 ? `${(count / 100000000).toFixed(1)}亿`
        : count >= 10000 ? `${(count / 10000).toFixed(1)}万`
            : count >= 1000 ? `${(count / 1000).toFixed(1)}千`
                : String(count || 0)
);

const durationText = (seconds: number): string => {
    const total = Math.round(seconds);
    if (!Number.isFinite(total) || total <= 0) return '';
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const secs = total % 60;
    const pad = (value: number) => String(value).padStart(2, '0');
    return hours > 0 ? `${hours}:${pad(minutes)}:${pad(secs)}` : `${minutes}:${pad(secs)}`;
};

/** 段标题：28px 衬线大字、一条向左伸出的细线，右边是可以放按钮的地方。 */
const Shelf: React.FC<{ title: string; actions?: ReactNode; lead?: boolean; children: ReactNode }> = ({ title, actions, lead, children }) => (
    <section data-explore-shelf>
        <div className={lead ? 'pb-[72px]' : 'pb-14'}>
            <div className="mb-2 flex items-center gap-2.5">
                <h2 className="min-w-0 truncate text-[28px] font-medium leading-10 tracking-[0.01em]" style={{ fontFamily: EXPLORE_SERIF }}>
                    {title}
                </h2>
                <span aria-hidden className="ml-1 h-px min-w-6 flex-1 bg-[var(--ex-line)]" />
                {actions}
            </div>
            {children}
        </div>
    </section>
);

/** 「更多」：把这一段多露十条出来。 */
const MoreButton: React.FC<{ onClick: () => void; busy?: boolean }> = ({ onClick, busy }) => {
    const { t } = useTranslation();
    return (
        <button type="button" data-explore-more disabled={busy} onClick={onClick} className={`flex h-8 shrink-0 items-center gap-1.5 px-3.5 ${EXPLORE_PILL}`}>
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
            <span>{t('home.exploreMore')}</span>
        </button>
    );
};

const RetryButton: React.FC<{ onClick: () => void }> = ({ onClick }) => {
    const { t } = useTranslation();
    return (
        <button type="button" onClick={onClick} className={`h-8 px-4 ${EXPLORE_PILL}`}>
            {t('home.exploreRetry')}
        </button>
    );
};

/** 一段的失败：只说这一段落了，不牵连旁边几段。 */
const ShelfError: React.FC<{ text: string; onRetry: () => void }> = ({ text, onRetry }) => (
    <div className="flex items-center gap-4 py-6 text-sm text-[color:var(--ex-soft)]">
        <span>{text}</span>
        <RetryButton onClick={onRetry} />
    </div>
);

/** 一条视频的封面：16:9、圆角，右下角时长，鼠标停留时中间浮一个播放键。 */
const Cover: React.FC<{ video: BilibiliSearchHit; preparing: boolean; rounded: string }> = ({ video, preparing, rounded }) => {
    const duration = durationText(video.durationSec);
    return (
        <span className={`relative block aspect-video w-full overflow-hidden bg-[var(--ex-tint)] ${rounded}`}>
            {video.coverUrl && (
                <img src={video.coverUrl} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" draggable={false} className="h-full w-full select-none object-cover" />
            )}
            <span className={`absolute inset-0 flex items-center justify-center bg-black/35 transition-opacity duration-200 ${preparing ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100'}`}>
                {preparing
                    ? <Loader2 size={24} className="animate-spin text-white" />
                    : <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/95 text-black shadow-lg"><Play size={17} fill="currentColor" className="translate-x-px" /></span>}
            </span>
            {duration && <span className="absolute bottom-2 right-2 rounded-md bg-black/70 px-1.5 py-1 font-mono text-[10px] leading-none text-white/90">{duration}</span>}
        </span>
    );
};

/** 横向一段里的一张卡：封面 + 两行字。 */
const VideoTile: React.FC<{
    video: BilibiliSearchHit;
    preparing: boolean;
    onOpen: () => void;
    rank?: number;
    className?: string;
}> = ({ video, preparing, onOpen, rank, className = 'w-[288px] shrink-0' }) => {
    const { t } = useTranslation();
    return (
        <button
            type="button"
            data-testid="video-explore-card"
            data-bvid={video.bvid}
            disabled={preparing}
            onClick={onOpen}
            title={video.title}
            className={`group block rounded-2xl text-left ${className}`}
        >
            <span className="relative block">
                <Cover video={video} preparing={preparing} rounded="rounded-2xl" />
                {rank !== undefined && (
                    <span className="absolute left-2 top-2 flex h-6 min-w-6 items-center justify-center rounded-md bg-black/70 px-1.5 text-xs font-semibold text-white/90">{rank}</span>
                )}
            </span>
            <span className="mt-3 line-clamp-2 block text-sm font-medium leading-snug">{video.title}</span>
            <span className="mt-1 flex items-center gap-1.5 text-xs text-[color:var(--ex-soft)]">
                <User size={11} className="shrink-0 opacity-70" />
                <span className="min-w-0 truncate">{video.author || t('home.videoUnknownAuthor')}</span>
                <span className="shrink-0 opacity-70">{playCountText(video.playCount)}</span>
            </span>
        </button>
    );
};

/** 横向滚动的一段，两端各一个箭头；箭头只在那一端还藏着东西时出现。 */
const ScrollRow: React.FC<{ children: ReactNode }> = ({ children }) => {
    const { t } = useTranslation();
    const row = useRef<HTMLDivElement>(null);
    const [edges, setEdges] = useState({ before: false, after: false });
    const measure = () => {
        const element = row.current;
        if (!element) return;
        const before = element.scrollLeft > 1;
        const after = element.scrollLeft + element.clientWidth < element.scrollWidth - 1;
        setEdges(current => (current.before === before && current.after === after ? current : { before, after }));
    };
    useLayoutEffect(() => {
        measure();
        const element = row.current;
        if (!element || typeof ResizeObserver === 'undefined') return undefined;
        const observer = new ResizeObserver(measure);
        observer.observe(element);
        return () => observer.disconnect();
    }, [children]);
    const scroll = (direction: -1 | 1) => row.current?.scrollBy({ left: direction * row.current.clientWidth * 0.8, behavior: 'smooth' });
    const fade = edges.before || edges.after
        ? `linear-gradient(to right, ${edges.before ? 'transparent, black 56px' : 'black, black'}, ${edges.after ? 'black calc(100% - 56px), transparent' : 'black, black'})`
        : undefined;
    return (
        <div className="group relative">
            <div
                ref={row}
                onScroll={measure}
                style={{ maskImage: fade }}
                className="-mx-2 flex items-start gap-5 overflow-x-auto px-2 pb-2 pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
                {children}
            </div>
            {([-1, 1] as const).map(direction => {
                const shown = direction < 0 ? edges.before : edges.after;
                return (
                    <button
                        key={direction}
                        type="button"
                        onClick={() => scroll(direction)}
                        aria-label={t(direction < 0 ? 'home.exploreScrollLeft' : 'home.exploreScrollRight')}
                        tabIndex={shown ? 0 : -1}
                        style={{ backgroundColor: 'color-mix(in srgb, var(--bg-color) 85%, transparent)' }}
                        className={`absolute top-[calc(50%-2.5rem)] flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-[color:var(--ex-line)] text-[color:var(--text-primary)] shadow-lg backdrop-blur-md transition-opacity duration-200 ${direction < 0 ? 'left-1' : 'right-1'} ${shown ? 'opacity-0 group-hover:opacity-100' : 'pointer-events-none opacity-0'}`}
                    >
                        {direction < 0 ? <ChevronLeft size={17} /> : <ChevronRight size={17} />}
                    </button>
                );
            })}
        </div>
    );
};

/** 首段：第一条大图，其余在右边排成两列，每列五条。 */
const LeadShelf: React.FC<{ videos: BilibiliSearchHit[]; preparingBvid: string | null; onOpen: (video: BilibiliSearchHit) => void }> = ({ videos, preparingBvid, onOpen }) => {
    const { t } = useTranslation();
    const [first, ...others] = videos;
    return (
        <div className="flex flex-col gap-8 lg:flex-row lg:gap-12">
            <button type="button" onClick={() => onOpen(first)} disabled={preparingBvid === first.bvid} title={first.title} className="group w-full max-w-[384px] shrink-0 self-start rounded-3xl text-left">
                <Cover video={first} preparing={preparingBvid === first.bvid} rounded="rounded-3xl" />
                <span className="mt-5 line-clamp-2 block px-1 text-[30px] font-medium leading-tight tracking-[0.01em]" style={{ fontFamily: EXPLORE_SERIF }}>{first.title}</span>
                <span className="mt-1.5 flex items-center gap-1.5 px-1 text-sm text-[color:var(--ex-soft)]">
                    <User size={13} className="shrink-0 opacity-70" />
                    <span className="min-w-0 truncate">{first.author || t('home.videoUnknownAuthor')}</span>
                    <span className="shrink-0 opacity-70">{playCountText(first.playCount)}</span>
                </span>
            </button>
            <div className="grid min-w-0 flex-1 content-start gap-x-6 gap-y-2 lg:grid-cols-2">
                {others.slice(0, 10).map(video => (
                    <button
                        key={video.bvid}
                        type="button"
                        onClick={() => onOpen(video)}
                        disabled={preparingBvid === video.bvid}
                        title={video.title}
                        className="group flex w-full items-center gap-4 rounded-2xl px-2.5 py-2 text-left transition-colors hover:bg-[var(--ex-tint)]"
                    >
                        <span className="relative block h-[54px] w-24 shrink-0 overflow-hidden rounded-xl bg-[var(--ex-tint)]">
                            {video.coverUrl && <img src={video.coverUrl} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" draggable={false} className="h-full w-full select-none object-cover" />}
                            <span className={`absolute inset-0 flex items-center justify-center bg-black/40 text-white transition-opacity ${preparingBvid === video.bvid ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                                {preparingBvid === video.bvid ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} fill="currentColor" />}
                            </span>
                        </span>
                        <span className="block min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">{video.title}</span>
                            <span className="mt-0.5 block truncate text-xs text-[color:var(--ex-soft)]">{video.author || t('home.videoUnknownAuthor')}</span>
                        </span>
                    </button>
                ))}
            </div>
        </div>
    );
};

/** 每周必看的一期：接口不给封面，就用期号本身当图形。 */
const IssueCard: React.FC<{ issue: BilibiliWeeklyIssue; onOpen: () => void; preparing: boolean }> = ({ issue, onOpen, preparing }) => {
    const { t } = useTranslation();
    return (
        <button type="button" onClick={onOpen} disabled={preparing} title={issue.subject || issue.name} className="group w-[288px] shrink-0 rounded-2xl text-left">
            <span className="relative flex aspect-video w-full flex-col justify-between overflow-hidden rounded-2xl bg-[var(--ex-tint-strong)] p-5">
                <span className="text-[11px] tracking-[0.2em] text-[color:var(--ex-soft)]">{t('home.videoExploreWeeklyHint')}</span>
                <span className="block text-[38px] font-medium leading-none tracking-tight" style={{ fontFamily: EXPLORE_SERIF }}>
                    {t('home.videoWeeklyIssueNumber', { number: issue.number })}
                </span>
                <span className="line-clamp-1 block text-sm font-medium">{issue.subject || issue.name}</span>
                <span className="absolute inset-0 flex items-center justify-center bg-black/30 text-white opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100">
                    {preparing ? <Loader2 size={22} className="animate-spin" /> : <ChevronRight size={26} />}
                </span>
            </span>
            <span className="mt-3 line-clamp-2 block text-sm font-medium leading-snug">{issue.name}</span>
        </button>
    );
};

/** 加载中的占位：几条与真卡同尺寸的灰块。 */
const TileSkeletons: React.FC<{ count: number; lead?: boolean }> = ({ count, lead }) => {
    if (lead) {
        return (
            <div className="flex flex-col gap-8 lg:flex-row lg:gap-12">
                <div className="w-full max-w-[384px] shrink-0">
                    <span className={`block aspect-video w-full animate-pulse rounded-3xl ${SOLID}`} />
                    <span className={`mt-5 block h-6 w-3/4 animate-pulse rounded-full ${SOLID}`} />
                </div>
                <div className="grid min-w-0 flex-1 content-start gap-x-6 gap-y-2 lg:grid-cols-2">
                    {Array.from({ length: count }, (_, index) => (
                        <div key={index} className="flex items-center gap-4 px-2.5 py-2">
                            <span className={`h-[54px] w-24 shrink-0 animate-pulse rounded-xl ${SOLID}`} />
                            <span className="block flex-1">
                                <span className={`block h-3 w-3/5 animate-pulse rounded-full ${SOLID}`} />
                                <span className={`mt-2 block h-2.5 w-2/5 animate-pulse rounded-full ${FAINT}`} />
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        );
    }
    return (
        <div className="flex items-start gap-5 overflow-hidden">
            {Array.from({ length: count }, (_, index) => (
                <div key={index} className="w-[288px] shrink-0">
                    <span className={`block aspect-video w-full animate-pulse rounded-2xl ${SOLID}`} />
                    <span className={`mt-3 block h-3 w-4/5 animate-pulse rounded-full ${SOLID}`} />
                    <span className={`mt-2 block h-2.5 w-1/2 animate-pulse rounded-full ${FAINT}`} />
                </div>
            ))}
        </div>
    );
};

const pageStyle: CSSProperties = { ...EXPLORE_TOKENS, color: 'var(--text-primary)' };

interface OnlineVideoExploreProps {
    /** 交给 folia 播放层：和推荐页、本地视频同一条播放链。 */
    onPlaySong: (song: SongResult, queue: SongResult[]) => void;
    /** 打开一期的详情页时，网格要跟首页同一份主题。 */
    theme: Theme;
    isDaylight: boolean;
}

const OnlineVideoExplore: React.FC<OnlineVideoExploreProps> = ({ onPlaySong, theme, isDaylight }) => {
    const { t } = useTranslation();
    const playVideo = useOnlineVideoStore(state => state.playVideo);
    const preparingBvid = useOnlineVideoStore(state => state.preparingBvid);

    const popular = useVideoExploreStore(state => state.popular);
    const popularVisible = useVideoExploreStore(state => state.popularVisible);
    const popularEnd = useVideoExploreStore(state => state.popularEnd);
    const popularStatus = useVideoExploreStore(state => state.popularStatus);
    const popularErrorKey = useVideoExploreStore(state => state.popularErrorKey);
    const issues = useVideoExploreStore(state => state.issues);
    const issuesVisible = useVideoExploreStore(state => state.issuesVisible);
    const issuesStatus = useVideoExploreStore(state => state.issuesStatus);
    const issuesErrorKey = useVideoExploreStore(state => state.issuesErrorKey);
    const precious = useVideoExploreStore(state => state.precious);
    const preciousVisible = useVideoExploreStore(state => state.preciousVisible);
    const preciousEnd = useVideoExploreStore(state => state.preciousEnd);
    const preciousStatus = useVideoExploreStore(state => state.preciousStatus);
    const preciousErrorKey = useVideoExploreStore(state => state.preciousErrorKey);
    const rankRid = useVideoExploreStore(state => state.rankRid);
    const rank = useVideoExploreStore(state => state.rank);
    const rankStatus = useVideoExploreStore(state => state.rankStatus);
    const rankErrorKey = useVideoExploreStore(state => state.rankErrorKey);
    const openIssueNumber = useVideoExploreStore(state => state.openIssueNumber);
    const issueVideos = useVideoExploreStore(state => state.issueVideos);
    const issueStatus = useVideoExploreStore(state => state.issueStatus);
    const issueErrorKey = useVideoExploreStore(state => state.issueErrorKey);
    const load = useVideoExploreStore(state => state.load);
    const loadMorePopular = useVideoExploreStore(state => state.loadMorePopular);
    const loadMoreIssues = useVideoExploreStore(state => state.loadMoreIssues);
    const loadMorePrecious = useVideoExploreStore(state => state.loadMorePrecious);
    const setRankRid = useVideoExploreStore(state => state.setRankRid);
    const openIssue = useVideoExploreStore(state => state.openIssue);
    const closeIssue = useVideoExploreStore(state => state.closeIssue);

    // 最近播放 / 再看一次是本地记录，视频一播完就变。
    const recent = useSyncExternalStore(watchVideoPlays, recentVideos);
    const again = useSyncExternalStore(watchVideoPlays, replayedVideos);

    useEffect(() => {
        void load();
    }, [load]);

    const open = (video: BilibiliSearchHit) => { void playVideo(video, onPlaySong); };
    const issue = openIssueNumber !== null ? issues.find(row => row.number === openIssueNumber) : undefined;

    const rankShown = rank.slice(0, 100);

    return (
        <div className="relative h-full w-full self-stretch" style={pageStyle} data-testid="online-video-explore">
            <div className="absolute inset-0 h-full w-full overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <div className="mx-auto w-full max-w-7xl pb-12 pr-8 pt-2 pl-[95px]">

                    {recent.length > 0 && (
                        <Shelf title={t('home.videoExploreRecent')} lead>
                            <LeadShelf videos={recent} preparingBvid={preparingBvid} onOpen={open} />
                        </Shelf>
                    )}

                    {again.length > 0 && (
                        <Shelf title={t('home.videoExploreAgain')}>
                            <ScrollRow>
                                {again.map(video => (
                                    <VideoTile key={video.bvid} video={video} preparing={preparingBvid === video.bvid} onOpen={() => open(video)} />
                                ))}
                            </ScrollRow>
                        </Shelf>
                    )}

                    {/* 没有记录时交代一句，免得把空当成一直在加载。 */}
                    {recent.length === 0 && (
                        <p className="pb-10 text-xs text-[color:var(--ex-faint)]" style={{ fontFamily: EXPLORE_SERIF }}>
                            {t('home.videoExploreNoHistory')}
                        </p>
                    )}

                    <Shelf
                        title={t('home.videoExplorePopular')}
                        actions={popularStatus === 'ready' && !popularEnd
                            ? <MoreButton onClick={() => void loadMorePopular()} />
                            : undefined}
                    >
                        {popularStatus === 'loading' || popularStatus === 'idle'
                            ? <TileSkeletons count={6} />
                            : popularStatus === 'error'
                                ? <ShelfError text={t(popularErrorKey ?? 'home.videoLoadFailed')} onRetry={() => void load(true)} />
                                : (
                                    <ScrollRow>
                                        {popular.slice(0, popularVisible).map(video => (
                                            <VideoTile key={video.bvid} video={video} preparing={preparingBvid === video.bvid} onOpen={() => open(video)} />
                                        ))}
                                    </ScrollRow>
                                )}
                    </Shelf>

                    <Shelf
                        title={t('home.videoExploreWeekly')}
                        actions={issuesStatus === 'ready' && issues.length > issuesVisible
                            ? <MoreButton onClick={loadMoreIssues} />
                            : undefined}
                    >
                        {issuesStatus === 'loading' || issuesStatus === 'idle'
                            ? <TileSkeletons count={4} />
                            : issuesStatus === 'error'
                                ? <ShelfError text={t(issuesErrorKey ?? 'home.videoLoadFailed')} onRetry={() => void load(true)} />
                                : (
                                    <ScrollRow>
                                        {issues.slice(0, issuesVisible).map(row => (
                                            <IssueCard
                                                key={row.number}
                                                issue={row}
                                                preparing={openIssueNumber === row.number && issueStatus === 'loading'}
                                                onOpen={() => void openIssue(row)}
                                            />
                                        ))}
                                    </ScrollRow>
                                )}
                    </Shelf>

                    <Shelf
                        title={t('home.videoExplorePrecious')}
                        actions={preciousStatus === 'ready' && !preciousEnd
                            ? <MoreButton onClick={() => void loadMorePrecious()} />
                            : undefined}
                    >
                        {preciousStatus === 'loading' || preciousStatus === 'idle'
                            ? <TileSkeletons count={6} />
                            : preciousStatus === 'error'
                                ? <ShelfError text={t(preciousErrorKey ?? 'home.videoLoadFailed')} onRetry={() => void load(true)} />
                                : (
                                    <ScrollRow>
                                        {precious.slice(0, preciousVisible).map(video => (
                                            <VideoTile key={video.bvid} video={video} preparing={preparingBvid === video.bvid} onOpen={() => open(video)} />
                                        ))}
                                    </ScrollRow>
                                )}
                    </Shelf>

                    {/* 排行榜：分区在标题下面横排，本身不分页，也就不放「更多」。 */}
                    <Shelf title={t('home.videoExploreRank')}>
                        <div className="-mx-2 mb-4 flex gap-2 overflow-x-auto px-2 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                            {RANK_CATEGORIES.map(category => {
                                const active = category.rid === rankRid;
                                return (
                                    <button
                                        key={category.rid}
                                        type="button"
                                        onClick={() => void setRankRid(category.rid)}
                                        aria-pressed={active}
                                        className={`h-8 shrink-0 rounded-full border px-3.5 text-xs font-medium transition-colors ${active
                                            ? 'border-transparent bg-[var(--text-primary)] text-[color:var(--bg-color)]'
                                            : 'border-[color:var(--ex-line)] text-[color:var(--ex-soft)] hover:bg-[var(--ex-tint)] hover:text-[color:var(--text-primary)]'}`}
                                    >
                                        {t(category.labelKey)}
                                    </button>
                                );
                            })}
                        </div>
                        {rankStatus === 'loading' || rankStatus === 'idle'
                            ? <TileSkeletons count={6} />
                            : rankStatus === 'error'
                                ? <ShelfError text={t(rankErrorKey ?? 'home.videoLoadFailed')} onRetry={() => void setRankRid(rankRid)} />
                                : (
                                    <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-x-5 gap-y-7">
                                        {rankShown.map((video, index) => (
                                            <VideoTile
                                                key={video.bvid}
                                                video={video}
                                                rank={index + 1}
                                                preparing={preparingBvid === video.bvid}
                                                onOpen={() => open(video)}
                                                className="w-full min-w-0"
                                            />
                                        ))}
                                    </div>
                                )}
                    </Shelf>
                </div>
            </div>

            {/* 一期自己的视频：用在线音乐集合详情页的 GridView 画（同一套卡片网格与返回键）。 */}
            {openIssueNumber !== null && (
                <VideoIssueGridView
                    issueNumber={openIssueNumber}
                    issue={issue}
                    videos={issueVideos}
                    status={issueStatus}
                    errorKey={issueErrorKey}
                    onRetry={() => { if (issue) void openIssue(issue); }}
                    onBack={closeIssue}
                    onPlay={open}
                    theme={theme}
                    isDaylight={isDaylight}
                />
            )}
        </div>
    );
};

export default OnlineVideoExplore;
