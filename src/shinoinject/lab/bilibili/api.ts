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
    /** durl 常给多个备用 CDN，主地址被拒时按顺序换。 */
    backupUrls?: string[];
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

// ---------------------------------------------------------------------------
// 在线视频页用的只读接口。上面那套只取画面流，是给 MV 背景用的；这里要的是能直接播的视频条目。
// 三个入口都沿用同一条主进程代理（带 cookies / Referer），网页版依旧会被 CORS 拒掉。
// ---------------------------------------------------------------------------

/** bilibili 各处的列表条目长得一样：热门、排行榜、每周必看、入站必刷都套这一个。 */
interface VideoRow {
    bvid?: string;
    title?: string;
    pic?: string;
    duration?: number;
    owner?: { name?: string };
    stat?: { view?: number };
}

interface VideoListPayload {
    list?: VideoRow[];
}

const videoRowToHit = (row: VideoRow): BilibiliSearchHit[] => {
    const bvid = typeof row.bvid === 'string' ? row.bvid : '';
    if (!bvid) return [];
    return [{
        bvid,
        title: stripSearchHighlight(typeof row.title === 'string' ? row.title : ''),
        author: row.owner?.name ?? '',
        durationSec: typeof row.duration === 'number' ? row.duration : 0,
        coverUrl: row.pic ? normalizeCoverUrl(row.pic) : '',
        playCount: typeof row.stat?.view === 'number' ? row.stat.view : 0,
    }];
};

const rowsToHits = (rows: VideoRow[] | undefined): BilibiliSearchHit[] => (rows ?? []).flatMap(videoRowToHit);

/** 带签名的 GET：密钥过期（-403）或被换掉（-352）时换一份再试一次。 */
const fetchSigned = async <T>(path: string, params: Record<string, string | number>): Promise<T> => {
    try {
        return unwrap(await fetchJson<T>(await signedUrl(path, params)));
    } catch (error) {
        if (error instanceof BilibiliApiError && (error.code === -403 || error.code === -352)) {
            await readWbiKeys(true);
            return unwrap(await fetchJson<T>(await signedUrl(path, params)));
        }
        throw error;
    }
};

/** 首页推荐流的条目：比别处多一个 `goto`（夹着广告和登录卡）和推荐理由。 */
interface RecommendRow extends VideoRow {
    goto?: string;
    rcmd_reason?: { content?: string };
}

interface RecommendPayload {
    item?: RecommendRow[];
}

/** 首页推荐流一批要凑够几条视频（广告、登录卡不算）。 */
export const RECOMMEND_BATCH_SIZE = 25;
/** 一次向接口要几条：比 25 多要几条，好把必夹的广告和登录卡抵掉。 */
const RECOMMEND_PAGE_SIZE = 30;
/** 一批凑不够 25 条时，最多再往后要几批补上。 */
const RECOMMEND_MAX_ROUNDS = 3;

export interface RecommendBatch {
    items: BilibiliSearchHit[];
    /** 这一批之后该从第几批接着换：凑数可能多吃了不止一页，游标得跟着走。 */
    nextIdx: number;
}

const readRecommendPage = async (freshIdx: number): Promise<BilibiliSearchHit[]> => {
    const data = await fetchSigned<RecommendPayload>('/x/web-interface/wbi/index/top/feed/rcmd', {
        web_location: 1430650,
        y_num: 5,
        fresh_type: freshIdx > 1 ? 4 : 3,
        feed_version: 'V8',
        fresh_idx: freshIdx,
        fresh_idx_1h: freshIdx,
        fetch_row: 1,
        ps: RECOMMEND_PAGE_SIZE,
        homepage_ver: 1,
        brush: Math.max(0, freshIdx - 1),
    });
    return (data.item ?? []).flatMap(row => {
        // 广告、登录卡、直播卡都没有 bvid；只留能当视频播的那一种。
        if (row.goto !== undefined && row.goto !== 'av') return [];
        const hits = videoRowToHit(row);
        const reason = row.rcmd_reason?.content ?? '';
        return reason ? hits.map(hit => ({ ...hit, reason })) : hits;
    });
};

/**
 * 推荐页：和 www.bilibili.com 首页同一口数据，也就是「换一换」按钮背后那个接口。
 *
 * 它不是翻页，而是「第几批」：每点一次换一换，fresh_idx / fresh_idx_1h 各 +1，服务端就给一批新的；
 * brush 是这一轮已经换过几次。第一次进来用 fresh_type=3（首页首屏），之后用 4（换一换），
 * 这样拿到的才是网页版看到的那条流，而不是热门榜。
 *
 * 一批要凑够 `count` 条视频（默认 25）：ps 里必夹广告和登录卡，一页通常只有二十几条能播的，
 * 不够就带着下一个游标再要一批补上。`exclude` 是屏幕上已经有的 bvid——换一换不该把刚看过的原样摆回来。
 */
export const getRecommendedVideos = async (
    freshIdx = 1,
    count = RECOMMEND_BATCH_SIZE,
    exclude: Iterable<string> = [],
): Promise<RecommendBatch> => {
    const wanted = Math.max(1, count);
    const seen = new Set<string>(exclude);
    const items: BilibiliSearchHit[] = [];
    let cursor = Math.max(1, freshIdx);

    for (let round = 0; round < RECOMMEND_MAX_ROUNDS && items.length < wanted; round += 1) {
        const page = await readRecommendPage(cursor);
        cursor += 1;
        for (const hit of page) {
            if (items.length >= wanted) break;
            if (seen.has(hit.bvid)) continue;
            seen.add(hit.bvid);
            items.push(hit);
        }
        if (page.length === 0) break;
    }

    return { items, nextIdx: cursor };
};

/** 热门榜：探索页拿它当「综合热门」的来源，不需要 wbi 签名。 */
export const getPopularVideos = async (page = 1, pageSize = 20): Promise<BilibiliSearchHit[]> => {
    const envelope = await fetchJson<VideoListPayload>(
        `${API_BASE}/x/web-interface/popular?pn=${page}&ps=${pageSize}`,
    );
    return rowsToHits(unwrap(envelope).list);
};

/**
 * 探索页的数据源：分区排行榜。rid 是 bilibili 的分区号（0 = 全站）。
 * 排行榜同样不需要 wbi 签名。
 */
export const getRankedVideos = async (rid = 0): Promise<BilibiliSearchHit[]> => {
    const envelope = await fetchJson<VideoListPayload>(
        `${API_BASE}/x/web-interface/ranking/v2?rid=${rid}&type=all`,
    );
    return rowsToHits(unwrap(envelope).list);
};

/** 入站必刷（popular/history）：bilibili 自己挑的一份「没看过就亏了」的片单，分页给。 */
export const getPreciousVideos = async (page = 1, pageSize = 20): Promise<BilibiliSearchHit[]> => {
    const envelope = await fetchJson<VideoListPayload>(
        `${API_BASE}/x/web-interface/popular/precious?page_size=${pageSize}&page=${page}`,
    );
    return rowsToHits(unwrap(envelope).list);
};

/** 每周必看的一期。接口只给期号、主题和一句标题，封面得自己画。 */
export interface BilibiliWeeklyIssue {
    number: number;
    subject: string;
    /** 形如「2026第400期 11.13 - 11.19」。 */
    name: string;
}

interface WeeklySeriesPayload {
    list?: Array<{ number?: number; subject?: string; name?: string }>;
}

/** 每周必看的期号列表，最新一期在前。列表本身不校验 wbi；只有某一期的视频要签名。 */
export const getWeeklyIssues = async (): Promise<BilibiliWeeklyIssue[]> => {
    const envelope = await fetchJson<WeeklySeriesPayload>(`${API_BASE}/x/web-interface/popular/series/list`);
    return (unwrap(envelope).list ?? []).flatMap((row): BilibiliWeeklyIssue[] => (
        typeof row.number === 'number' && row.number > 0
            ? [{ number: row.number, subject: row.subject ?? '', name: row.name ?? '' }]
            : []
    ));
};

/** 某一期的视频。 */
export const getWeeklyIssueVideos = async (number: number): Promise<BilibiliSearchHit[]> => {
    const data = await fetchSigned<VideoListPayload>('/x/web-interface/popular/series/one', { number });
    return rowsToHits(data.list);
};

/** 画质档位：和界面上的 360P / 720P / 1080P 对齐。 */
export type VideoQuality = 360 | 720 | 1080;

/** 画质档位 → bilibili 的 qn 参数。qn 只是上限，接口会按登录态降档返回。 */
export const VIDEO_QUALITY_QN: Readonly<Record<VideoQuality, number>> = {
    360: 16,
    720: 64,
    1080: 80,
};

interface AudioPlayUrlPayload extends PlayUrlPayload {
    durl?: Array<{ url?: string; backup_url?: string[]; size?: number }>;
}

/**
 * 拿一条能直接塞进 <video> 的地址：fnval=1 走 durl 的 mp4（音视频合一）。
 * 和 getPlayStream 的区别是这里要声音（在线视频是真的在播视频，不是拿画面做背景）。
 *
 * fnval 必须是 1 而不是 0：0 是 FLV，Chromium 的媒体栈解不了，写成本地文件也放不出来。
 */
export const getVideoStreamWithAudio = async (
    bvid: string,
    cid: number,
    quality: 360 | 720 | 1080,
): Promise<BilibiliPlayStream> => {
    const ask = async (qn: number): Promise<AudioPlayUrlPayload> => {
        const url = await signedUrl('/x/player/wbi/playurl', {
            bvid,
            cid,
            qn,
            fnval: 1,
            fnver: 0,
            fourk: 0,
            platform: 'pc',
            high_quality: 1,
        });
        return unwrap(await fetchJson<AudioPlayUrlPayload>(url));
    };

    // 未登录时高画质不一定报错，而是安静地给一个空 durl。逐档降下来，直到真的拿到一条流。
    const requested = VIDEO_QUALITY_QN[quality];
    const ladder = [requested, 64, 32].filter((qn, index, list) => qn <= requested && list.indexOf(qn) === index);
    let data: AudioPlayUrlPayload | null = null;
    let usedQn = requested;
    for (const qn of ladder) {
        const candidate = await ask(qn);
        if (candidate.durl?.[0]?.url) {
            data = candidate;
            usedQn = qn;
            break;
        }
    }
    const first = data?.durl?.[0];
    if (!data || !first?.url) throw new BilibiliApiError(-1, 'no playable stream');
    // 极老的视频只给 FLV，Chromium 的媒体栈解不了；早点说清楚，别等写进 OPFS 才失败。
    if (/\.flv(\?|$)/i.test(first.url)) throw new BilibiliApiError(-1, 'only an flv stream is available');
    return {
        videoUrl: first.url,
        backupUrls: (first.backup_url ?? []).filter((item): item is string => typeof item === 'string' && item.length > 0),
        // 未登录时 1080 会被降到 480，把接口实际给的档位带回去给界面显示。
        quality: data.quality ?? usedQn,
        durationSec: Math.round((data.timelength ?? 0) / 1000),
    };
};

export interface BilibiliFavoriteFolder {
    id: number;
    title: string;
    count: number;
}

interface FavFolderPayload {
    list?: Array<{ id?: number; title?: string; media_count?: number }>;
}

/** 收藏夹列表。需要先登录（拿 mid），未登录时上层直接显示登录引导。 */
export const getFavoriteFolders = async (mid: number): Promise<BilibiliFavoriteFolder[]> => {
    const envelope = await fetchJson<FavFolderPayload>(
        `${API_BASE}/x/v3/fav/folder/created/list-all?up_mid=${mid}&web_location=333.1387`,
    );
    const list = unwrap(envelope).list ?? [];
    return list.flatMap((row): BilibiliFavoriteFolder[] => {
        const id = typeof row.id === 'number' ? row.id : 0;
        if (!id) return [];
        return [{ id, title: row.title ?? `收藏夹 ${id}`, count: row.media_count ?? 0 }];
    });
};

interface FavResourcePayload {
    medias?: Array<{
        bvid?: string;
        title?: string;
        pic?: string;
        duration?: number;
        owner?: { name?: string };
        cnt_info?: { play?: number };
    }>;
}

/** 某个收藏夹里的视频。 */
export const getFavoriteVideos = async (folderId: number, page = 1): Promise<BilibiliSearchHit[]> => {
    const envelope = await fetchJson<FavResourcePayload>(
        `${API_BASE}/x/v3/fav/resource/list?media_id=${folderId}&pn=${page}&ps=20&platform=web`,
    );
    const medias = unwrap(envelope).medias ?? [];
    return medias.flatMap((row): BilibiliSearchHit[] => {
        const bvid = typeof row.bvid === 'string' ? row.bvid : '';
        if (!bvid) return [];
        return [{
            bvid,
            title: stripSearchHighlight(typeof row.title === 'string' ? row.title : ''),
            author: row.owner?.name ?? '',
            durationSec: typeof row.duration === 'number' ? row.duration : 0,
            coverUrl: row.pic ? normalizeCoverUrl(row.pic) : '',
            playCount: typeof row.cnt_info?.play === 'number' ? row.cnt_info.play : 0,
        }];
    });
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
