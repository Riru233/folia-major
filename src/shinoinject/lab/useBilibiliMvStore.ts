import { create } from 'zustand';
import i18n from '../../i18n/config';
import type { SongResult } from '../../types';
import type { BilibiliAuthStatus, BilibiliMvResolution, BilibiliMvTuning } from '../../types/bilibili';
import { getAccount, getPlayStream, getVideoInfo, searchVideos } from './bilibili/api';
import { buildSearchKeyword, extractBvid, pickBestMvHit, songKeyOf } from './bilibili/mvMatch';
import { normalizeOffsetSec, tuningAppliesTo } from './bilibili/avSync';
import { DESKTOP_ONLY_CODE, isBilibiliAvailable } from './bilibili/transport';
import { useShinoLabStore } from './useShinoLabStore';
import { setStatusMessage } from '../../stores/useStatusMessageStore';

// src/shinoinject/lab/useBilibiliMvStore.ts
// 实验性「视频」背景的那一半：这个浏览器现在是谁（一次登录，全局共享），以及当前这首歌的 MV
// 是从哪条 BV 来的、画面要跟歌曲错开多少毫秒。
//
// 一首歌的解析结果只留一份：换歌就把上一条丢掉，面板里看到的永远是「这首歌」的 BV。搜索结果和
// 播放直链都是短命的（直链带签名），所以缓存带时限，过期就重新解析；手写的 BV 与调好的音画
// 偏移不受时限影响——它们和这首歌绑在一起记下来，换歌回来时不用再搜一次、也不用再对一次。

/** 匹配缓存：每首歌钉住的 BV 与音画偏移。 */
const TUNING_STORAGE_KEY = 'shino_lab_bilibili_mv_tuning';
/** 上一版只存 BV（`songKey -> BV`），读到就迁进来，免得老用户的手写 BV 丢一次。 */
const LEGACY_OVERRIDES_STORAGE_KEY = 'shino_lab_bilibili_bv_overrides';
/** 播放直链有过期时间，二十分钟后重新解析一次，比等它失效再报错好。 */
const RESOLUTION_TTL_MS = 20 * 60 * 1000;

type TuningMap = Record<string, BilibiliMvTuning>;

/** 一条调校从存储里读回来时的清洗：BV 只留合法号，偏移只保留到毫秒，什么都没有就不要了。 */
const normalizeTuning = (raw: unknown): BilibiliMvTuning | null => {
    // 上一版存的是一句话：songKey -> BV。
    if (typeof raw === 'string') {
        const bvid = extractBvid(raw) ?? '';
        return bvid ? { pinnedBvid: bvid, offsetBvid: bvid, offsetSec: 0 } : null;
    }
    if (!raw || typeof raw !== 'object') return null;
    const record = raw as { pinnedBvid?: unknown; offsetBvid?: unknown; bvid?: unknown; offsetSec?: unknown; offsetMs?: unknown };
    const pinnedBvid = typeof record.pinnedBvid === 'string' ? (extractBvid(record.pinnedBvid) ?? '') : '';
    const offsetBvid = typeof record.offsetBvid === 'string'
        ? (extractBvid(record.offsetBvid) ?? '')
        // 更早的一版把偏移绑在 `bvid` 上。
        : typeof record.bvid === 'string' ? (extractBvid(record.bvid) ?? '') : '';
    // 再早一版以毫秒为单位存 offsetMs。
    const offsetSec = normalizeOffsetSec(
        record.offsetSec ?? (record.offsetMs === undefined ? undefined : Number(record.offsetMs) / 1000),
    );
    if (!pinnedBvid && offsetSec === 0) return null;
    return { pinnedBvid, offsetBvid: offsetSec === 0 ? '' : offsetBvid, offsetSec };
};

const readTunings = (): TuningMap => {
    if (typeof window === 'undefined') return {};
    try {
        const raw = localStorage.getItem(TUNING_STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw) as unknown;
            if (!parsed || typeof parsed !== 'object') return {};
            return Object.fromEntries(
                Object.entries(parsed as Record<string, unknown>)
                    .map(([key, value]) => [key, normalizeTuning(value)] as const)
                    .filter((entry): entry is readonly [string, BilibiliMvTuning] => entry[1] !== null),
            );
        }
        const legacy = localStorage.getItem(LEGACY_OVERRIDES_STORAGE_KEY);
        if (!legacy) return {};
        const parsed = JSON.parse(legacy) as unknown;
        if (!parsed || typeof parsed !== 'object') return {};
        return Object.fromEntries(
            Object.entries(parsed as Record<string, unknown>)
                .map(([key, value]) => [key, normalizeTuning(value)] as const)
                .filter((entry): entry is readonly [string, BilibiliMvTuning] => entry[1] !== null),
        );
    } catch {
        return {};
    }
};

const writeTunings = (tunings: TuningMap) => {
    if (typeof window === 'undefined') return;
    try {
        localStorage.setItem(TUNING_STORAGE_KEY, JSON.stringify(tunings));
    } catch (error) {
        console.warn('[BilibiliMv] Could not persist the MV tunings:', error);
    }
};


const UNKNOWN_AUTH: BilibiliAuthStatus = { state: 'unknown', account: null, available: false };

export type BilibiliMvStoreState = {
    auth: BilibiliAuthStatus;
    /** 当前这首歌的 MV 解析状态；换歌会清空。 */
    resolution: BilibiliMvResolution | null;
    /** 正在解析的那首歌，防止换歌时旧结果落回来。 */
    resolvingSongKey: string | null;
    /** 匹配缓存：每首歌钉住的 BV 与音画偏移，跟着这首歌走。 */
    tunings: TuningMap;
    /** 面板里最近一次匹配用的搜索词，出错时展示给用户。 */
    lastKeyword: string | null;
    refreshAuth: () => Promise<void>;
    signIn: () => Promise<void>;
    signOut: () => Promise<void>;
    /** 手写/粘贴一条 BV 给这首歌；空字符串表示清掉，回到自动匹配。 */
    setManualBv: (song: SongResult | null, input: string) => Promise<void>;
    clearManualBv: (song: SongResult | null) => void;
    /**
     * 调这首歌的音画偏移（秒，正数画面延后，负数提前；不设上限，小数保留到毫秒）。存的时候
     * 把当前这条 BV 一起记进匹配缓存：偏移是这条视频的属性，换了 BV 就不该再套用。
     */
    setOffsetSec: (song: SongResult | null, offsetSec: number) => void;
    /** 解析当前这首歌的 MV；同一首歌在缓存期内直接复用。 */
    resolveForSong: (song: SongResult | null, options?: { force?: boolean }) => Promise<void>;
    /** 换歌/关掉实验时清场。 */
    reset: () => void;
};

/**
 * 这首歌该用的偏移（秒）：没调过、或者调的是另一条 BV，都按 0 算（不把上一支视频的片头差套到新的上）。
 */
export const selectMvOffsetSec = (
    state: Pick<BilibiliMvStoreState, 'tunings'>,
    songKey: string | null,
    bvid: string | null | undefined,
): number => {
    if (!songKey) return 0;
    const tuning = state.tunings[songKey];
    return tuningAppliesTo(tuning, bvid) ? tuning!.offsetSec : 0;
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
    const manualBv = useBilibiliMvStore.getState().tunings[songKey]?.pinnedBvid ?? '';
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
    tunings: readTunings(),
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
        if (trimmed && !bvid) {
            setStatusMessage({ type: 'error', text: i18n.t('options.shinoLabBilibiliInvalidBv') });
            return;
        }
        const tunings = { ...get().tunings };
        const previous = tunings[songKey];
        // 换到另一条视频：上一支调出来的偏移不再适用；清掉手写 BV 时画面没变，偏移留着。
        const keepsOffset = !previous ? false : !bvid || !previous.offsetBvid || previous.offsetBvid === bvid;
        const next: BilibiliMvTuning = {
            pinnedBvid: bvid ?? '',
            offsetBvid: keepsOffset ? previous!.offsetBvid : '',
            offsetSec: keepsOffset ? previous!.offsetSec : 0,
        };
        if (!next.pinnedBvid && next.offsetSec === 0) delete tunings[songKey];
        else tunings[songKey] = next;
        writeTunings(tunings);
        resolutionCache.delete(songKey);
        set({ tunings });
        await get().resolveForSong(song, { force: true });
    },
    clearManualBv: (song) => {
        if (!song) return;
        const songKey = songKeyOf(song);
        const tunings = { ...get().tunings };
        const previous = tunings[songKey];
        // 只松掉钉住的 BV：偏移是这条画面的，回到自动匹配后仍然对得上。
        if (previous) {
            const next: BilibiliMvTuning = { ...previous, pinnedBvid: '' };
            if (next.offsetSec === 0) delete tunings[songKey];
            else tunings[songKey] = next;
        }
        writeTunings(tunings);
        resolutionCache.delete(songKey);
        set({ tunings });
        void get().resolveForSong(song, { force: true });
    },
    setOffsetSec: (song, offsetSec) => {
        if (!song) return;
        const songKey = songKeyOf(song);
        const nextOffset = normalizeOffsetSec(offsetSec);
        const resolution = get().resolution;
        const currentBvid = resolution && resolution.songKey === songKey ? resolution.stream?.bvid ?? '' : '';
        const tunings = { ...get().tunings };
        const previous = tunings[songKey];
        const next: BilibiliMvTuning = {
            pinnedBvid: previous?.pinnedBvid ?? '',
            // 偏移是给「现在这条画面」调的：还没有画面时先空着，表示它对结果都成立。
            offsetBvid: currentBvid || previous?.offsetBvid || '',
            offsetSec: nextOffset,
        };
        if (!next.pinnedBvid && next.offsetSec === 0) delete tunings[songKey];
        else tunings[songKey] = next;
        writeTunings(tunings);
        set({ tunings });
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
