import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SongResult } from '@/types';

const getVideoInfo = vi.fn(async (bvid: string) => ({ bvid, cid: 1, title: `MV ${bvid}`, author: 'uploader', durationSec: 200 }));
const getPlayStream = vi.fn(async (bvid: string) => ({ videoUrl: `https://example.invalid/${bvid}.mp4`, durationSec: 200, quality: 720 }));

vi.mock('@/shinoinject/lab/bilibili/api', () => ({
    getAccount: vi.fn(async () => null),
    getVideoInfo: (bvid: string) => getVideoInfo(bvid),
    getPlayStream: (bvid: string) => getPlayStream(bvid),
    searchVideos: vi.fn(async () => []),
}));

const song = (name: string, artist: string): SongResult => ({
    id: `${name}-${artist}`,
    name,
    artists: [{ id: 'a', name: artist }],
    album: { id: 'al', name: 'Album' },
    durationMs: 240000,
    source: 'local',
} as SongResult);

describe('manual bv', () => {
    beforeEach(() => {
        const values = new Map<string, string>();
        const storage = {
            getItem: (k: string) => values.get(k) ?? null,
            setItem: (k: string, v: string) => values.set(k, v),
            removeItem: (k: string) => values.delete(k),
        };
        vi.stubGlobal('localStorage', storage);
        vi.stubGlobal('window', { localStorage: storage });
        vi.resetModules();
    });
    afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

    it('re-resolves to the new bv', async () => {
        console.log('start');
        const { useBilibiliMvStore } = await import('@/shinoinject/lab/useBilibiliMvStore');
        const target = song('Meridian', 'Hana');
        await useBilibiliMvStore.getState().setManualBv(target, 'BV1xx411c7mD');
        console.log('after first', JSON.stringify(useBilibiliMvStore.getState().resolution));
        await useBilibiliMvStore.getState().setManualBv(target, 'BV1yy411c7mE');
        console.log('after second', JSON.stringify(useBilibiliMvStore.getState().resolution));
        expect(useBilibiliMvStore.getState().resolution?.stream?.bvid).toBe('BV1yy411c7mE');
    }, 30000);
});
