import { create } from 'zustand';
import i18n from '../i18n/config';
import type { BilibiliAuthStatus, BilibiliSearchHit } from '../types/bilibili';
import type { SongResult } from '../types';
import {
    type BilibiliFavoriteFolder,
    type VideoQuality,
    getFavoriteFolders,
    getFavoriteVideos,
    getPopularVideos,
    getRankedVideos,
    searchVideos,
} from '../shinoinject/lab/bilibili/api';
import { isBilibiliAvailable } from '../shinoinject/lab/bilibili/transport';
import { prepareBilibiliVideo } from '../services/bilibiliPlayback';
import { setStatusMessage } from './useStatusMessageStore';

// src/stores/useOnlineVideoStore.ts
// 在线视频四页的唯一数据源。视频源目前只有 bilibili，但页面只认「一组视频条目」，
// 以后接第二家时在这里换实现即可，组件不用动。
//
// 播放不在这个 store 里：点开视频时把条目准备好（下载成 OPFS 里的本地视频曲目），
// 再通过调用方给的 playSong 交给 folia 的播放层——声音、画面、进度同步都走本地视频那条链。
// 这里只管「准备好了没有、有没有出错、记着用户选的画质」。
//
// 网页版没有 bilibili 的代理通道，所有请求都会失败——这里直接给出「仅桌面版」的话，
// 不把跨域错误伪装成「没有视频」。

export type { VideoQuality } from '../shinoinject/lab/bilibili/api';
export type OnlineVideoPage = 'videoRecommend' | 'videoExplore' | 'videoCategory' | 'videoFavorites';

interface VideoFeed {
    items: BilibiliSearchHit[];
    loading: boolean;
    /** 存 i18n key，界面切换语言后能跟着变。 */
    errorKey: string | null;
    generation: number;
}

const emptyFeed = (): VideoFeed => ({ items: [], loading: false, errorKey: null, generation: 0 });

interface OnlineVideoState {
    feeds: Record<OnlineVideoPage, VideoFeed>;
    /** 分类页选中的 bilibili 分区号，0 = 全站。 */
    categoryRid: number;
    favoriteFolders: BilibiliFavoriteFolder[];
    activeFolderId: number | null;
    /** 搜索结果独立于四个 feed：搜到的词在结果页展示，清掉后回到原来的页。 */
    searchQuery: string;
    searchItems: BilibiliSearchHit[];
    searchLoading: boolean;
    searchErrorKey: string | null;
    searchGeneration: number;
    /** 画质是「下次点开视频时按哪一档下载」的偏好，和本地视频（画质由文件决定）一致。 */
    quality: VideoQuality;
    /** 正在下载/准备本地视频条目。 */
    preparingBvid: string | null;
    auth: BilibiliAuthStatus;

    loadFeed: (page: OnlineVideoPage) => Promise<void>;
    refreshFeed: (page: OnlineVideoPage) => Promise<void>;
    setCategoryRid: (rid: number) => Promise<void>;
    setActiveFolder: (id: number) => Promise<void>;
    search: (keyword: string) => Promise<void>;
    clearSearch: () => void;
    playVideo: (video: BilibiliSearchHit, playSong: (song: SongResult, queue: SongResult[]) => void) => Promise<void>;
    setQuality: (quality: VideoQuality) => void;
    refreshAuth: () => Promise<void>;
    signIn: () => Promise<void>;
    signOut: () => Promise<void>;
}

const unavailableKey = (): string | null => (isBilibiliAvailable() ? null : 'home.videoDesktopOnly');

const errorMessageKey = (error: unknown): string => {
    const code = (error as { code?: number } | null)?.code;
    if (code === -2) return 'home.videoDesktopOnly';
    if (code === -403 || code === -352) return 'home.videoNeedRefresh';
    return 'home.videoLoadFailed';
};

export const useOnlineVideoStore = create<OnlineVideoState>((set, get) => {
    /** 统一的取数入口：generation 自增，只有最后一次请求能写结果。 */
    const runFeed = async (page: OnlineVideoPage) => {
        const unavailable = unavailableKey();
        const current = get().feeds[page];
        const generation = current.generation + 1;
        set(state => ({
            feeds: {
                ...state.feeds,
                [page]: { ...state.feeds[page], loading: true, errorKey: null, generation },
            },
        }));

        if (unavailable) {
            set(state => ({
                feeds: {
                    ...state.feeds,
                    [page]: {
                        ...state.feeds[page],
                        items: [],
                        loading: false,
                        errorKey: unavailable,
                    },
                },
            }));
            return;
        }

        try {
            let items: BilibiliSearchHit[];
            switch (page) {
                case 'videoRecommend':
                    items = await getPopularVideos(1);
                    break;
                case 'videoExplore':
                    items = await getRankedVideos(0);
                    break;
                case 'videoCategory':
                    items = await getRankedVideos(get().categoryRid);
                    break;
                case 'videoFavorites': {
                    const mid = get().auth.account?.mid;
                    if (!mid) {
                        items = [];
                        break;
                    }
                    const folders = await getFavoriteFolders(mid);
                    const firstId: number | undefined = folders.length > 0 ? folders[0].id : undefined;
                    const chosen = get().activeFolderId;
                    const folderId = chosen !== null ? chosen : firstId;
                    set({ favoriteFolders: folders, activeFolderId: folderId ?? null });
                    items = folderId !== undefined ? await getFavoriteVideos(folderId, 1) : [];
                    break;
                }
            }
            const latest = get().feeds[page].generation;
            if (latest !== generation) return;
            set(state => ({
                feeds: {
                    ...state.feeds,
                    [page]: { ...state.feeds[page], items, loading: false, errorKey: null },
                },
            }));
        } catch (error) {
            const latest = get().feeds[page].generation;
            if (latest !== generation) return;
            set(state => ({
                feeds: {
                    ...state.feeds,
                    [page]: {
                        ...state.feeds[page],
                        items: [],
                        loading: false,
                        errorKey: errorMessageKey(error),
                    },
                },
            }));
        }
    };

    return {
        feeds: {
            videoRecommend: emptyFeed(),
            videoExplore: emptyFeed(),
            videoCategory: emptyFeed(),
            videoFavorites: emptyFeed(),
        },
        categoryRid: 0,
        favoriteFolders: [],
        activeFolderId: null,
        searchQuery: '',
        searchItems: [],
        searchLoading: false,
        searchErrorKey: null,
        searchGeneration: 0,
        quality: 720,
        preparingBvid: null,
        auth: {
            state: 'unknown',
            account: null,
            available: isBilibiliAvailable(),
        },

        loadFeed: async page => {
            if (get().feeds[page].items.length > 0 || get().feeds[page].loading) return;
            await runFeed(page);
        },
        refreshFeed: async page => {
            await runFeed(page);
        },
        setCategoryRid: async rid => {
            set(state => ({
                categoryRid: rid,
                feeds: {
                    ...state.feeds,
                    videoCategory: { ...state.feeds.videoCategory, items: [] },
                },
            }));
            await runFeed('videoCategory');
        },
        setActiveFolder: async id => {
            set(state => ({
                activeFolderId: id,
                feeds: {
                    ...state.feeds,
                    videoFavorites: { ...state.feeds.videoFavorites, items: [] },
                },
            }));
            await runFeed('videoFavorites');
        },
        search: async keyword => {
            const query = keyword.trim();
            if (!query) return;
            const unavailable = unavailableKey();
            const generation = get().searchGeneration + 1;
            set({ searchQuery: query, searchGeneration: generation, searchLoading: true, searchErrorKey: null });
            if (unavailable) {
                set({ searchLoading: false, searchErrorKey: unavailable, searchItems: [] });
                return;
            }
            try {
                const items = await searchVideos(query, 1);
                if (get().searchGeneration !== generation) return;
                set({ searchItems: items, searchLoading: false, searchErrorKey: null });
            } catch (error) {
                if (get().searchGeneration !== generation) return;
                set({ searchItems: [], searchLoading: false, searchErrorKey: errorMessageKey(error) });
            }
        },
        clearSearch: () => set({ searchQuery: '', searchItems: [], searchErrorKey: null, searchLoading: false }),
        playVideo: async (video, playSong) => {
            if (get().preparingBvid) return;
            set({ preparingBvid: video.bvid });
            try {
                const song = await prepareBilibiliVideo(video, get().quality);
                playSong(song, [song]);
            } catch (error) {
                console.warn('[OnlineVideo] Could not prepare the video:', error);
                setStatusMessage({ type: 'error', text: i18n.t(errorMessageKey(error)) });
            } finally {
                set({ preparingBvid: null });
            }
        },
        setQuality: quality => {
            set({ quality });
        },
        refreshAuth: async () => {
            const available = isBilibiliAvailable();
            if (!available) {
                set({ auth: { state: 'signed-out', account: null, available: false } });
                return;
            }
            const bridge = window.electron?.bilibili;
            if (!bridge) return;
            try {
                set({ auth: await bridge.getStatus() });
            } catch (error) {
                console.warn('[OnlineVideo] Could not read the bilibili account:', error);
            }
        },
        signIn: async () => {
            const bridge = typeof window === 'undefined' ? undefined : window.electron?.bilibili;
            if (!bridge) {
                setStatusMessage({ type: 'error', text: i18n.t('options.shinoLabBilibiliDesktopOnly') });
                return;
            }
            try {
                const status = await bridge.openLogin();
                set({ auth: status });
                setStatusMessage({
                    type: status.state === 'signed-in' ? 'success' : 'error',
                    text: i18n.t(status.state === 'signed-in' ? 'options.shinoLabBilibiliSignedIn' : 'options.shinoLabBilibiliSignInFailed'),
                });
                if (status.state === 'signed-in') {
                    await get().loadFeed('videoFavorites');
                }
            } catch (error) {
                console.warn('[OnlineVideo] sign-in failed:', error);
                setStatusMessage({ type: 'error', text: i18n.t('options.shinoLabBilibiliSignInFailed') });
            }
        },
        signOut: async () => {
            const bridge = typeof window === 'undefined' ? undefined : window.electron?.bilibili;
            if (!bridge) return;
            try {
                const status = await bridge.signOut();
                set({
                    auth: status,
                    favoriteFolders: [],
                    activeFolderId: null,
                    feeds: { ...get().feeds, videoFavorites: emptyFeed() },
                });
            } catch (error) {
                console.warn('[OnlineVideo] sign-out failed:', error);
            }
        },
    };
});
