import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Line } from '@/types';
import {
    autoDetectedKaraokeInfoSongs,
    markAutoDetectAsked,
    resetAutoDetectedKaraokeInfo,
    shouldAutoDetectKaraokeInfo,
} from '@/components/visualizer/karaoke/useKaraokeInfoAutoDetect';
import { useKaraokeInfoOverrideStore } from '@/stores/useKaraokeInfoOverrideStore';

// test/unit/visualizer/karaokeInfoAutoDetect.test.ts
// 播放时自动问一次模型这件事，克制条件每一条都关系到花不花用户的额度：
// 不在播不问、本地认出来了不问、这首歌已经有答案不问、同一个歌这一轮问过就不再问。

const SONG_KEY = 'netease:1001';

const line = (fullText: string): Line => ({ words: [], startTime: 0, endTime: 1, fullText });

const LINES = [line('Neon River - Probe'), line('第一句歌词')];

const base = {
    songKey: SONG_KEY,
    lines: LINES,
    active: true,
    needsDetection: true,
};

/** 桌面里判断「能不能问模型」看的是 preload 桥；这里给一个最小的。 */
const withDesktopBridge = () => {
    Object.defineProperty(globalThis, 'window', {
        value: { electron: { detectKaraokeCredits: async () => ({ hiddenIndexes: [] }) } },
        configurable: true,
        writable: true,
    });
};

beforeEach(() => {
    resetAutoDetectedKaraokeInfo();
    useKaraokeInfoOverrideStore.getState().setOverride(SONG_KEY, null);
    withDesktopBridge();
});

afterEach(() => {
    useKaraokeInfoOverrideStore.getState().setOverride(SONG_KEY, null);
    resetAutoDetectedKaraokeInfo();
    Object.defineProperty(globalThis, 'window', { value: undefined, configurable: true, writable: true });
});

describe('shouldAutoDetectKaraokeInfo', () => {
    it('asks once for a playing song whose leading staff block the local rules missed', () => {
        expect(shouldAutoDetectKaraokeInfo(base)).toBe(true);
    });

    it('never asks before playback actually starts (preview mode and paused-at-zero)', () => {
        expect(shouldAutoDetectKaraokeInfo({ ...base, active: false })).toBe(false);
    });

    it('stays quiet when the local rules already found the song info', () => {
        expect(shouldAutoDetectKaraokeInfo({ ...base, needsDetection: false })).toBe(false);
    });

    it('does nothing for a preview with no playback key, or a song with no lyrics', () => {
        expect(shouldAutoDetectKaraokeInfo({ ...base, songKey: null })).toBe(false);
        expect(shouldAutoDetectKaraokeInfo({ ...base, lines: [] })).toBe(false);
    });

    it('leaves a song that already has an answer alone, whether manual or read earlier', () => {
        useKaraokeInfoOverrideStore.getState().setOverride(SONG_KEY, {
            hiddenIndexes: [0, 1],
            source: 'ai',
        });

        expect(shouldAutoDetectKaraokeInfo(base)).toBe(false);
    });

    it('does not ask the same song twice in one run', () => {
        markAutoDetectAsked(SONG_KEY);

        expect(shouldAutoDetectKaraokeInfo(base)).toBe(false);
        expect(autoDetectedKaraokeInfoSongs()).toEqual([SONG_KEY]);
    });
});
