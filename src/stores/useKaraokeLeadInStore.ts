import { create } from 'zustand';

// src/stores/useKaraokeLeadInStore.ts
// 卡拉OK 开头的「预备点交叉时间」，按歌单独记。
//
// 交叉时间指的是「标题结束前多久开始倒数」：前奏有 4 秒的歌要 4 秒，前奏二十秒的歌要二十秒，
// 一个全局值套不到所有歌上。这里的数按播放键存（getPlaybackSongKey），没存过的歌继续用
// 设置里那个全局值，所以只改全局也能一次改掉大多数歌。
//
// 和 karaoke_info_v1 一样放 localStorage：条目就是一个数字，渲染端在同步路径上读它，
// 不该等一次 IndexedDB 往返。

export const KARAOKE_LEAD_IN_STORAGE_KEY = 'karaoke_lead_in_v1';

/** 交叉时间只要求是个非负的有限数，不设上限：前奏多长都能填进去。 */
export const normalizeKaraokeLeadInSeconds = (value: unknown): number | null => (
    typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
);

const readStored = (): Record<string, number> => {
    if (typeof window === 'undefined') {
        return {};
    }

    try {
        const parsed = JSON.parse(window.localStorage.getItem(KARAOKE_LEAD_IN_STORAGE_KEY) || 'null');
        if (!parsed || typeof parsed !== 'object') {
            return {};
        }

        const out: Record<string, number> = {};
        for (const [songKey, value] of Object.entries(parsed as Record<string, unknown>)) {
            const seconds = normalizeKaraokeLeadInSeconds(value);
            if (seconds !== null) {
                out[songKey] = seconds;
            }
        }
        return out;
    } catch {
        return {};
    }
};

const writeStored = (bySong: Record<string, number>) => {
    if (typeof window === 'undefined') {
        return;
    }

    try {
        window.localStorage.setItem(KARAOKE_LEAD_IN_STORAGE_KEY, JSON.stringify(bySong));
    } catch {
        // 写不进去（隐私模式 / 配额）就只留在内存里，至少这一轮播放是对的。
    }
};

type KaraokeLeadInState = {
    /** 歌曲键 → 这首歌的交叉时间（秒）。没有条目＝跟着设置里的全局值走。 */
    bySong: Record<string, number>;
    /** seconds 传 null 表示删掉这首歌的值，回到全局值。 */
    setSeconds: (songKey: string, seconds: number | null) => void;
};

export const useKaraokeLeadInStore = create<KaraokeLeadInState>((set, get) => ({
    bySong: readStored(),
    setSeconds: (songKey, seconds) => {
        const next = { ...get().bySong };
        if (seconds === null) {
            delete next[songKey];
        } else {
            next[songKey] = Math.max(0, seconds);
        }
        writeStored(next);
        set({ bySong: next });
    },
}));

/** 同步读一个不订阅的调用方拿这首歌的值。 */
export const getKaraokeLeadInSeconds = (songKey: string | null): number | null => (
    songKey ? useKaraokeLeadInStore.getState().bySong[songKey] ?? null : null
);
