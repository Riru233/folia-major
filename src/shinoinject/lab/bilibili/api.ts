import type { BilibiliAccount, BilibiliSearchHit } from '../../../types/bilibili';
import { signWbiParams, wbiKeyFromUrl } from './wbi';
import { requestBilibiliUrl } from './transport';

// src/shinoinject/lab/bilibili/api.ts
// bilibili 的三个只读接口，加上「这个浏览器现在是谁」。
//
// 搜索与播放地址都要 wbi 签名，密钥从 nav 接口得到、缓存十分钟。播放地址只取画面流（DASH 的
// video 轨，或者老格式的 durl）：MV 的背景里声音永远是歌曲本身，拿音轨只会多一份没用的流量。
// 画质要不到时接口会降档返回，所以「要 1080p」不代表拿到的就是 1080p，实际高度跟着结果走。

const API_BASE = 'https://api.bilibili.com';
const WBI_TTL_MS = 10 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 12_000;

interface ApiEnvelope<T> {
    code: number;
    message?: string;
    data?: T;
}

class BilibiliApiError extends Error {
    readonly code: number;

    constructor(code: number, message: string) {
        super(message);
        this.name = 'BilibiliApiError';
        this.code = code;
    }
}

const withTimeout = <T>(task: Promise<T>): Promise<T> => new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new BilibiliApiError(-1, 'timeout')), REQUEST_TIMEOUT_MS);
    task.then(
        value => { clearTimeout(timer); resolve(value); },
        error => { clearTimeout(timer); reject(error); },
    );
});

const fetchJson = async <T>(url: string): Promise<ApiEnvelope<T>> => {
    const response = await withTimeout(requestBilibiliUrl(url, { method: 'GET' }));
    if (!response.bodyText) {
        throw new BilibiliApiError(-1, `empty response (${response.status})`);
    }
    try {
        return JSON.parse(response.bodyText) as ApiEnvelope<T>;
    } catch {
        throw new BilibiliApiError(-1, `unreadable response (${response.status})`);
    }
};

const unwrap = <T>(envelope: ApiEnvelope<T>): T => {
    if (envelope.code !== 0) {
        throw new BilibiliApiError(envelope.code, envelope.message || `bilibili error ${envelope.code}`);
    }
    if (envelope.data === undefined) {
        throw new BilibiliApiError(envelope.code, 'empty payload');
    }
    return envelope.data;
};

let wbiKeys: { imgKey: string; subKey: string; fetchedAt: number } | null = null;

interface NavPayload {
    isLogin?: boolean;
    face?: string;
    uname?: string;
    mid?: number;
    vipStatus?: number;
    wbi_img?: { img_url?: string; sub_url?: string };
}

const readWbiKeys = async (force: boolean) => {
    if (!force && wbiKeys && Date.now() - wbiKeys.fetchedAt < WBI_TTL_MS) return wbiKeys;
    const nav = await fetchJson<NavPayload>(`${API_BASE}/x/web-interface/nav`);
    // nav 在未登录时 code 也是 0，只是 isLogin 为 false；拿不到 data 才当作失败。
    const imgUrl = nav.data?.wbi_img?.img_url;
    const subUrl = nav.data?.wbi_img?.sub_url;
    if (!imgUrl || !subUrl) {
        throw new BilibiliApiError(nav.code, nav.message || 'missing wbi keys');
    }
    wbiKeys = { imgKey: wbiKeyFromUrl(imgUrl), subKey: wbiKeyFromUrl(subUrl), fetchedAt: Date.now() };
    return wbiKeys;
};

const signedUrl = async (path: string, params: Record<string, string | number>) => {
    const keys = await readWbiKeys(false);
    return `${API_BASE}${path}?${signWbiParams(params, keys.imgKey, keys.subKey)}`;
};

export const stripSearchHighlight = (text: string): string => text
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .trim();

const normalizeCoverUrl = (url: string) => (url.startsWith('//') ? `https:${url}` : url);

/** `12:34` / `1:02:03` → 秒。 */
export const parseDurationText = (text: string): number => {
    const parts = text.split(':').map(part => Number.parseInt(part, 10));
    if (parts.some(part => !Number.isFinite(part))) return 0;
    return parts.reduce((total, part) => total * 60 + part, 0);
};

const searchOnce = async (keyword: string, page: number): Promise<BilibiliSearchHit[]> => {
    const url = await signedUrl('/x/web-interface/wbi/search/type', {
        search_type: 'video',
        keyword,
        page,
        page_size: 30,
    });
    const envelope = await fetchJson<{ result?: unknown[] }>(url);
    const result = unwrap(envelope).result;
    if (!Array.isArray(result)) return [];
    return result.flatMap((item): BilibiliSearchHit[] => {
        const row = item as Record<string, unknown>;
        const bvid = typeof row.bvid === 'string' ? row.bvid : '';
        if (!bvid) return [];
        return [{
            bvid,
            // 搜索结果标题里带 <em class="keyword"> 高亮，展示前要去掉。
            title: stripSearchHighlight(typeof row.title === 'string' ? row.title : ''),
            author: typeof row.author === 'string' ? row.author : '',
            durationSec: parseDurationText(typeof row.duration === 'string' ? row.duration : ''),
            coverUrl: typeof row.pic === 'string' ? normalizeCoverUrl(row.pic) : '',
            playCount: typeof row.play === 'number' ? row.play : 0,
        }];
    });
};

/**
 * 搜视频。wbi 的密钥会过期、也会被服务端换掉，第一次 -403 就用新密钥再取一次。
 */
export const searchVideos = async (keyword: string, page = 1): Promise<BilibiliSearchHit[]> => {
    try {
        return await searchOnce(keyword, page);
    } catch (error) {
        if (error instanceof BilibiliApiError && (error.code === -403 || error.code === -352)) {
            await readWbiKeys(true);
            return searchOnce(keyword, page);
        }
        throw error;
    }
};

export interface BilibiliVideoInfo {
    bvid: string;
    cid: number;
    title: string;
    author: string;
    durationSec: number;
    coverUrl: string;
}

interface ViewPayload {
    bvid?: string;
    aid?: number;
    cid?: number;
    title?: string;
    pic?: string;
    duration?: number;
    owner?: { name?: string };
    pages?: Array<{ cid?: number; page?: number; part?: string }>;
}

export const getVideoInfo = async (bvid: string): Promise<BilibiliVideoInfo> => {
    const envelope = await fetchJson<ViewPayload>(`${API_BASE}/x/web-interface/view?bvid=${encodeURIComponent(bvid)}`);
    const data = unwrap(envelope);
    const cid = data.cid ?? data.pages?.[0]?.cid;
    if (!cid) throw new BilibiliApiError(-1, 'video has no playable page');
    return {
        bvid: data.bvid ?? bvid,
        cid,
        title: data.title ?? bvid,
        author: data.owner?.name ?? '',
        durationSec: data.duration ?? 0,
        coverUrl: data.pic ? normalizeCoverUrl(data.pic) : '',
    };
};

interface PlayUrlPayload {
    quality?: number;
    timelength?: number;
    dash?: {
        video?: Array<{ id?: number; baseUrl?: string; base_url?: string; codecid?: number; height?: number }>;
    };
    durl?: Array<{ url?: string }>;
}

export interface BilibiliPlayStream {
    videoUrl: string;
    quality: number;
    durationSec: number;
}

/** 只要画面：优先 AVC，拿不到再退到别的编码（HEVC 在部分显卡上解不了，那时由调用方兜底）。 */
export const getPlayStream = async (bvid: string, cid: number, maxQuality: number): Promise<BilibiliPlayStream> => {
    const url = await signedUrl('/x/player/wbi/playurl', {
        bvid,
        cid,
        qn: maxQuality,
        fnval: 16,
        fnver: 0,
        fourk: 1,
    });
    const data = unwrap(await fetchJson<PlayUrlPayload>(url));
    const durationSec = Math.round((data.timelength ?? 0) / 1000);

    const videos = data.dash?.video ?? [];
    if (videos.length > 0) {
        const playable = videos
            .map(video => ({
                id: video.id ?? 0,
                codecid: video.codecid ?? 0,
                url: video.baseUrl ?? video.base_url ?? '',
            }))
            .filter(video => Boolean(video.url));
        const withinBudget = playable.filter(video => video.id <= maxQuality);
        const pool = withinBudget.length > 0 ? withinBudget : playable;
        const avc = pool.filter(video => video.codecid === 7);
        const preferred = avc.length > 0 ? avc : pool;
        const best = preferred.reduce((left, right) => (right.id > left.id ? right : left), preferred[0]!);
        return { videoUrl: best.url, quality: best.id, durationSec };
    }

    const direct = data.durl?.[0]?.url;
    if (direct) return { videoUrl: direct, quality: data.quality ?? 0, durationSec };
    throw new BilibiliApiError(-1, 'no video track');
};

interface NavAccountPayload extends NavPayload {
    isLogin?: boolean;
    vipStatus?: number;
}

/** 当前登录的账号；没登录（或网页版拿不到）时为 null。 */
export const getAccount = async (): Promise<BilibiliAccount | null> => {
    try {
        const nav = await fetchJson<NavAccountPayload>(`${API_BASE}/x/web-interface/nav`);
        const data = nav.data;
        if (!data?.isLogin || !data.mid) return null;
        return {
            mid: data.mid,
            uname: data.uname ?? '',
            face: data.face ? normalizeCoverUrl(data.face) : '',
            vip: (data.vipStatus ?? 0) > 0,
        };
    } catch (error) {
        console.warn('[Bilibili] Could not read the account:', error);
        return null;
    }
};

export { BilibiliApiError };
