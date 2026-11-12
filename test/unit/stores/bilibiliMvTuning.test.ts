import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SongResult } from '@/types';

// test/unit/stores/bilibiliMvTuning.test.ts
// 匹配缓存里的音画调校：每首歌存「钉住的 BV + 偏移（秒）+ 偏移属于哪条 BV」，并且和旧版只存 BV、
// 或按毫秒存偏移的格式兼容。偏移是视频自己的属性，换了 BV 就不该再套用；偏移本身不设上下限。

const STORAGE_KEY = 'shino_lab_bilibili_mv_tuning';
const LEGACY_KEY = 'shino_lab_bilibili_bv_overrides';

// 改 BV 会立刻重新解析一次：这里把网络那一层换掉，测试只看缓存怎么写。
vi.mock('@/shinoinject/lab/bilibili/api', () => ({
    getAccount: vi.fn(async () => null),
    getVideoInfo: vi.fn(async (bvid: string) => ({ bvid, cid: 1, title: 'MV', author: 'uploader', durationSec: 200 })),
    getPlayStream: vi.fn(async () => ({ videoUrl: 'https://example.invalid/mv.mp4', durationSec: 200, quality: 720 })),
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

describe('bilibili mv tuning', () => {
    let values: Map<string, string>;

    beforeEach(() => {
        values = new Map();
        const storage = {
            getItem: (key: string) => values.get(key) ?? null,
            setItem: (key: string, value: string) => values.set(key, value),
            removeItem: (key: string) => values.delete(key),
        };
        vi.stubGlobal('localStorage', storage);
        vi.stubGlobal('window', { localStorage: storage });
        vi.resetModules();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.resetModules();
    });

    const stored = () => JSON.parse(values.get(STORAGE_KEY) ?? '{}') as Record<string, unknown>;

    it('migrates the old BV-only format into a tuning with no offset', async () => {
        values.set(LEGACY_KEY, JSON.stringify({ 'song|||artist': 'BV1xx411c7mD' }));
        const { useBilibiliMvStore } = await import('@/shinoinject/lab/useBilibiliMvStore');

        // 老格式里那条 BV 既是钉住的、也是（零）偏移所属的那条。
        expect(useBilibiliMvStore.getState().tunings['song|||artist']).toEqual({
            pinnedBvid: 'BV1xx411c7mD',
            offsetBvid: 'BV1xx411c7mD',
            offsetSec: 0,
        });
    });

    it('reads an offset stored in milliseconds as seconds', async () => {
        values.set(STORAGE_KEY, JSON.stringify({
            old: { pinnedBvid: 'BV1xx411c7mD', offsetBvid: 'BV1xx411c7mD', offsetMs: 250 },
        }));
        const { useBilibiliMvStore } = await import('@/shinoinject/lab/useBilibiliMvStore');

        expect(useBilibiliMvStore.getState().tunings.old.offsetSec).toBe(0.25);
    });

    it('takes any number of seconds and ignores entries it cannot use', async () => {
        values.set(STORAGE_KEY, JSON.stringify({
            good: { pinnedBvid: '', offsetBvid: '', offsetSec: 0.1236 },
            large: { pinnedBvid: '', offsetBvid: '', offsetSec: 95 },
            empty: { pinnedBvid: '', offsetBvid: '', offsetSec: 0 },
            junk: 42,
        }));
        const { useBilibiliMvStore } = await import('@/shinoinject/lab/useBilibiliMvStore');
        const tunings = useBilibiliMvStore.getState().tunings;

        expect(tunings.good.offsetSec).toBe(0.124);
        // 没有上下限：几十秒照样存。
        expect(tunings.large.offsetSec).toBe(95);
        expect(tunings.empty).toBeUndefined();
        expect(tunings.junk).toBeUndefined();
    });

    it('keeps the offset with the BV it was tuned against', async () => {
        const { useBilibiliMvStore, selectMvOffsetSec } = await import('@/shinoinject/lab/useBilibiliMvStore');
        const store = useBilibiliMvStore.getState();
        const target = song('Meridian', 'Hana');

        store.setOffsetSec(target, 0.25);
        const tuning = useBilibiliMvStore.getState().tunings['meridian|||hana'];
        expect(tuning.offsetSec).toBe(0.25);
        expect(stored()['meridian|||hana']).toEqual({ pinnedBvid: '', offsetBvid: '', offsetSec: 0.25 });

        // 还没有画面时不知道绑哪条 BV：先当作通用，解析出来之后按当前 BV 判断。
        const state = useBilibiliMvStore.getState();
        expect(selectMvOffsetSec(state, 'meridian|||hana', 'BV1xx411c7mD')).toBe(0.25);
        expect(selectMvOffsetSec(state, 'meridian|||hana', null)).toBe(0.25);
        expect(selectMvOffsetSec(state, 'other|||song', 'BV1xx411c7mD')).toBe(0);
    });

    it('does not let one BV’s offset leak onto another', async () => {
        const { useBilibiliMvStore, selectMvOffsetSec } = await import('@/shinoinject/lab/useBilibiliMvStore');
        const key = 'meridian|||hana';

        useBilibiliMvStore.setState({
            tunings: { [key]: { pinnedBvid: '', offsetBvid: 'BV1xx411c7mD', offsetSec: 12 } },
        });

        expect(selectMvOffsetSec(useBilibiliMvStore.getState(), key, 'BV1xx411c7mD')).toBe(12);
        expect(selectMvOffsetSec(useBilibiliMvStore.getState(), key, 'BV1yy411c7mE')).toBe(0);
    });

    it('drops the offset when a new BV is pinned, and keeps it when the pin is cleared', async () => {
        const { useBilibiliMvStore } = await import('@/shinoinject/lab/useBilibiliMvStore');
        const target = song('Meridian', 'Hana');
        const key = 'meridian|||hana';

        useBilibiliMvStore.setState({
            tunings: { [key]: { pinnedBvid: 'BV1xx411c7mD', offsetBvid: 'BV1xx411c7mD', offsetSec: 0.3 } },
        });

        // 换成另一条视频：上一支的偏移不再适用。
        useBilibiliMvStore.getState().setManualBv(target, 'BV1yy411c7mE');
        expect(useBilibiliMvStore.getState().tunings[key]).toEqual({
            pinnedBvid: 'BV1yy411c7mE',
            offsetBvid: '',
            offsetSec: 0,
        });

        // 清掉手写 BV 回到自动匹配：画面没变，偏移留着。
        useBilibiliMvStore.setState({
            tunings: { [key]: { pinnedBvid: 'BV1yy411c7mE', offsetBvid: 'BV1yy411c7mE', offsetSec: 0.3 } },
        });
        useBilibiliMvStore.getState().clearManualBv(target);
        expect(useBilibiliMvStore.getState().tunings[key]).toEqual({
            pinnedBvid: '',
            offsetBvid: 'BV1yy411c7mE',
            offsetSec: 0.3,
        });
    });

    it('forgets the entry once both the pin and the offset are gone', async () => {
        const { useBilibiliMvStore } = await import('@/shinoinject/lab/useBilibiliMvStore');
        const target = song('Meridian', 'Hana');
        const key = 'meridian|||hana';

        useBilibiliMvStore.getState().setOffsetSec(target, 0.12);
        useBilibiliMvStore.getState().setOffsetSec(target, 0);

        expect(useBilibiliMvStore.getState().tunings[key]).toBeUndefined();
        expect(stored()[key]).toBeUndefined();
    });
});
