import { create } from 'zustand';
import type { SongResult } from '../../../types';
import { useBilibiliMvStore, selectMvOffsetSec } from '../useBilibiliMvStore';
import { songKeyOf } from '../bilibili/mvMatch';

// src/shinoinject/lab/videoBackground/useOffsetTuningStore.ts
// 「在画面中调整」：把音画偏移的调节搬到歌词画报上，边看画面边对。
//
// 打开时记下当时的偏移当基线；调节过程中每一次改动都立刻写进匹配缓存（画面当场跟着动，
// 不需要先按确定）。「确定」只是收掉悬浮窗，值已经在缓存里；「返回」把基线放回去再收。
//
// 这里只放「正在调哪首歌、草稿是多少」这点 UI 状态，偏移本身仍然只有 useBilibiliMvStore 一份。

type OffsetTuningState = {
    isOpen: boolean;
    /** 正在调的那首歌；null 表示没打开。 */
    song: SongResult | null;
    /** 打开那一刻的偏移（秒），返回时放回去。 */
    baselineSec: number;
    /** 现在显示 / 生效的偏移（秒）。 */
    draftSec: number;
    /** 在设置里按「在画面中调整」。 */
    begin: (song: SongResult | null) => void;
    /** 调一格 / 输入一个值：立刻生效。 */
    setDraft: (offsetSec: number) => void;
    /** 放弃这次调整：回到打开时的值。 */
    cancel: () => void;
    /** 收下这次调整：值已经在缓存里，只把悬浮窗关掉。 */
    confirm: () => void;
};

const currentOffsetOf = (song: SongResult | null): number => {
    if (!song) return 0;
    const songKey = songKeyOf(song);
    const mv = useBilibiliMvStore.getState();
    const bvid = mv.resolution && mv.resolution.songKey === songKey ? mv.resolution.stream?.bvid : null;
    return selectMvOffsetSec(mv, songKey, bvid);
};

export const useOffsetTuningStore = create<OffsetTuningState>((set, get) => ({
    isOpen: false,
    song: null,
    baselineSec: 0,
    draftSec: 0,
    begin: (song) => {
        if (!song) return;
        const baselineSec = currentOffsetOf(song);
        set({ isOpen: true, song, baselineSec, draftSec: baselineSec });
    },
    setDraft: (offsetSec) => {
        const { song } = get();
        if (!song) return;
        set({ draftSec: offsetSec });
        useBilibiliMvStore.getState().setOffsetSec(song, offsetSec);
    },
    cancel: () => {
        const { song, baselineSec } = get();
        if (song) useBilibiliMvStore.getState().setOffsetSec(song, baselineSec);
        set({ isOpen: false, song: null, baselineSec: 0, draftSec: 0 });
    },
    confirm: () => {
        set({ isOpen: false, song: null, baselineSec: 0, draftSec: 0 });
    },
}));
