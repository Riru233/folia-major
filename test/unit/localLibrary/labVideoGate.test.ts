import { afterEach, describe, expect, it, vi } from 'vitest';
import { isLabVideoPlaybackEnabled, LAB_VIDEO_PLAYBACK_KEY } from '../../../src/shinoinject/lab/labVideoGate';

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
