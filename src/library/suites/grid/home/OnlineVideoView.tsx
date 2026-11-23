import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Clapperboard, RefreshCw } from 'lucide-react';
import { useGlass } from '@/shinoinject/useGlass';
import type { LibraryHomeVideoTab } from '../../../core/home/homeModel.contract';

// src/library/suites/grid/home/OnlineVideoView.tsx
// 在线视频四页的界面骨架。只有布局与占位，不读任何平台数据：bilibili 等视频源接入前，
// 这里刻意不碰 API、登录态与本地曲库。推荐页是信息流（常规 5 列、紧凑 2 列）并带刷新按钮，
// 刷新只转一下圈；其余三页是同一块空态。二级页签由页头胶囊画，本组件只负责那一页的内容。

interface OnlineVideoViewProps {
    tab: LibraryHomeVideoTab;
    isDaylight: boolean;
    isCompact: boolean;
}

/** 推荐信息流的占位卡数量：常规档正好两行五列。 */
const FEED_PLACEHOLDERS = 10;
/** 刷新只做一次视觉反馈，不请求任何东西。 */
const REFRESH_MS = 600;

const OnlineVideoView: React.FC<OnlineVideoViewProps> = ({ tab, isDaylight, isCompact }) => {
    const { t } = useTranslation();
    const [refreshing, setRefreshing] = useState(false);
    useGlass();

    const cardStyle: React.CSSProperties = {
        backgroundColor: isDaylight ? 'rgba(255,255,255,0.42)' : 'rgba(35,35,35,0.42)',
        borderTop: '1px solid rgba(255,255,255,0.35)',
        borderBottom: '1px solid rgba(255,255,255,0.18)',
        outline: '1px solid rgba(35,35,35,0.18)',
    };
    const skeletonStyle: React.CSSProperties = {
        backgroundColor: isDaylight ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.09)',
    };

    const refresh = () => {
        if (refreshing) return;
        setRefreshing(true);
        window.setTimeout(() => setRefreshing(false), REFRESH_MS);
    };

    if (tab !== 'videoRecommend') {
        return (
            <div className="flex h-full w-full flex-col items-center justify-center gap-3" data-testid="online-video-view">
                <Clapperboard size={30} style={{ color: 'var(--text-accent)', opacity: 0.55 }} />
                <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{t('home.videoPlaceholder')}</span>
            </div>
        );
    }

    // 左侧竖栏是 fixed 浮在页面上的（left 15 + 宽 40，长按展开还会再往右让 5px），
    // 内容区不能按普通 px-4 起排，否则第一列卡片会被它压住。
    return (
        <div className="h-full w-full overflow-y-auto pb-8 pl-[72px] pr-4 pt-2" data-testid="online-video-view">
            <div className="mb-4 flex items-center justify-between">
                <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{t('home.videoRecommend')}</span>
                <button
                    type="button"
                    data-glass
                    data-glass-light
                    onClick={refresh}
                    title={t('home.videoRefresh')}
                    className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition-opacity hover:opacity-80"
                    style={cardStyle}
                >
                    <RefreshCw size={13} className={refreshing ? 'animate-spin' : undefined} />
                    {t('home.videoRefresh')}
                </button>
            </div>
            <div className={`grid gap-3 ${isCompact ? 'grid-cols-2' : 'grid-cols-5'}`} data-video-feed-columns={isCompact ? 2 : 5}>
                {Array.from({ length: FEED_PLACEHOLDERS }, (_, index) => (
                    <div key={index} data-glass data-glass-light className="overflow-hidden rounded-xl" style={cardStyle}>
                        <div className="aspect-video w-full animate-pulse" style={skeletonStyle} />
                        <div className="space-y-2 p-2.5">
                            <div className="h-3 w-4/5 animate-pulse rounded" style={skeletonStyle} />
                            <div className="h-2.5 w-1/2 animate-pulse rounded" style={skeletonStyle} />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default OnlineVideoView;
