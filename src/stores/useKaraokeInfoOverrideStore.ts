import { create } from 'zustand';

// src/stores/useKaraokeInfoOverrideStore.ts
// 卡拉OK 开头的「歌曲信息」行，按歌记住用户/模型给出的答案。
//
// 自动识别靠的是歌词开头的署名规则（utils/lyrics/staffCredits），可那套规则只认「作词：」「作曲：」
// 这类写法。歌词源把署名写成一行、写成英文、或者干脆不写的时候，识别不出来——于是一整块
// 歌曲信息被当成歌词唱了出来。这里存这首歌自己的答案：开头哪几行算信息，以及标题/作词/作曲。
//
// 两条来路：用户在设置里手动勾，或者让模型看一眼歌词开头（services/karaokeCreditsAi）。两者存的
// 是同一份东西，所以模型认完之后用户还能改，改完就不再问模型。
//
// 按播放键存（getPlaybackSongKey），和分词记录一样，不同平台的同 id 不会串。放在 localStorage
// 的一张表里：条目很小，而且渲染端要在同步路径上读它，不该等一次 IndexedDB 往返。

export const KARAOKE_INFO_OVERRIDE_STORAGE_KEY = 'karaoke_info_v1';

/** 面板里最多列几行候选：再多就不是「开头的信息」了。 */
export const KARAOKE_INFO_CANDIDATE_LIMIT = 6;

/** 模型一次最多看多少行。前奏里塞二十行署名的歌也轮不到歌词，多给几行只是浪费 token。 */
export const KARAOKE_INFO_AI_LINE_LIMIT = 10;

export interface KaraokeInfoOverride {
    /** 开头被标成信息的行下标（对当前的歌词数组）。 */
    hiddenIndexes: number[];
    /** 标题区显示的歌名；没给就用歌曲元数据。 */
    title?: string | null;
    /** 直接给出的两行（`作词：…` / `作曲：…`），已经带好标签。没给就按勾中的原文显示。 */
    rows?: string[] | null;
    /** 这份答案是怎么来的：手动勾的，还是模型认的。 */
    source?: 'manual' | 'ai';
}

const normalizeIndexes = (value: unknown): number[] => {
    if (!Array.isArray(value)) {
        return [];
    }

    const seen = new Set<number>();
    for (const item of value) {
        if (typeof item === 'number' && Number.isInteger(item) && item >= 0) {
            seen.add(item);
        }
    }

    return [...seen].sort((left, right) => left - right);
};

const normalizeText = (value: unknown): string | null => (
    typeof value === 'string' && value.trim() ? value.trim() : null
);

export const normalizeKaraokeInfoOverride = (value: unknown): KaraokeInfoOverride | null => {
    if (!value || typeof value !== 'object') {
        return null;
    }

    const raw = value as Record<string, unknown>;
    const rows = Array.isArray(raw.rows)
        ? raw.rows.map(normalizeText).filter((row): row is string => row !== null)
        : null;

    return {
        hiddenIndexes: normalizeIndexes(raw.hiddenIndexes),
        title: normalizeText(raw.title),
        rows: rows && rows.length > 0 ? rows : null,
        source: raw.source === 'ai' ? 'ai' : 'manual',
    };
};

const readStored = (): Record<string, KaraokeInfoOverride> => {
    if (typeof window === 'undefined') {
        return {};
    }

    try {
        const parsed = JSON.parse(localStorage.getItem(KARAOKE_INFO_OVERRIDE_STORAGE_KEY) || 'null');
        if (!parsed || typeof parsed !== 'object') {
            return {};
        }

        const out: Record<string, KaraokeInfoOverride> = {};
        for (const [songKey, value] of Object.entries(parsed as Record<string, unknown>)) {
            const record = normalizeKaraokeInfoOverride(value);
            // 空清单也是有效答案（「这首歌开头没有信息行」），不能当成没存过。
            if (record) {
                out[songKey] = record;
            }
        }
        return out;
    } catch {
        return {};
    }
};

const writeStored = (bySong: Record<string, KaraokeInfoOverride>) => {
    if (typeof window === 'undefined') {
        return;
    }

    try {
        localStorage.setItem(KARAOKE_INFO_OVERRIDE_STORAGE_KEY, JSON.stringify(bySong));
    } catch {
        // 写不进去（隐私模式 / 配额）就只留在内存里，至少这一轮播放是对的。
    }
};

type KaraokeInfoOverrideState = {
    /** 歌曲键 → 这首歌开头的信息行。没有条目＝这首歌走自动识别。 */
    bySong: Record<string, KaraokeInfoOverride>;
    /** record 传 null 表示删掉这首手的答案，回到自动识别。 */
    setOverride: (songKey: string, record: KaraokeInfoOverride | null) => void;
};

export const useKaraokeInfoOverrideStore = create<KaraokeInfoOverrideState>((set, get) => ({
    bySong: readStored(),
    setOverride: (songKey, record) => {
        const next = { ...get().bySong };
        if (record) {
            next[songKey] = record;
        } else {
            delete next[songKey];
        }
        writeStored(next);
        set({ bySong: next });
    },
}));

/** 同步读一个不需要订阅的调用方拿这首歌的答案。 */
export const getKaraokeInfoOverride = (songKey: string | null): KaraokeInfoOverride | null => (
    songKey ? useKaraokeInfoOverrideStore.getState().bySong[songKey] ?? null : null
);
