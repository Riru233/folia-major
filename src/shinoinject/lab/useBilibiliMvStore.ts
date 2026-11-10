import { create } from 'zustand';
import i18n from '../../i18n/config';
import type { SongResult } from '../../types';
import type { BilibiliAuthStatus, BilibiliMvResolution } from '../../types/bilibili';
import { getAccount, getPlayStream, getVideoInfo, searchVideos } from './bilibili/api';
import { buildSearchKeyword, extractBvid, pickBestMvHit, songKeyOf } from './bilibili/mvMatch';
import { DESKTOP_ONLY_CODE, isBilibiliAvailable } from './bilibili/transport';
import { useShinoLabStore } from './useShinoLabStore';
import { setStatusMessage } from '../../stores/useStatusMessageStore';

// src/shinoinject/lab/useBilibiliMvStore.ts
// 实验性「视频」背景的那一半：这个浏览器现在是谁（一次登录，全局共享），以及当前这首歌的 MV
// 是从哪条 BV 来的。
//
// 一首歌的解析结果只留一份：换歌就把上一条丢掉，面板里看到的永远是「这首歌」的 BV。搜索结果和
// 播放直链都是短命的（直链带签名），所以缓存带时限，过期就重新解析；手写的 BV 不受时限影响，
// 但会被记下来，换歌回来时不用再搜一次。

const OVERRIDES_STORAGE_KEY = 'shino_lab_bilibili_bv_overrides';
/** 播放直链有过期时间，二十分钟后重新解析一次，比等它失效再报错好。 */
const RESOLUTION_TTL_MS = 20 * 60 * 1000;

type OverrideMap = Record<string, string>;

const readOverrides = (): OverrideMap => {
    if (typeof window === 'undefined') return {};
    try {
        const raw = localStorage.getItem(OVERRIDES_STORAGE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw) as unknown;
        if (!parsed || typeof parsed !== 'object') return {};
        return Object.fromEntries(
            Object.entries(parsed as Record<string, unknown>)
                .filter(([, value]) => typeof value === 'string' && value)
                .map(([key, value]) => [key, value as string]),
        );
    } catch {
        return {};
    }
};

const writeOverrides = (overrides: OverrideMap) => {
    if (typeof window === 'undefined') return;
    try {
        localStorage.setItem(OVERRIDES_STORAGE_KEY, JSON.stringify(overrides));
    } catch (error) {
        console.warn('[BilibiliMv] Could not persist the BV overrides:', error);
    }
};

const UNKNOWN_AUTH: BilibiliAuthStatus = { state: 'unknown', account: null, available: false };

export type BilibiliMvStoreState = {
    auth: BilibiliAuthStatus;
    /** 当前这首歌的 MV 解析状态；换歌会清空。 */
    resolution: BilibiliMvResolution | null;
    /** 正在解析的那首歌，防止换歌时旧结果落回来。 */
    resolvingSongKey: string | null;
    overrides: OverrideMap;
    /** 面板里最近一次匹配用的搜索词，出错时展示给用户。 */
    lastKeyword: string | null;
    refreshAuth: () => Promise<void>;
    signIn: () => Promise<void>;
    signOut: () => Promise<void>;
    /** 手写/粘贴一条 BV 给这首歌；空字符串表示清掉，回到自动匹配。 */
    setManualBv: (song: SongResult | null, input: string) => Promise<void>;
    clearManualBv: (song: SongResult | null) => void;
    /** 解析当前这首歌的 MV；同一首歌在缓存期内直接复用。 */
    resolveForSong: (song: SongResult | null, options?: { force?: boolean }) => Promise<void>;
    /** 换歌/关掉实验时清场。 */
    reset: () => void;
};

// 解析结果的缓存（屏幕之外的东西，不进 React 状态）。
const resolutionCache = new Map<string, { resolution: BilibiliMvResolution; at: number }>();
const inFlight = new Map<string, Promise<BilibiliMvResolution>>();

const describeError = (error: unknown): string => {
    if (error instanceof Error) {
        const code = (error as Error & { code?: number }).code;
        if (code === DESKTOP_ONLY_CODE) return i18n.t('options.shinoLabBilibiliDesktopOnly');
        if (code === -403 || code === -352) return i18n.t('options.shinoLabBilibiliBlocked');
        if (error.message === 'timeout') return i18n.t('options.shinoLabBilibiliTimeout');
        return error.message;
    }
    return String(error ?? '');
};

const resolveMv = async (song: SongResult): Promise<BilibiliMvResolution> => {
    const songKey = songKeyOf(song);
    const lab = useShinoLabStore.getState();
    const overrides = useBilibiliMvStore.getState().overrides;
    const manualBv = overrides[songKey];
    const keyword = manualBv ? manualBv : buildSearchKeyword(song);

    try {
        let bvid = manualBv;
        if (!bvid) {
            if (!lab.bilibiliAutoMatch) {
                return {
                    state: 'missing',
                    songKey,
                    stream: null,
                    keyword,
                    manual: false,
                    message: i18n.t('options.shinoLabBilibiliAutoMatchOff'),
                };
            }
            const hits = await searchVideos(keyword);
            const match = pickBestMvHit(hits, song, { durationSec: Math.round(song.durationMs / 1000) });
            if (!match) {
                return {
                    state: 'missing',
                    songKey,
                    stream: null,
                    keyword,
                    manual: false,
                    message: i18n.t('options.shinoLabBilibiliNoMatch'),
                };
            }
            bvid = match.hit.bvid;
        }

        const info = await getVideoInfo(bvid);
        const stream = await getPlayStream(info.bvid, info.cid, lab.bilibiliMvQuality);
        return {
            state: 'ready',
            songKey,
            stream: {
                bvid: info.bvid,
                cid: info.cid,
                title: info.title,
                author: info.author,
                durationSec: stream.durationSec || info.durationSec,
                videoUrl: stream.videoUrl,
                quality: stream.quality,
            },
            keyword,
            manual: Boolean(manualBv),
        };
    } catch (error) {
        return {
            state: 'error',
            songKey,
            stream: null,
            keyword,
            manual: Boolean(manualBv),
            message: describeError(error),
        };
    }
};

const resolveWithCache = async (song: SongResult, force: boolean): Promise<BilibiliMvResolution> => {
    const songKey = songKeyOf(song);
    const cached = resolutionCache.get(songKey);
    if (!force && cached && Date.now() - cached.at < RESOLUTION_TTL_MS) {
        return cached.resolution;
    }
    const running = inFlight.get(songKey);
    if (!force && running) return running;

    const task = resolveMv(song).then(resolution => {
        resolutionCache.set(songKey, { resolution, at: Date.now() });
        inFlight.delete(songKey);
        return resolution;
    }).catch(error => {
        inFlight.delete(songKey);
        throw error;
    });
    inFlight.set(songKey, task);
    return task;
};

export const useBilibiliMvStore = create<BilibiliMvStoreState>((set, get) => ({
    auth: { ...UNKNOWN_AUTH, available: isBilibiliAvailable() },
    resolution: null,
    resolvingSongKey: null,
    overrides: readOverrides(),
    lastKeyword: null,
    refreshAuth: async () => {
        const available = isBilibiliAvailable();
        if (!available) {
            set({ auth: { state: 'signed-out', account: null, available: false } });
            return;
        }
        const bridge = window.electron?.bilibili;
        if (!bridge) return;
        try {
            const status = await bridge.getStatus();
            set({ auth: status });
        } catch (error) {
            console.warn('[BilibiliMv] Could not read the account:', error);
            const account = await getAccount();
            set({ auth: { state: account ? 'signed-in' : 'signed-out', account, available } });
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
            if (status.state === 'signed-in') {
                setStatusMessage({ type: 'success', text: i18n.t('options.shinoLabBilibiliSignedIn') });
                // 登录之后画质才可能升档：把当前这首重新解析一次。
                const resolution = get().resolution;
                if (resolution) {
                    resolutionCache.delete(resolution.songKey);
                    set({ resolution: { ...resolution, state: 'resolving' } });
                }
            }
        } catch (error) {
            console.warn('[BilibiliMv] Sign-in failed:', error);
            setStatusMessage({ type: 'error', text: i18n.t('options.shinoLabBilibiliSignInFailed') });
        }
    },
    signOut: async () => {
        const bridge = typeof window === 'undefined' ? undefined : window.electron?.bilibili;
        if (!bridge) return;
        try {
            const status = await bridge.signOut();
            set({ auth: status });
            resolutionCache.clear();
        } catch (error) {
            console.warn('[BilibiliMv] Sign-out failed:', error);
        }
    },
    setManualBv: async (song, input) => {
        if (!song) return;
        const songKey = songKeyOf(song);
        const trimmed = input.trim();
        const bvid = trimmed ? extractBvid(trimmed) : null;
        const overrides = { ...get().overrides };
        if (trimmed && !bvid) {
            setStatusMessage({ type: 'error', text: i18n.t('options.shinoLabBilibiliInvalidBv') });
            return;
        }
        if (bvid) overrides[songKey] = bvid;
        else delete overrides[songKey];
        writeOverrides(overrides);
        resolutionCache.delete(songKey);
        set({ overrides });
        await get().resolveForSong(song, { force: true });
    },
    clearManualBv: (song) => {
        if (!song) return;
        const songKey = songKeyOf(song);
        const overrides = { ...get().overrides };
        delete overrides[songKey];
        writeOverrides(overrides);
        resolutionCache.delete(songKey);
        set({ overrides });
        void get().resolveForSong(song, { force: true });
    },
    resolveForSong: async (song, options) => {
        if (!song) {
            set({ resolution: null, resolvingSongKey: null, lastKeyword: null });
            return;
        }
        const songKey = songKeyOf(song);
        const current = get().resolution;
        const cached = resolutionCache.get(songKey)?.resolution;
        const seed = cached ?? current;
        set({
            resolvingSongKey: songKey,
            resolution: seed && seed.songKey === songKey
                ? { ...seed, state: 'resolving' }
                : { state: 'resolving', songKey, stream: null, keyword: buildSearchKeyword(song), manual: false },
        });
        const resolution = await resolveWithCache(song, Boolean(options?.force));
        // 解析期间换过歌的话，旧结果不能盖到新歌上。
        if (useBilibiliMvStore.getState().resolvingSongKey !== songKey) return;
        set({ resolution, resolvingSongKey: null, lastKeyword: resolution.keyword });
    },
    reset: () => {
        set({ resolution: null, resolvingSongKey: null, lastKeyword: null });
    },
}));
