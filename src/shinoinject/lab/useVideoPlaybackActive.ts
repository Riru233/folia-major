import { selectDisplaySong, usePlaybackStore } from '../../stores/usePlaybackStore';
import { useBilibiliMvStore } from './useBilibiliMvStore';
import { useShinoLabStore } from './useShinoLabStore';
import { useVisualizerSettingsStore } from '../../stores/useVisualizerSettingsStore';

// src/shinoinject/lab/useVideoPlaybackActive.ts
// 「屏幕上现在有画面在放吗」——实验室那枚「视频播放时隐藏歌词样式」要问的就是这个。
//
// 两种画面都算：视频曲目自己的 MV（实验里的视频播放开着时）、bilibili 视频背景解析成功时。
// 设置里那条装饰视频层不算：它本来就垫在歌词底下，是为了衬托歌词，不是取代它。

/** 当前这首歌是不是一条视频曲目，且实验里的视频播放开着。 */
export const useSongVideoActive = (): boolean => {
    const videoPlaybackEnabled = useShinoLabStore(state => state.videoPlaybackEnabled);
    const isVideoSong = usePlaybackStore(state => selectDisplaySong(state)?.isVideo === true);
    return videoPlaybackEnabled && isVideoSong;
};

/** bilibili 视频背景此刻在画面上：背景类型是「视频」，且这首歌的 MV 已经解析出来了。 */
export const useBilibiliMvActive = (): boolean => {
    const enabled = useShinoLabStore(state => state.bilibiliMvEnabled);
    const backgroundMode = useVisualizerSettingsStore(state => state.visualizerBackgroundMode);
    const ready = useBilibiliMvStore(state => state.resolution?.state === 'ready');
    return enabled && backgroundMode === 'video' && ready;
};

/** 画面正在接管屏幕（歌词样式可以让位）。 */
export const useVideoPlaybackActive = (): boolean => {
    const songVideo = useSongVideoActive();
    const mvBackground = useBilibiliMvActive();
    return songVideo || mvBackground;
};

/** 那条「视频播放时隐藏歌词样式」是不是该生效。 */
export const useHideLyricsDuringVideo = (): boolean => {
    const hideDuringVideo = useShinoLabStore(state => state.hideLyricStyleDuringVideo);
    const active = useVideoPlaybackActive();
    return hideDuringVideo && active;
};
