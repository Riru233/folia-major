import { create } from 'zustand';
import type { BilibiliSearchHit } from '../types/bilibili';
import type { BilibiliWeeklyIssue } from '../shinoinject/lab/bilibili/api';
import {
    getPopularVideos,
    getPreciousVideos,
    getRankedVideos,
    getWeeklyIssueVideos,
    getWeeklyIssues,
} from '../shinoinject/lab/bilibili/api';
import { isBilibiliAvailable } from '../shinoinject/lab/bilibili/transport';

// src/stores/useVideoExploreStore.ts
// 视频探索页的数据：综合热门、每周必看、入站必刷、排行榜，各自独立取、独立失败。
// 「更多」不跳页，只把这一段已经取到（或再取一页）的条目多露几条出来——这个页是一列段，
// 断了再回来还得在原地——所以每段都记着「露几条」，而不是分页游标。
//
// 缓存留在 store 里：从探索页切走再切回来不重取；刷新按钮才 force 重取。

type Status = 'idle' | 'loading' | 'ready' | 'error';

/** 「更多」一次多露几条。 */
const MORE_STEP = 10;
/** 首屏每一段露几条。 */
const FIRST_STEP = 10;
/** 一次向 bilibili 要多少条。 */
const PAGE_SIZE = 20;

const unavailableKey = (): string | null => (isBilibiliAvailable() ? null : 'home.videoDesktopOnly');

const errorKeyOf = (error: unknown): string => {
    const code = (error as { code?: number } | null)?.code;
    if (code === -2) return 'home.videoDesktopOnly';
    if (code === -403 || code === -352) return 'home.videoNeedRefresh';
    return 'home.videoLoadFailed';
};

export interface WeeklyIssueView extends BilibiliWeeklyIssue {
    /** 这一期自己的视频；null 表示还没点开过。 */
    videos: BilibiliSearchHit[] | null;
}

interface VideoExploreState {
    popular: BilibiliSearchHit[];
    popularVisible: number;
    /** 已经取到最后一页了：没有更多可露。 */
    popularEnd: boolean;
    popularStatus: Status;
    popularErrorKey: string | null;

    issues: WeeklyIssueView[];
    issuesVisible: number;
    issuesStatus: Status;
    issuesErrorKey: string | null;

    precious: BilibiliSearchHit[];
    preciousVisible: number;
    preciousEnd: boolean;
    preciousStatus: Status;
    preciousErrorKey: string | null;

    rankRid: number;
    rank: BilibiliSearchHit[];
    rankStatus: Status;
    rankErrorKey: string | null;

    /** 打开的期号；null 表示在看总览。 */
    openIssueNumber: number | null;
    issueVideos: BilibiliSearchHit[];
    issueStatus: Status;
    issueErrorKey: string | null;

    load: (force?: boolean) => Promise<void>;
    loadMorePopular: () => Promise<void>;
    loadMoreIssues: () => void;
    loadMorePrecious: () => Promise<void>;
    setRankRid: (rid: number) => Promise<void>;
    openIssue: (issue: BilibiliWeeklyIssue) => Promise<void>;
    closeIssue: () => void;
}

// 每次取数一个编号：快速切分区时只有最后一次能落盘。
let rankGeneration = 0;
let issueGeneration = 0;
let loadedOnce = false;

export const useVideoExploreStore = create<VideoExploreState>((set, get) => {
    const readPopular = async (page: number): Promise<BilibiliSearchHit[]> => getPopularVideos(page, PAGE_SIZE);
    const readPrecious = async (page: number): Promise<BilibiliSearchHit[]> => getPreciousVideos(page, PAGE_SIZE);

    const loadRank = async (rid: number) => {
        const unavailable = unavailableKey();
        const generation = ++rankGeneration;
        set({ rankStatus: 'loading', rankErrorKey: null });
        if (unavailable) {
            set({ rank: [], rankStatus: 'error', rankErrorKey: unavailable });
            return;
        }
        try {
            const items = await getRankedVideos(rid);
            if (generation !== rankGeneration) return;
            set({ rank: items, rankStatus: 'ready', rankErrorKey: null });
        } catch (error) {
            if (generation !== rankGeneration) return;
            set({ rank: [], rankStatus: 'error', rankErrorKey: errorKeyOf(error) });
        }
    };

    const loadIssues = async () => {
        const unavailable = unavailableKey();
        set({ issuesStatus: 'loading', issuesErrorKey: null });
        if (unavailable) {
            set({ issues: [], issuesStatus: 'error', issuesErrorKey: unavailable });
            return;
        }
        try {
            const issues = await getWeeklyIssues();
            set({
                issues: issues.map(issue => ({ ...issue, videos: null })),
                issuesVisible: FIRST_STEP,
                issuesStatus: 'ready',
                issuesErrorKey: null,
            });
        } catch (error) {
            set({ issues: [], issuesStatus: 'error', issuesErrorKey: errorKeyOf(error) });
        }
    };

    const loadFirst = async () => {
        const unavailable = unavailableKey();
        if (unavailable) {
            set({
                popular: [], popularStatus: 'error', popularErrorKey: unavailable,
                precious: [], preciousStatus: 'error', preciousErrorKey: unavailable,
            });
            return;
        }
        set({ popularStatus: 'loading', popularErrorKey: null, preciousStatus: 'loading', preciousErrorKey: null });
        const [popular, precious] = await Promise.allSettled([readPopular(1), readPrecious(1)]);
        if (popular.status === 'fulfilled') {
            set({
                popular: popular.value,
                popularVisible: FIRST_STEP,
                popularEnd: popular.value.length < PAGE_SIZE,
                popularStatus: 'ready',
                popularErrorKey: null,
            });
        } else {
            set({ popular: [], popularStatus: 'error', popularErrorKey: errorKeyOf(popular.reason) });
        }
        if (precious.status === 'fulfilled') {
            set({
                precious: precious.value,
                preciousVisible: FIRST_STEP,
                preciousEnd: precious.value.length < PAGE_SIZE,
                preciousStatus: 'ready',
                preciousErrorKey: null,
            });
        } else {
            set({ precious: [], preciousStatus: 'error', preciousErrorKey: errorKeyOf(precious.reason) });
        }
    };

    return {
        popular: [],
        popularVisible: FIRST_STEP,
        popularEnd: false,
        popularStatus: 'idle',
        popularErrorKey: null,
        issues: [],
        issuesVisible: FIRST_STEP,
        issuesStatus: 'idle',
        issuesErrorKey: null,
        precious: [],
        preciousVisible: FIRST_STEP,
        preciousEnd: false,
        preciousStatus: 'idle',
        preciousErrorKey: null,
        rankRid: 0,
        rank: [],
        rankStatus: 'idle',
        rankErrorKey: null,
        openIssueNumber: null,
        issueVideos: [],
        issueStatus: 'idle',
        issueErrorKey: null,

        load: async force => {
            if (!force && (loadedOnce || get().popularStatus === 'loading')) return;
            loadedOnce = true;
            await Promise.all([loadFirst(), loadIssues(), loadRank(get().rankRid)]);
        },
        loadMorePopular: async () => {
            const { popular, popularVisible, popularStatus, popularEnd } = get();
            if (popularStatus === 'loading' || popularEnd) return;
            const next = popularVisible + MORE_STEP;
            set({ popularVisible: next });
            if (next <= popular.length) return;
            // 手上不够了才往后再要一页；要不到就停在这里，不把已经露出来的收回去。
            const page = Math.floor(popular.length / PAGE_SIZE) + 1;
            try {
                const more = await readPopular(page);
                set(state => ({
                    popular: [...state.popular, ...more.filter(item => !state.popular.some(kept => kept.bvid === item.bvid))],
                    popularEnd: more.length < PAGE_SIZE,
                }));
            } catch (error) {
                console.warn('[VideoExplore] Could not read more popular videos:', error);
                set({ popularEnd: true });
            }
        },
        loadMoreIssues: () => {
            set(state => ({ issuesVisible: Math.min(state.issues.length, state.issuesVisible + MORE_STEP) }));
        },
        loadMorePrecious: async () => {
            const { precious, preciousVisible, preciousStatus, preciousEnd } = get();
            if (preciousStatus === 'loading' || preciousEnd) return;
            const next = preciousVisible + MORE_STEP;
            set({ preciousVisible: next });
            if (next <= precious.length) return;
            const page = Math.floor(precious.length / PAGE_SIZE) + 1;
            try {
                const more = await readPrecious(page);
                set(state => ({
                    precious: [...state.precious, ...more.filter(item => !state.precious.some(kept => kept.bvid === item.bvid))],
                    preciousEnd: more.length < PAGE_SIZE,
                }));
            } catch (error) {
                console.warn('[VideoExplore] Could not read more precious videos:', error);
                set({ preciousEnd: true });
            }
        },
        setRankRid: async rid => {
            if (get().rankRid === rid && get().rankStatus === 'ready') return;
            set({ rankRid: rid, rank: [] });
            await loadRank(rid);
        },
        openIssue: async issue => {
            // 点开过的那一期留着它自己的视频：再点开不必重新请求。
            const cached = get().issues.find(row => row.number === issue.number)?.videos;
            if (cached) {
                issueGeneration += 1;
                set({ openIssueNumber: issue.number, issueVideos: cached, issueStatus: 'ready', issueErrorKey: null });
                return;
            }
            const generation = ++issueGeneration;
            set({
                openIssueNumber: issue.number,
                issueVideos: [],
                issueStatus: 'loading',
                issueErrorKey: null,
            });
            try {
                const videos = await getWeeklyIssueVideos(issue.number);
                if (generation !== issueGeneration) return;
                set(state => ({
                    issueVideos: videos,
                    issueStatus: 'ready',
                    issueErrorKey: null,
                    // 也留一份在期号条目上：关掉再点开同一期不用再请求。
                    issues: state.issues.map(row => (row.number === issue.number ? { ...row, videos } : row)),
                }));
            } catch (error) {
                if (generation !== issueGeneration) return;
                set({ issueStatus: 'error', issueErrorKey: errorKeyOf(error) });
            }
        },
        closeIssue: () => {
            issueGeneration += 1;
            set({ openIssueNumber: null, issueVideos: [], issueStatus: 'idle', issueErrorKey: null });
        },
    };
});
