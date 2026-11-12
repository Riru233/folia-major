import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    getKaraokeLeadInSeconds,
    KARAOKE_LEAD_IN_STORAGE_KEY,
    normalizeKaraokeLeadInSeconds,
    useKaraokeLeadInStore,
} from '@/stores/useKaraokeLeadInStore';

// test/unit/visualizer/karaokeLeadInStore.test.ts
// 交叉时间按歌存：一首歌一个数，没存过的歌返回 null（调用方回落到设置里的全局值）。

// 单测跑在 node 环境里，没有 window：和 commandFrequency.test.ts 一样自己搭一个 localStorage。
const createStorage = (initial: Record<string, string> = {}) => {
    const values = new Map(Object.entries(initial));
    return {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => { values.set(key, value); },
    };
};

let storage = createStorage();
const stored = () => JSON.parse(storage.getItem(KARAOKE_LEAD_IN_STORAGE_KEY) || 'null');

describe('normalizeKaraokeLeadInSeconds', () => {
    it('takes any finite number from zero up', () => {
        expect(normalizeKaraokeLeadInSeconds(0)).toBe(0);
        expect(normalizeKaraokeLeadInSeconds(3.5)).toBe(3.5);
        // 不设上限：四十秒的前奏也照样收
        expect(normalizeKaraokeLeadInSeconds(40)).toBe(40);
    });

    it('drops what cannot be a length', () => {
        expect(normalizeKaraokeLeadInSeconds(-1)).toBeNull();
        expect(normalizeKaraokeLeadInSeconds(Number.NaN)).toBeNull();
        expect(normalizeKaraokeLeadInSeconds(Number.POSITIVE_INFINITY)).toBeNull();
        expect(normalizeKaraokeLeadInSeconds('3')).toBeNull();
        expect(normalizeKaraokeLeadInSeconds(null)).toBeNull();
    });
});

describe('useKaraokeLeadInStore', () => {
    beforeEach(() => {
        storage = createStorage();
        vi.stubGlobal('window', { localStorage: storage });
        useKaraokeLeadInStore.setState({ bySong: {} });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('keeps one value per song and writes it through', () => {
        useKaraokeLeadInStore.getState().setSeconds('netease:1', 4.5);
        useKaraokeLeadInStore.getState().setSeconds('netease:2', 12);

        expect(getKaraokeLeadInSeconds('netease:1')).toBe(4.5);
        expect(getKaraokeLeadInSeconds('netease:2')).toBe(12);
        expect(stored()).toEqual({ 'netease:1': 4.5, 'netease:2': 12 });
    });

    it('answers null for a song that never got one', () => {
        expect(getKaraokeLeadInSeconds('netease:9')).toBeNull();
        expect(getKaraokeLeadInSeconds(null)).toBeNull();
    });

    it('never stores a negative length', () => {
        useKaraokeLeadInStore.getState().setSeconds('netease:1', -3);
        expect(getKaraokeLeadInSeconds('netease:1')).toBe(0);
    });

    it('goes back to the global value when the value is cleared', () => {
        useKaraokeLeadInStore.getState().setSeconds('netease:1', 4.5);
        useKaraokeLeadInStore.getState().setSeconds('netease:1', null);

        expect(getKaraokeLeadInSeconds('netease:1')).toBeNull();
        expect(stored()).toEqual({});
    });
});
