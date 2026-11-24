import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Clapperboard,
    FolderHeart,
    Loader2,
    LogIn,
    Play,
    RefreshCw,
    SearchX,
    Shuffle,
    User,
} from 'lucide-react';
import { useGlass } from '@/shinoinject/useGlass';
import type { BilibiliSearchHit } from '@/types/bilibili';
import type { SongResult, Theme } from '@/types';
import {
    type OnlineVideoPage,
    useOnlineVideoStore,
} from '@/stores/useOnlineVideoStore';
import type { LibraryHomeVideoTab } from '../../../core/home/homeModel.contract';
import OnlineVideoExplore from './OnlineVideoExplore';

// src/library/suites/grid/home/OnlineVideoView.tsx
// 在线视频四页：推荐 / 探索 / 分类 / 收藏夹，数据来自 bilibili（经主进程代理，仅桌面版）。
// 推荐页走的不是热门榜，而是 www.bilibili.com 首页那条推荐流（「换一换」背后的接口）：
// 每次要的是「第几批」，所以那一页右下角是一颗圆形的换一换按钮，而不是页头的刷新。
// 二级页签由页头胶囊画，本组件只负责当前页的内容。搜索词非空时四页统一让位给搜索结果。
// 左侧竖栏是 fixed 浮在页面上的，内容区从 pl-[72px] 起排，避免第一列被压住。

interface OnlineVideoViewProps {
    tab: LibraryHomeVideoTab;
    isDaylight: boolean;
    isCompact: boolean;
    /** 把准备好的视频条目交给 folia 播放层，和本地视频走同一条播放链。 */
    onPlaySong: (song: SongResult, queue: SongResult[]) => void;
    /** 探索页打开期号详情页时，GridView 要与首页同一份主题。 */
    theme: Theme;
}

/** bilibili 分区排行榜的 rid。全站是 0。 */
const CATEGORIES: ReadonlyArray<{ rid: number; labelKey: string }> = [
    { rid: 0, labelKey: 'home.videoCategoryAll' },
    { rid: 1, labelKey: 'home.videoCategoryAnime' },
    { rid: 3, labelKey: 'home.videoCategoryMusic' },
    { rid: 4, labelKey: 'home.videoCategoryGame' },
    { rid: 36, labelKey: 'home.videoCategoryKnowledge' },
    { rid: 188, labelKey: 'home.videoCategoryTech' },
];

/** 1.2 万 → 1.2万，视频卡上不必写出完整播放数。 */
const formatPlayCount = (count: number): string => {
    if (count >= 10000) return `${(count / 10000).toFixed(1)}万`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}千`;
    return String(count);
};

const formatDuration = (seconds: number): string => {
    if (!Number.isFinite(seconds) || seconds <= 0) return '';
    const total = Math.round(seconds);
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const secs = total % 60;
    const pad = (value: number) => String(value).padStart(2, '0');
    return hours > 0 ? `${hours}:${pad(minutes)}:${pad(secs)}` : `${minutes}:${pad(secs)}`;
};

const skeletonStyle = (isDaylight: boolean): React.CSSProperties => ({
    backgroundColor: isDaylight ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.09)',
});

/** 推荐/探索/分类/搜索结果共用的视频卡。 */
const VideoCard: React.FC<{
    video: BilibiliSearchHit;
    isDaylight: boolean;
    preparing: boolean;
    onOpen: (video: BilibiliSearchHit) => void;
}> = ({ video, isDaylight, preparing, onOpen }) => {
    const { t } = useTranslation();
    const cardStyle: React.CSSProperties = {
        backgroundColor: isDaylight ? 'rgba(255,255,255,0.42)' : 'rgba(35,35,35,0.42)',
        borderTop: '1px solid rgba(255,255,255,0.35)',
        borderBottom: '1px solid rgba(255,255,255,0.18)',
        outline: '1px solid rgba(35,35,35,0.18)',
    };
    const duration = formatDuration(video.durationSec);

    return (
        <button
            type="button"
            data-glass
            data-glass-light
            data-testid="online-video-card"
            data-bvid={video.bvid}
            onClick={() => onOpen(video)}
            disabled={preparing}
            title={video.title}
            className="group overflow-hidden rounded-xl text-left transition-transform hover:-translate-y-0.5 disabled:opacity-60"
            style={cardStyle}
        >
            <div className="relative aspect-video w-full overflow-hidden">
                {video.coverUrl ? (
                    <img
                        src={video.coverUrl}
                        alt=""
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                ) : (
                    <div className="h-full w-full animate-pulse" style={skeletonStyle(isDaylight)} />
                )}
                <span className={`absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-black/35 transition-opacity ${preparing ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                    {preparing ? (
                        <>
                            <Loader2 size={26} className="animate-spin text-white" />
                            <span className="text-[11px] text-white/90">{t('home.videoLoadingStream')}</span>
                        </>
                    ) : <Play size={28} className="text-white" fill="currentColor" />}
                </span>
                {duration && (
                    <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] leading-none text-white">
                        {duration}
                    </span>
                )}
                {video.reason && (
                    <span className="absolute left-1 top-1 max-w-[80%] truncate rounded bg-black/60 px-1.5 py-0.5 text-[10px] leading-none text-white/95">
                        {video.reason}
                    </span>
                )}
            </div>
            <div className="space-y-1 p-2.5">
                <div className="line-clamp-2 text-xs font-medium leading-4" style={{ color: 'var(--text-primary)' }}>
                    {video.title}
                </div>
                <div className="flex items-center gap-1 text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                    <User size={11} className="shrink-0 opacity-70" />
                    <span className="min-w-0 flex-1 truncate">{video.author || t('home.videoUnknownAuthor')}</span>
                    <span className="shrink-0">{formatPlayCount(video.playCount)}</span>
                </div>
            </div>
        </button>
    );
};

const OnlineVideoView: React.FC<OnlineVideoViewProps> = ({ tab, isDaylight, isCompact, onPlaySong, theme }) => {
    const { t } = useTranslation();
    useGlass();

    const page: OnlineVideoPage = tab;
    // 推荐页是无限流：滚到底就往后接 10 条，所以要知道这个滚动容器。
    const scrollRef = useRef<HTMLDivElement | null>(null);
    const feed = useOnlineVideoStore(state => state.feeds[page]);
    const loadFeed = useOnlineVideoStore(state => state.loadFeed);
    const refreshFeed = useOnlineVideoStore(state => state.refreshFeed);
    const appendRecommend = useOnlineVideoStore(state => state.appendRecommend);
    const recommendAppending = useOnlineVideoStore(state => state.recommendAppending);
    const categoryRid = useOnlineVideoStore(state => state.categoryRid);
    const setCategoryRid = useOnlineVideoStore(state => state.setCategoryRid);
    const folders = useOnlineVideoStore(state => state.favoriteFolders);
    const activeFolderId = useOnlineVideoStore(state => state.activeFolderId);
    const setActiveFolder = useOnlineVideoStore(state => state.setActiveFolder);
    const auth = useOnlineVideoStore(state => state.auth);
    const signIn = useOnlineVideoStore(state => state.signIn);
    const playVideo = useOnlineVideoStore(state => state.playVideo);
    const preparingBvid = useOnlineVideoStore(state => state.preparingBvid);
    const searchQuery = useOnlineVideoStore(state => state.searchQuery);
    const searchItems = useOnlineVideoStore(state => state.searchItems);
    const searchLoading = useOnlineVideoStore(state => state.searchLoading);
    const searchErrorKey = useOnlineVideoStore(state => state.searchErrorKey);
    const clearSearch = useOnlineVideoStore(state => state.clearSearch);

    useEffect(() => {
        // 探索页自带数据（useVideoExploreStore），不走这里按页签取的 feed。
        if (page === 'videoExplore') return;
        void loadFeed(page);
    }, [page, loadFeed]);

    // 收藏夹要等登录态读出来才知道能不能取数据。
    useEffect(() => {
        if (page !== 'videoFavorites' || auth.state !== 'signed-in') return;
        if (feed.items.length === 0 && !feed.loading) void refreshFeed('videoFavorites');
        // feed.items 故意不进依赖：否则每次取到空列表都会再拉一次。
        // eslint-disable-next-line react-hooks/exhaustive-deps -- feed.items 不进依赖，避免空列表反复触发
    }, [page, auth.state, auth.account?.mid, feed.loading, refreshFeed]);

    const refreshing = feed.loading;
    const items = searchQuery ? searchItems : feed.items;
    const errorKey = searchQuery ? searchErrorKey : feed.errorKey;
    const loading = searchQuery ? searchLoading : feed.loading;

    // 探索页是 bilibili 的几段内容（最近播放、热门、每周必看、入站必刷、排行榜），自带取数，
    // 不走下面按页签取 feed 的那一套。（有搜索词时仍按搜索结果显示，和其余三页一致。）
    if (page === 'videoExplore' && !searchQuery) return <OnlineVideoExplore onPlaySong={onPlaySong} theme={theme} isDaylight={isDaylight} />;

    const refresh = () => {
        if (searchQuery) {
            void useOnlineVideoStore.getState().search(searchQuery);
            return;
        }
        if (refreshing) return;
        // 换一换是把这一屏整个换掉，视线跟着回到顶部；否则换完还停在第 40 条的位置上。
        if (page === 'videoRecommend') scrollRef.current?.scrollTo({ top: 0 });
        void refreshFeed(page);
    };

    const cardStyle: React.CSSProperties = {
        backgroundColor: isDaylight ? 'rgba(255,255,255,0.42)' : 'rgba(35,35,35,0.42)',
        borderTop: '1px solid rgba(255,255,255,0.35)',
        borderBottom: '1px solid rgba(255,255,255,0.18)',
        outline: '1px solid rgba(35,35,35,0.18)',
    };

    const grid = (
        <div className={`grid gap-3 ${isCompact ? 'grid-cols-2' : 'grid-cols-5'}`} data-video-feed-columns={isCompact ? 2 : 5}>
            {items.map(video => (
                <VideoCard
                    key={video.bvid}
                    video={video}
                    isDaylight={isDaylight}
                    preparing={preparingBvid === video.bvid}
                    onOpen={v => void playVideo(v, onPlaySong)}
                />
            ))}
        </div>
    );

    const skeletons = (
        <div className={`grid gap-3 ${isCompact ? 'grid-cols-2' : 'grid-cols-5'}`} data-video-feed-columns={isCompact ? 2 : 5}>
            {Array.from({ length: isCompact ? 4 : 10 }, (_, index) => (
                <div key={index} data-glass data-glass-light className="overflow-hidden rounded-xl" style={cardStyle}>
                    <div className="aspect-video w-full animate-pulse" style={skeletonStyle(isDaylight)} />
                    <div className="space-y-2 p-2.5">
                        <div className="h-3 w-4/5 animate-pulse rounded" style={skeletonStyle(isDaylight)} />
                        <div className="h-2.5 w-1/2 animate-pulse rounded" style={skeletonStyle(isDaylight)} />
                    </div>
                </div>
            ))}
        </div>
    );

    const notice = (icon: React.ReactNode, text: string, action?: React.ReactNode) => (
        <div className="flex flex-col items-center justify-center gap-3 py-20" data-testid="online-video-notice">
            {icon}
            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{text}</span>
            {action}
        </div>
    );

    let body: React.ReactNode;
    if (errorKey) {
        body = notice(<Clapperboard size={30} style={{ color: 'var(--text-accent)', opacity: 0.55 }} />, t(errorKey));
    } else if (loading) {
        body = skeletons;
    } else if (searchQuery) {
        body = items.length > 0
            ? grid
            : notice(<SearchX size={30} style={{ color: 'var(--text-accent)', opacity: 0.55 }} />, t('home.videoNoResults'));
    } else if (page === 'videoFavorites' && auth.state !== 'signed-in') {
        const signedOut = auth.state === 'signed-out';
        body = notice(
            <FolderHeart size={30} style={{ color: 'var(--text-accent)', opacity: 0.55 }} />,
            t(auth.available ? 'home.videoLoginForFavorites' : 'home.videoDesktopOnly'),
            signedOut && auth.available ? (
                <button
                    type="button"
                    data-glass
                    data-glass-light
                    onClick={() => void signIn()}
                    className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs"
                    style={cardStyle}
                >
                    <LogIn size={13} />
                    {t('home.videoSignIn')}
                </button>
            ) : undefined,
        );
    } else if (items.length === 0) {
        body = notice(<Clapperboard size={30} style={{ color: 'var(--text-accent)', opacity: 0.55 }} />, t('home.videoNoVideos'));
    } else {
        body = grid;
    }

    const title = searchQuery
        ? t('home.videoSearchResults', { query: searchQuery })
        : t(`home.${page}`);

    // 推荐页的「刷新」不是刷新，是首页那颗「换一换」：换成下一批推荐。
    // 它不在页头，做成右下角的圆形浮动按钮，只留一个图标；搜索时让位给页头那颗普通刷新。
    const showShuffle = page === 'videoRecommend' && !searchQuery;

    // 只有推荐页会往下长：贴到底（留 160px 的提前量，滚动中就能接上）就要下一批。
    // 是否真发请求由 store 判断：正在取、正在追加、这一轮到头了都会直接返回，滚动事件多来几次没关系。
    const handleScroll = (event: React.UIEvent<HTMLDivElement>) => {
        if (!showShuffle) return;
        const el = event.currentTarget;
        if (el.scrollHeight - el.scrollTop - el.clientHeight > 160) return;
        void appendRecommend();
    };

    return (
        <div className="relative h-full w-full" data-testid="online-video-view">
            <div
                ref={scrollRef}
                onScroll={handleScroll}
                className={`h-full w-full overflow-y-auto pl-[72px] pr-4 pt-2 ${showShuffle ? 'pb-24' : 'pb-8'}`}
                data-testid="online-video-scroll"
            >
                <div className="mb-3 flex items-center justify-between gap-3">
                    <span className="flex min-w-0 items-center gap-2 text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                        <span className="truncate">{title}</span>
                        {searchQuery && (
                            <button
                                type="button"
                                onClick={clearSearch}
                                className="shrink-0 rounded-full px-2 py-0.5 text-[11px] opacity-70 hover:opacity-100"
                                style={cardStyle}
                            >
                                {t('home.videoClearSearch')}
                            </button>
                        )}
                    </span>
                    {!showShuffle && (
                        <button
                            type="button"
                            data-glass
                            data-glass-light
                            onClick={refresh}
                            disabled={refreshing}
                            title={t('home.videoRefresh')}
                            className="flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition-opacity hover:opacity-80 disabled:opacity-50"
                            style={cardStyle}
                        >
                            {refreshing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                            {t('home.videoRefresh')}
                        </button>
                    )}
                </div>

                {!searchQuery && page === 'videoCategory' && (
                    <div className="mb-4 flex flex-wrap gap-2" data-testid="video-category-tabs">
                        {CATEGORIES.map(category => (
                            <button
                                key={category.rid}
                                type="button"
                                data-glass
                                data-glass-light
                                onClick={() => void setCategoryRid(category.rid)}
                                className="rounded-full px-3 py-1 text-xs"
                                style={{
                                    ...cardStyle,
                                    outline: categoryRid === category.rid
                                        ? '1px solid var(--text-accent)'
                                        : cardStyle.outline,
                                }}
                            >
                                {t(category.labelKey)}
                            </button>
                        ))}
                    </div>
                )}

                {!searchQuery && page === 'videoFavorites' && folders.length > 1 && (
                    <div className="mb-4 flex flex-wrap gap-2" data-testid="video-favorite-folders">
                        {folders.map(folder => (
                            <button
                                key={folder.id}
                                type="button"
                                data-glass
                                data-glass-light
                                onClick={() => void setActiveFolder(folder.id)}
                                className="rounded-full px-3 py-1 text-xs"
                                style={{
                                    ...cardStyle,
                                    outline: activeFolderId === folder.id
                                        ? '1px solid var(--text-accent)'
                                        : cardStyle.outline,
                                }}
                            >
                                {folder.title}（{folder.count}）
                            </button>
                        ))}
                    </div>
                )}

                {body}

                {/* 下拉到底正在接下一批：一行小转圈就够了，不遮住已经看过的内容。 */}
                {showShuffle && recommendAppending && !errorKey && items.length > 0 && (
                    <div className="flex items-center justify-center py-5" data-testid="video-recommend-appending">
                        <Loader2 size={16} className="animate-spin" style={{ color: 'var(--text-secondary)' }} />
                    </div>
                )}
            </div>

            {showShuffle && (
                <button
                    type="button"
                    data-glass
                    data-glass-light
                    data-testid="video-recommend-shuffle"
                    onClick={refresh}
                    disabled={refreshing}
                    title={t('home.videoShuffle')}
                    aria-label={t('home.videoShuffle')}
                    className="absolute bottom-5 right-5 z-10 flex h-12 w-12 items-center justify-center rounded-full shadow-lg transition-transform hover:scale-105 active:scale-95 disabled:opacity-60"
                    style={cardStyle}
                >
                    {refreshing
                        ? <Loader2 size={19} className="animate-spin" />
                        : <Shuffle size={19} />}
                </button>
            )}
        </div>
    );
};

export default OnlineVideoView;
