import { KARAOKE_INFO_AI_LINE_LIMIT } from '../stores/useKaraokeInfoOverrideStore';

// src/services/karaokeCreditsAi.ts
// 「这首歌开头哪几行是歌曲信息」的模型入口。
//
// 和分词一样，窗口自己不往服务商发请求：桌面走 IPC（用设置里配好的模型和密钥），网页走部署
// 自己的 /api/detect-credits（密钥在服务端）。两条路问的是同一份提示词，见
// shared/karaokeCreditsPrompt.*。

const DETECT_CREDITS_ROUTE = '/api/detect-credits';

export interface DetectedKaraokeCredits {
    /** 开头属于歌曲信息的行下标（0 起算，已排序去重）。 */
    hiddenIndexes: number[];
    /** 歌名 / 作词 / 作曲；认不出来的是空字符串。 */
    title: string;
    lyricist: string;
    composer: string;
}

type CreditsBridge = {
    detectKaraokeCredits?: (lines: string[]) => Promise<unknown>;
};

const getBridge = (): CreditsBridge | null => {
    if (typeof window === 'undefined') {
        return null;
    }
    const bridge = (window as unknown as { electron?: CreditsBridge }).electron;
    return bridge && typeof bridge.detectKaraokeCredits === 'function' ? bridge : null;
};

/** 这个构建里能不能问模型：桌面有桥，网页有 fetch。 */
export const isKaraokeCreditsAiAvailable = (): boolean => (
    typeof window !== 'undefined' && (Boolean(getBridge()) || typeof fetch === 'function')
);

const readTextField = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

/** 两个运行时都会把索引规整好，这里再兜一次：越界的东西绝不能拿去隐藏歌词。 */
const normalize = (payload: unknown, lineCount: number): DetectedKaraokeCredits => {
    const raw = (payload ?? {}) as Record<string, unknown>;
    const indexes = Array.isArray(raw.hiddenIndexes) ? raw.hiddenIndexes : [];
    const seen = new Set<number>();
    for (const entry of indexes) {
        const value = Number(entry);
        if (Number.isInteger(value) && value >= 0 && value < lineCount) {
            seen.add(value);
        }
    }

    return {
        hiddenIndexes: [...seen].sort((left, right) => left - right).slice(0, KARAOKE_INFO_AI_LINE_LIMIT),
        title: readTextField(raw.title),
        lyricist: readTextField(raw.lyricist),
        composer: readTextField(raw.composer),
    };
};

/**
 * 把歌词开头交给模型看一眼。只发前 `KARAOKE_INFO_AI_LINE_LIMIT` 行：再多就不是「开头的信息」了，
 * 而且那几行本来就只是歌名和署名。
 */
export const detectKaraokeCreditsWithAi = async (lines: string[]): Promise<DetectedKaraokeCredits> => {
    const sample = lines.slice(0, KARAOKE_INFO_AI_LINE_LIMIT).map(line => line ?? '');
    if (sample.every(line => !line.trim())) {
        throw new Error('No lyric lines to read');
    }

    const bridge = getBridge();
    if (bridge?.detectKaraokeCredits) {
        return normalize(await bridge.detectKaraokeCredits(sample), sample.length);
    }

    const response = await fetch(DETECT_CREDITS_ROUTE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lines: sample }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error((payload as { error?: string }).error || 'Failed to read song credits');
    }

    return normalize(payload, sample.length);
};
