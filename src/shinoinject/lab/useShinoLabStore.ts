import { create } from 'zustand';
import i18n from '../../i18n/config';
import { DEFAULT_VISUALIZER_BACKGROUND_MODE } from '../../types/visualizerModes';
import { getStoredBoolean, setStoredBoolean } from '../../stores/storagePrimitives';
import { setStatusMessage } from '../../stores/useStatusMessageStore';
import { useVisualizerSettingsStore } from '../../stores/useVisualizerSettingsStore';
import { isLabVideoPlaybackEnabled, LAB_VIDEO_PLAYBACK_KEY, notifyLabVideoGateChanged } from './labVideoGate';

// src/shinoinject/lab/useShinoLabStore.ts
// 「Shino 实验室」的两个实验：视频播放（曲目自带的画面、设置里那条视频层），以及把 bilibili 上
// 找到的 MV 画面当作背景。两个都各有一个总开关，关掉时它们带来的设置、背景类型和入口都不出现
// ——实验室里开着的东西不该在别处留下半个开关。
//
// 实验性背景的开关还负责一件事：关掉时如果正停在「视频」背景上，就退回默认背景，不然界面会
// 停在一个已经不可选的背景上。登录状态不在这里，它在 useBilibiliMvStore 里，一次登录全局共享。

const LAB_HIDE_LYRICS_ON_VIDEO_KEY = 'shino_lab_hide_lyrics_on_video';
const LAB_BILIBILI_MV_KEY = 'shino_lab_bilibili_mv';
const LAB_BILIBILI_AUTO_MATCH_KEY = 'shino_lab_bilibili_auto_match';

/** 视频背景的画质上限；实际拿到哪一档还要看登录状态和视频本身。 */
export type BilibiliMvQuality = 32 | 64 | 80;

const readStoredQuality = (): BilibiliMvQuality => {
    if (typeof window === 'undefined') return 64;
    const parsed = Number(localStorage.getItem('shino_lab_bilibili_quality'));
    return parsed === 32 || parsed === 64 || parsed === 80 ? parsed : 64;
};

export type ShinoLabState = {
    /** 视频播放：曲目自带的 MV 与设置里那条装饰视频层的总开关。 */
    videoPlaybackEnabled: boolean;
    /** 视频在放的时候不要歌词样式，让画面自己说话。 */
    hideLyricStyleDuringVideo: boolean;
    /** 实验性背景：视频 —— 背景类型里多出一个「视频」，从 bilibili 找这首歌的 MV 画面。 */
    bilibiliMvEnabled: boolean;
    /** 换歌时自动按歌名歌手去 bilibili 找 MV；关掉后只用手写的 BV。 */
    bilibiliAutoMatch: boolean;
    bilibiliMvQuality: BilibiliMvQuality;
    handleToggleVideoPlayback: (enabled: boolean) => void;
    handleToggleHideLyricStyleDuringVideo: (enabled: boolean) => void;
    handleToggleBilibiliMv: (enabled: boolean) => void;
    handleToggleBilibiliAutoMatch: (enabled: boolean) => void;
    handleSetBilibiliMvQuality: (quality: BilibiliMvQuality) => void;
};

export const useShinoLabStore = create<ShinoLabState>((set, get) => ({
    videoPlaybackEnabled: isLabVideoPlaybackEnabled(),
    hideLyricStyleDuringVideo: getStoredBoolean(LAB_HIDE_LYRICS_ON_VIDEO_KEY, false),
    bilibiliMvEnabled: getStoredBoolean(LAB_BILIBILI_MV_KEY, false),
    bilibiliAutoMatch: getStoredBoolean(LAB_BILIBILI_AUTO_MATCH_KEY, true),
    bilibiliMvQuality: readStoredQuality(),
    handleToggleVideoPlayback: (enabled) => {
        setStoredBoolean(LAB_VIDEO_PLAYBACK_KEY, enabled);
        set({ videoPlaybackEnabled: enabled });
        // 曲库列表按新状态重读：关掉后视频记录不再显示（记录还在），打开后立刻回到列表。
        notifyLabVideoGateChanged();
        // 视频播放关掉后，bilibili 视频背景也失效（它以视频播放为前置）：停在「视频」上的界面会停在一个
        // 选不了也画不出的背景，退回默认背景。
        if (!enabled) {
            const visualizer = useVisualizerSettingsStore.getState();
            if (visualizer.visualizerBackgroundMode === 'video') {
                visualizer.handleSetVisualizerBackgroundMode(DEFAULT_VISUALIZER_BACKGROUND_MODE);
            }
        }
        setStatusMessage({
            type: 'info',
            text: i18n.t(enabled ? 'notifications.shinoLabVideoOn' : 'notifications.shinoLabVideoOff'),
        });
    },
    handleToggleHideLyricStyleDuringVideo: (enabled) => {
        setStoredBoolean(LAB_HIDE_LYRICS_ON_VIDEO_KEY, enabled);
        set({ hideLyricStyleDuringVideo: enabled });
    },
    handleToggleBilibiliMv: (enabled) => {
        setStoredBoolean(LAB_BILIBILI_MV_KEY, enabled);
        set({ bilibiliMvEnabled: enabled });
        if (!enabled) {
            // 背景类型里已经没有「视频」了：停在它上面的界面会是一个选不了也画不出的背景。
            const visualizer = useVisualizerSettingsStore.getState();
            if (visualizer.visualizerBackgroundMode === 'video') {
                visualizer.handleSetVisualizerBackgroundMode(DEFAULT_VISUALIZER_BACKGROUND_MODE);
            }
        }
        setStatusMessage({
            type: 'info',
            text: i18n.t(enabled ? 'notifications.shinoLabBilibiliOn' : 'notifications.shinoLabBilibiliOff'),
        });
    },
    handleToggleBilibiliAutoMatch: (enabled) => {
        setStoredBoolean(LAB_BILIBILI_AUTO_MATCH_KEY, enabled);
        set({ bilibiliAutoMatch: enabled });
    },
    handleSetBilibiliMvQuality: (quality) => {
        if (typeof window !== 'undefined') localStorage.setItem('shino_lab_bilibili_quality', String(quality));
        set({ bilibiliMvQuality: quality });
    },
}));

/** 视频背景能不能出现在背景选择器里：实验室里视频播放与 bilibili MV 两枚开关都打开时才行。 */
export const isBilibiliMvBackgroundAvailable = () => {
    const { bilibiliMvEnabled, videoPlaybackEnabled } = getLabSnapshot();
    return bilibiliMvEnabled && videoPlaybackEnabled;
};

const getLabSnapshot = () => useShinoLabStore.getState();

/** 曲目自带的画面是否应当接管屏幕（实验里的视频播放开着，且这首歌本来就是一条视频）。 */
export const useLabVideoPlaybackEnabled = () => useShinoLabStore(state => state.videoPlaybackEnabled);
