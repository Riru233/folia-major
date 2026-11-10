import { useMemo } from 'react';
import { useShinoLabStore } from '../../../shinoinject/lab/useShinoLabStore';
import type { VisualizerBackgroundMode } from '../../../types';
import { VISUALIZER_BACKGROUND_REGISTRY } from './registry';

// src/components/visualizer/backgrounds/availability.ts
// 哪些背景类型此刻该出现在选择器里。
//
// 内建类型全部常驻，只有「视频」是实验性的，且它有两项前置开关：
//   1. 视频播放（shino_lab_video_playback）—— 曲目自带画面与装饰视频层的总开关；
//   2. 实验性背景·bilibili MV（shino_lab_bilibili_mv）—— 背景类型里多出的「视频」。
// 两者都开着，「视频」背景才可选；注册表本身不动——背景渲染还要认得这个 id（配置导入、旧的
// 设置都可能带着它），只是不给用户选。

export type BackgroundAvailabilityFlags = {
    /** 实验性背景·bilibili MV 开关。 */
    bilibiliMvEnabled: boolean;
    /** 视频播放总开关（曲目自带画面与装饰视频层）。bilibili 视频背景以它为前置条件。 */
    videoPlaybackEnabled: boolean;
};

const LAB_GATED_MODES: Partial<Record<VisualizerBackgroundMode, (flags: BackgroundAvailabilityFlags) => boolean>> = {
    video: ({ bilibiliMvEnabled, videoPlaybackEnabled }) => bilibiliMvEnabled && videoPlaybackEnabled,
};

export const isBackgroundModeAvailable = (mode: VisualizerBackgroundMode, flags: BackgroundAvailabilityFlags): boolean => (
    !LAB_GATED_MODES[mode] || LAB_GATED_MODES[mode]!(flags)
);

/** 背景选择器用这一份：随实验室开关变化。 */
export const useAvailableBackgroundEntries = () => {
    const bilibiliMvEnabled = useShinoLabStore(state => state.bilibiliMvEnabled);
    const videoPlaybackEnabled = useShinoLabStore(state => state.videoPlaybackEnabled);
    return useMemo(
        () => VISUALIZER_BACKGROUND_REGISTRY.filter(entry => isBackgroundModeAvailable(entry.mode, { bilibiliMvEnabled, videoPlaybackEnabled })),
        [bilibiliMvEnabled, videoPlaybackEnabled],
    );
};
