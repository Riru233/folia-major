// src/types/bilibili.ts
// What the Shino 实验室's bilibili MV background needs to know: the account it borrows a picture
// from, a search hit, and the play address resolved for one song.

export type BilibiliAuthState = 'unknown' | 'signed-out' | 'signed-in';

export interface BilibiliAccount {
    mid: number;
    uname: string;
    face: string;
    /** 大会员：决定了能不能拿到 1080p 的画面。 */
    vip: boolean;
}

export interface BilibiliAuthStatus {
    state: BilibiliAuthState;
    account: BilibiliAccount | null;
    /** 只有桌面版能登录：网页版的跨域请求会被 bilibili 拒掉。 */
    available: boolean;
}

/** 主进程代理一次请求的答复：网页版的跨域请求会被 bilibili 拒掉，桌面版走这个。 */
export interface BilibiliBridgeResponse {
    ok: boolean;
    status: number;
    bodyText: string;
}

export interface BilibiliBridgeRequest {
    url: string;
    method?: string;
    body?: string;
    headers?: Record<string, string>;
}

/** One video the search returned, as far as picking an MV goes. */
export interface BilibiliSearchHit {
    bvid: string;
    title: string;
    author: string;
    /** 秒。 */
    durationSec: number;
    coverUrl: string;
    playCount: number;
}

/** A song's MV: which BV it is, and the address of its picture (the sound stays the song's own). */
export interface BilibiliMvStream {
    bvid: string;
    cid: number;
    title: string;
    author: string;
    durationSec: number;
    /** 带签名的视频直链，只够这一段时间用，所以只活在这一次播放里。 */
    videoUrl: string;
    /** 播放地址实际给到的高度（360/480/720/1080）。 */
    quality: number;
}

export type BilibiliMvState = 'idle' | 'resolving' | 'ready' | 'missing' | 'error';

export interface BilibiliMvResolution {
    state: BilibiliMvState;
    /** 这首歌的 key（`title|||artist` 的归一化形式）。 */
    songKey: string;
    stream: BilibiliMvStream | null;
    /** 匹配用的 bilibili 搜索词，出错时给用户看是拿什么去搜的。 */
    keyword: string;
    /** 面板里改过 BV：这一条不参与自动重搜，直到用户清掉它。 */
    manual: boolean;
    message?: string;
}
