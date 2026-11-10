// src/shinoinject/lab/labVideoGate.ts
// 「视频播放」实验开关的非 React 读取口。本地曲库导入/扫描这类服务层逻辑只想知道开关当前
// 是开是关，不该为了一个布尔值去订阅 zustand store（那会把 i18n 与设置 store 一起拖进服务层）。
// localStorage 键与 useShinoLabStore 共用这一处常量，避免两边写成不同的名字。

import { getStoredBoolean } from '../../stores/storagePrimitives';

export const LAB_VIDEO_PLAYBACK_KEY = 'shino_lab_video_playback';

/** 与 store 的默认值一致：从没存过就是打开。 */
export const isLabVideoPlaybackEnabled = (): boolean => getStoredBoolean(LAB_VIDEO_PLAYBACK_KEY, true);
