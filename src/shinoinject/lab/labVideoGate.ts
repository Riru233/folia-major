// src/shinoinject/lab/labVideoGate.ts
// 「视频播放」实验开关的非 React 读取口。本地曲库导入/扫描这类服务层逻辑只想知道开关当前
// 是开是关，不该为了一个布尔值去订阅 zustand store（那会把 i18n 与设置 store 一起拖进服务层）。
// localStorage 键与 useShinoLabStore 共用这一处常量，避免两边写成不同的名字。

import { getStoredBoolean } from '../../stores/storagePrimitives';

export const LAB_VIDEO_PLAYBACK_KEY = 'shino_lab_video_playback';

/** 与 store 的默认值一致：从没存过就是打开。没有 localStorage 的环境（单测、SSR 式渲染）也按打开。 */
export const isLabVideoPlaybackEnabled = (): boolean => (
    typeof window === 'undefined' || typeof localStorage === 'undefined'
        ? true
        : getStoredBoolean(LAB_VIDEO_PLAYBACK_KEY, true)
);

/**
 * 开关切换时派发：曲库列表要按新状态重读一遍。
 * 单独一条事件而不是复用 LOCAL_MUSIC_UPDATED_EVENT——那条会连带触发磁盘重扫。
 */
export const LAB_VIDEO_GATE_CHANGED_EVENT = 'folia-lab-video-gate-changed';

export const notifyLabVideoGateChanged = (): void => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new Event(LAB_VIDEO_GATE_CHANGED_EVENT));
};

/**
 * 这条记录是不是「实验关着、因此不该被看见也不该播放」的视频曲目。
 * 列表过滤、播放源加载与恢复判断共用这一处，免得三处各写一遍条件。
 */
export const isGatedVideoRecord = (song: { mediaKind?: 'audio' | 'video' }): boolean => (
    song.mediaKind === 'video' && !isLabVideoPlaybackEnabled()
);

/**
 * 关掉实验后，视频记录不再出现在曲库列表、队列和会话恢复里。
 * 只过滤读出来的结果，记录本身留在库里：重新打开开关就立刻回来，不需要重扫。
 */
export const withoutGatedVideoSongs = <T extends { mediaKind?: 'audio' | 'video' }>(songs: readonly T[]): T[] => (
    songs.filter(song => !isGatedVideoRecord(song))
);
