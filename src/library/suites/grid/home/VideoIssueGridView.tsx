import React, { useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { ChevronLeft } from 'lucide-react';
import type { SongResult, Theme } from '../../../../types';
import type { BilibiliSearchHit } from '../../../../types/bilibili';
import type { BilibiliWeeklyIssue } from '../../../../shinoinject/lab/bilibili/api';
import type {
    CollectionResource,
    CollectionResourceSnapshot,
} from '../../../core/shared/resource.contract';
import GridView from '../collection/GridView';
import { EXPLORE_PILL } from '../../../../components/app/home/explore/ExploreParts';

// src/library/suites/grid/home/VideoIssueGridView.tsx
// 「每周必看」一期的详情页：沿用在线音乐集合详情页的 GridView（同一套卡片网格、同一只返回键、
// 同一条信息面板），而不是另画一套。视频在这里先塑形成曲目再交给网格：封面、标题、UP 主、
// 时长都是手上已有的字段；点一张卡片回到 useOnlineVideoStore.playVideo，和推荐页同一条播放链。
//
// 网格只认集合资源（曲目、加载状态都从资源里读），所以这里给了一份只读的静态资源：它没有分页、
// 不能删也不能改名，只是把这一期的视频按「一曲目」交出去。

/** 视频的播放身份与 services/bilibiliPlayback 里的 songIdOf 必须一致，卡片才能对上正在播放的那首。 */
const songIdOf = (bvid: string): string => `bilibili:${bvid}`;

const songOfVideo = (video: BilibiliSearchHit): SongResult => ({
    id: songIdOf(video.bvid),
    name: video.title,
    artists: [{ id: video.author || 'bilibili', name: video.author || 'bilibili' }],
    album: {
        id: songIdOf(video.bvid),
        name: video.title,
        coverUrl: video.coverUrl || undefined,
    },
    durationMs: Math.max(0, Math.round((video.durationSec || 0) * 1000)),
    isVideo: true,
    // 与真正播放时那首歌同一个源引用，播放键才算得一致（卡片据此画「正在播放」）。
    sourceRef: { kind: 'stage', mediaId: songIdOf(video.bvid) },
});

const EMPTY_DETAIL = null;

/** 只读的静态资源：一份曲目、一个状态，取完就完了。 */
class IssueResource implements CollectionResource {
    readonly key: string;
    readonly kind = 'static' as const;
    private snapshot: CollectionResourceSnapshot;
    private listeners = new Set<() => void>();

    constructor(key: string, tracks: SongResult[], loading: boolean) {
        this.key = key;
        this.snapshot = {
            key,
            kind: 'static',
            revision: '1',
            status: loading ? 'loading' : 'ready',
            tracks,
            error: null,
            sync: { status: 'none' },
            detail: EMPTY_DETAIL,
            hint: 'urgent',
            generation: 1,
        };
    }

    getSnapshot = (): CollectionResourceSnapshot => this.snapshot;

    subscribe = (listener: () => void): (() => void) => {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    };

    ensure = (): void => { /* 一期的视频由调用方给齐，没有可按需重取的上游 */ };

    reload = (): void => { /* 同上 */ };

    resumeSync = (): void => { /* 没有后台补页 */ };

    canReuse = (): boolean => true;

    pause = (): void => { /* 没有进行中的请求 */ };

    dispose = (): void => {
        this.listeners.clear();
    };

    removeTracks = async (): Promise<void> => { /* 只读 */ };

    removeAt = (): boolean => false;

    replaceTrackAt = (): boolean => false;

    replaceAll = (): Promise<boolean> => Promise.resolve(false);

    /** 一期的视频到了（或换了一期）：同一份资源上换曲目，网格不重建、滚动与焦点也就不用重来。 */
    setTracks = (tracks: SongResult[], loading: boolean): void => {
        this.snapshot = {
            ...this.snapshot,
            tracks,
            status: loading ? 'loading' : 'ready',
            generation: this.snapshot.generation + 1,
        };
        for (const listener of this.listeners) listener();
    };
}

interface VideoIssueGridViewProps {
    issueNumber: number;
    issue: BilibiliWeeklyIssue | undefined;
    videos: BilibiliSearchHit[];
    status: 'idle' | 'loading' | 'ready' | 'error';
    errorKey: string | null;
    onRetry: () => void;
    onBack: () => void;
    onPlay: (video: BilibiliSearchHit) => void;
    theme: Theme;
    isDaylight: boolean;
}

const VideoIssueGridView: React.FC<VideoIssueGridViewProps> = ({
    issueNumber,
    issue,
    videos,
    status,
    errorKey,
    onRetry,
    onBack,
    onPlay,
    theme,
    isDaylight,
}) => {
    const { t } = useTranslation();

    const songs = useMemo(() => videos.map(songOfVideo), [videos]);
    const loading = status === 'idle' || status === 'loading';
    // 资源按「哪一期」建一次：后面的视频到了只是换曲目，网格不会因此重建，滚动和焦点也就不重来。
    const resource = useMemo(
        () => new IssueResource(`bilibili-weekly:${issueNumber}`, [], true),
        // eslint-disable-next-line react-hooks/exhaustive-deps -- 换期才换资源；曲目与加载状态走 setTracks
        [issueNumber],
    );
    useEffect(() => {
        resource.setTracks(songs, loading);
    }, [resource, songs, loading]);

    const title = t('home.videoWeeklyIssueNumber', { number: issueNumber });
    const subtitle = [issue?.subject, issue?.name].filter(Boolean).join(' · ');

    // 这一层要盖住整页（页头页签、左侧竖栏、底部播放条都在它们自己的层叠上下文里），所以挂到应用根节点：
    // 留在探索页里的话，祖先的 transform 会把它压回那个盒子，z-index 也只跟兄弟比。
    // 挂 body 不行 —— 主题变量（--bg-color / --text-primary…）在应用根节点上，body 上取不到，整页会没底。
    const layerTarget = document.querySelector('[data-app-root]') ?? document.body;

    // 一期没能取回来：网格的资源里没有「失败」这一格（静态资源不会失败），所以单独画一页说清楚。
    if (status === 'error') {
        return createPortal(
            <div className="fixed inset-0 z-[110] flex flex-col" style={{ backgroundColor: 'var(--bg-color)', color: 'var(--text-primary)' }}>
                <div className="flex items-center gap-3 px-6 pt-9">
                    <button type="button" onClick={onBack} className={`flex h-9 shrink-0 items-center gap-1.5 px-3.5 ${EXPLORE_PILL}`}>
                        <ChevronLeft size={14} />
                        {t('home.videoExploreBack')}
                    </button>
                    <div className="min-w-0">
                        <div className="truncate text-lg font-medium">{title}</div>
                        {subtitle && <div className="truncate text-xs opacity-60">{subtitle}</div>}
                    </div>
                </div>
                <div className="flex flex-1 flex-col items-center justify-center gap-3 text-sm opacity-80">
                    <span>{t(errorKey ?? 'home.videoLoadFailed')}</span>
                    <button type="button" onClick={onRetry} className={`h-8 px-4 ${EXPLORE_PILL}`}>
                        {t('home.exploreRetry')}
                    </button>
                </div>
            </div>,
            layerTarget,
        );
    }

    return createPortal(
        <GridView
            title={title}
            subtitle={subtitle || undefined}
            mode="tracks"
            resource={resource}
            onBack={onBack}
            onDone={onBack}
            onSelectTrack={track => {
                const video = videos.find(row => songIdOf(row.bvid) === String(track.id));
                if (video) onPlay(video);
            }}
            theme={theme}
            isDaylight={isDaylight}
        />,
        layerTarget,
    );
};

export default VideoIssueGridView;
