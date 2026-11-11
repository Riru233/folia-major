import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    isLabVideoPlaybackEnabled,
    LAB_VIDEO_GATE_CHANGED_EVENT,
    LAB_VIDEO_PLAYBACK_KEY,
    notifyLabVideoGateChanged,
    withoutGatedVideoSongs,
} from '../../../src/shinoinject/lab/labVideoGate';

// 本地曲库导入走的是这个非 React 读取口；键名一旦与 store 漂移，用户已保存的开关就会失效。

const stubStorage = (values: Record<string, string>) => {
    vi.stubGlobal('window', {});
    vi.stubGlobal('localStorage', {
        getItem: (key: string) => values[key] ?? null,
        setItem: () => {},
    });
};

describe('isLabVideoPlaybackEnabled', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('锁住与 store 共用的 localStorage 键', () => {
        expect(LAB_VIDEO_PLAYBACK_KEY).toBe('shino_lab_video_playback');
    });

    it('从未设置过时默认打开', () => {
        stubStorage({});
        expect(isLabVideoPlaybackEnabled()).toBe(true);
    });

    it('关掉实验功能后返回 false', () => {
        stubStorage({ [LAB_VIDEO_PLAYBACK_KEY]: 'false' });
        expect(isLabVideoPlaybackEnabled()).toBe(false);
    });

    it('打开实验功能后返回 true', () => {
        stubStorage({ [LAB_VIDEO_PLAYBACK_KEY]: 'true' });
        expect(isLabVideoPlaybackEnabled()).toBe(true);
    });
});

// 曲库列表、队列与会话恢复都用它过滤：关掉实验时视频记录不出现，但记录本身留在库里。
describe('withoutGatedVideoSongs', () => {
    afterEach(() => vi.unstubAllGlobals());

    const songs = [
        { id: 'audio-unknown' },
        { id: 'video', mediaKind: 'video' as const },
        { id: 'audio', mediaKind: 'audio' as const },
    ];

    it('开关打开时全部留下，顺序不变', () => {
        stubStorage({ [LAB_VIDEO_PLAYBACK_KEY]: 'true' });
        expect(withoutGatedVideoSongs(songs).map(song => song.id)).toEqual(['audio-unknown', 'video', 'audio']);
    });

    it('开关关掉时只剔除视频记录', () => {
        stubStorage({ [LAB_VIDEO_PLAYBACK_KEY]: 'false' });
        expect(withoutGatedVideoSongs(songs).map(song => song.id)).toEqual(['audio-unknown', 'audio']);
    });

    it('从不改动传入的数组', () => {
        stubStorage({ [LAB_VIDEO_PLAYBACK_KEY]: 'false' });
        const passed = [...songs];
        withoutGatedVideoSongs(passed);
        expect(passed).toHaveLength(3);
    });
});

describe('notifyLabVideoGateChanged', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('派发一条独立的重读事件（不触碰会触发磁盘重扫的更新事件）', () => {
        const dispatchEvent = vi.fn();
        vi.stubGlobal('window', { dispatchEvent });
        vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {} });

        notifyLabVideoGateChanged();

        expect(dispatchEvent).toHaveBeenCalledTimes(1);
        expect((dispatchEvent.mock.calls[0][0] as Event).type).toBe(LAB_VIDEO_GATE_CHANGED_EVENT);
        expect(LAB_VIDEO_GATE_CHANGED_EVENT).not.toBe('folia-local-music-updated');
    });
});
