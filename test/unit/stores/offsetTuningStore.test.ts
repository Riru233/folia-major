import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SongResult } from '@/types';

// test/unit/stores/offsetTuningStore.test.ts
// 「在画面中调整」：打开时记下基线，调节时立刻写进匹配缓存（画面当场跟着动），
// 返回把基线放回去，确定只是收掉悬浮窗。

const song = (name: string, artist: string): SongResult => ({
    id: `${name}-${artist}`,
    name,
    artists: [{ id: 'a', name: artist }],
    album: { id: 'al', name: 'Album' },
    durationMs: 240000,
    source: 'local',
} as SongResult);

describe('offset tuning overlay', () => {
    beforeEach(() => {
        const storage = {
            getItem: () => null,
            setItem: () => { },
            removeItem: () => { },
        };
        vi.stubGlobal('localStorage', storage);
        vi.stubGlobal('window', { localStorage: storage });
        vi.resetModules();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.resetModules();
    });

    it('starts from the offset the song already has', async () => {
        const { useBilibiliMvStore } = await import('@/shinoinject/lab/useBilibiliMvStore');
        const { useOffsetTuningStore } = await import('@/shinoinject/lab/videoBackground/useOffsetTuningStore');
        const target = song('Meridian', 'Hana');

        useBilibiliMvStore.getState().setOffsetSec(target, 0.4);
        useOffsetTuningStore.getState().begin(target);

        const state = useOffsetTuningStore.getState();
        expect(state.isOpen).toBe(true);
        expect(state.draftSec).toBe(0.4);
        expect(state.baselineSec).toBe(0.4);
    });

    it('applies each step at once, so the picture moves while tuning', async () => {
        const { useBilibiliMvStore } = await import('@/shinoinject/lab/useBilibiliMvStore');
        const { useOffsetTuningStore } = await import('@/shinoinject/lab/videoBackground/useOffsetTuningStore');
        const target = song('Meridian', 'Hana');

        useOffsetTuningStore.getState().begin(target);
        useOffsetTuningStore.getState().setDraft(1.25);

        expect(useOffsetTuningStore.getState().draftSec).toBe(1.25);
        expect(useBilibiliMvStore.getState().tunings['meridian|||hana'].offsetSec).toBe(1.25);
    });

    it('puts the baseline back on 返回 and keeps the value on 确定', async () => {
        const { useBilibiliMvStore } = await import('@/shinoinject/lab/useBilibiliMvStore');
        const { useOffsetTuningStore } = await import('@/shinoinject/lab/videoBackground/useOffsetTuningStore');
        const target = song('Meridian', 'Hana');
        const key = 'meridian|||hana';

        // 返回：回到打开前的值（这里本来是 0，所以整条调校也一起消失）。
        useOffsetTuningStore.getState().begin(target);
        useOffsetTuningStore.getState().setDraft(2);
        useOffsetTuningStore.getState().cancel();
        expect(useBilibiliMvStore.getState().tunings[key]).toBeUndefined();
        expect(useOffsetTuningStore.getState().isOpen).toBe(false);

        // 确定：值留在缓存里，只是把悬浮窗收掉。
        useOffsetTuningStore.getState().begin(target);
        useOffsetTuningStore.getState().setDraft(-0.75);
        useOffsetTuningStore.getState().confirm();
        expect(useBilibiliMvStore.getState().tunings[key].offsetSec).toBe(-0.75);
        expect(useOffsetTuningStore.getState().isOpen).toBe(false);
        expect(useOffsetTuningStore.getState().song).toBeNull();
    });

    it('does nothing without a song', async () => {
        const { useOffsetTuningStore } = await import('@/shinoinject/lab/videoBackground/useOffsetTuningStore');

        useOffsetTuningStore.getState().begin(null);
        expect(useOffsetTuningStore.getState().isOpen).toBe(false);
    });
});
