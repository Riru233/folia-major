import type { BilibiliSearchHit } from '../types/bilibili';
import { readStoredString, setStoredString } from '../stores/storagePrimitives';

// src/services/bilibiliVideoHistory.ts
// 在线视频自己的播放记录：哪条 bvid 什么时候点的、点过几次。
//
// 和在线音乐的最近播放（components/app/home/explore/recentPlays.ts）**故意分开**：
// 那边记的是「歌」——按平台和账号分桶，参与曲库、推荐和听歌统计；这里记的是「视频」，
// 只有 bvid 和展示用的几个字段，只服务于视频探索页开头的「最近播放」和「再看一次」。
// 两者用不同的 localStorage 键，互不写入，所以听歌不会把视频顶到音乐探索页上去，反之亦然。
//
// 视频曲目在播放链里挂的是 stage 源引用（见 services/bilibiliPlayback.ts），那条路本来就不进
// 音乐的播放记录，这里补上的正是「视频自己的一份」。

const STORAGE_KEY = 'folia_bilibili_video_plays';
/** 最多记这么多条，超出从最旧的开始丢。 */
const MAX_PLAYS = 120;
/** 「最近播放」和「再看一次」只列最近这些天点过的。 */
const RECENT_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface VideoPlay {
    video: BilibiliSearchHit;
    /** 最后一次点开的时间。 */
    at: number;
    /** 点开过几次：大于 1 的进「再看一次」。 */
    count: number;
}

const isHit = (value: unknown): value is BilibiliSearchHit => (
    typeof value === 'object' && value !== null
    && typeof (value as BilibiliSearchHit).bvid === 'string'
    && (value as BilibiliSearchHit).bvid.length > 0
);

const isPlay = (value: unknown): value is VideoPlay => (
    typeof value === 'object' && value !== null
    && isHit((value as VideoPlay).video)
    && Number.isFinite((value as VideoPlay).at)
    && Number.isFinite((value as VideoPlay).count)
);

const read = (): VideoPlay[] => {
    try {
        const stored: unknown = JSON.parse(readStoredString(STORAGE_KEY) ?? 'null');
        if (!Array.isArray(stored)) return [];
        return stored.filter(isPlay).slice(0, MAX_PLAYS);
    } catch {
        return [];
    }
};

let kept: VideoPlay[] | null = null;
const recall = (): VideoPlay[] => (kept ??= read());

const store = (plays: VideoPlay[]): void => {
    kept = plays;
    setStoredString(STORAGE_KEY, JSON.stringify(plays));
};

const watchers = new Set<() => void>();

/** 播放记录一变就调用 `watcher`；返回退订函数。 */
export const watchVideoPlays = (watcher: () => void): (() => void) => {
    watchers.add(watcher);
    return () => { watchers.delete(watcher); };
};

// 读出来的列表：内容没变时给同一个数组，useSyncExternalStore 才不会一直重渲染。
// 记录本身变一次（`dataRevision`）或跨过一天（「最近」的窗口向前挪了）才重算。
let lists: { recent: BilibiliSearchHit[]; again: BilibiliSearchHit[] } = { recent: [], again: [] };
let dataRevision = 0;
let listsRevision = -1;
let listsDay = -1;

const refreshLists = (): void => {
    const day = Math.floor(Date.now() / DAY_MS);
    if (listsRevision === dataRevision && listsDay === day) return;
    listsRevision = dataRevision;
    listsDay = day;
    const now = Date.now();
    const plays = recall().filter(play => now - play.at <= RECENT_DAYS * DAY_MS);
    lists = {
        recent: plays.map(play => play.video),
        again: plays
            .filter(play => play.count > 1)
            .sort((one, other) => other.count - one.count || other.at - one.at)
            .map(play => play.video),
    };
};

/** 记一次点开：同一条 bvid 只留一条，时间推新、次数加一。 */
export const noteVideoPlayed = (video: BilibiliSearchHit): void => {
    const now = Date.now();
    const before = recall();
    const had = before.find(play => play.video.bvid === video.bvid);
    const played: VideoPlay = { video, at: now, count: (had?.count ?? 0) + 1 };
    store([played, ...before.filter(play => play.video.bvid !== video.bvid)].slice(0, MAX_PLAYS));
    dataRevision += 1;
    refreshLists();
    for (const watcher of watchers) watcher();
};

/** 最近点开的视频，最新在前：探索页开头的「最近播放」。内容不变时是同一个数组。 */
export const recentVideos = (): BilibiliSearchHit[] => {
    refreshLists();
    return lists.recent;
};

/** 点过不止一次的视频，次数多的在前：探索页的「再看一次」。内容不变时是同一个数组。 */
export const replayedVideos = (): BilibiliSearchHit[] => {
    refreshLists();
    return lists.again;
};
