// shared/karaokeCreditsPrompt.mjs
// 卡拉OK「开头哪几行是歌曲信息」的提示词与回答解析，服务端（Vercel / Worker）和 Electron 主进程
// 共用这一份，两边问出来的东西必须一模一样。
//
// 本地那套规则（components/visualizer/karaoke/karaokeCredits.ts）只认「作词：」「作曲：」这类写法；
// 歌词源把署名合成一行、换成英文、或者干脆不写的时候只能靠模型读一遍。

/** 一次最多给模型看几行。前奏里塞二十行署名的歌轮不到歌词，多给只是浪费 token。 */
export const KARAOKE_CREDITS_MAX_LINES = 10;

export const KARAOKE_CREDITS_SCHEMA_NAME = 'lyric_song_credits';

/** 回答只有几行字：1000 足够，留出的是给仍然会思考的模型的余地。 */
export const KARAOKE_CREDITS_MAX_OUTPUT_TOKENS = 1024;

// 未知的字段一律给空字符串而不是 null：`type: ['string','null']` 这种联合类型有一半的
// OpenAI 兼容服务不认，空串是各家的最大公约数。
export const KARAOKE_CREDITS_JSON_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    properties: {
        hiddenLines: {
            type: 'array',
            items: { type: 'integer' },
            description: '1-based line numbers of the leading song-info lines; empty when there are none.',
        },
        title: { type: 'string', description: 'Song title, empty when unknown.' },
        lyricist: { type: 'string', description: 'Lyricist, empty when unknown.' },
        composer: { type: 'string', description: 'Composer, empty when unknown.' },
    },
    required: ['hiddenLines', 'title', 'lyricist', 'composer'],
};

// Gemini 的 schema 方言：类型名大写、没有 additionalProperties。
export const KARAOKE_CREDITS_GEMINI_SCHEMA = {
    type: 'OBJECT',
    properties: {
        hiddenLines: {
            type: 'ARRAY',
            description: '1-based line numbers of the leading song-info lines; empty when there are none.',
            items: { type: 'INTEGER' },
        },
        title: { type: 'STRING', description: 'Song title, empty when unknown.' },
        lyricist: { type: 'STRING', description: 'Lyricist, empty when unknown.' },
        composer: { type: 'STRING', description: 'Composer, empty when unknown.' },
    },
    required: ['hiddenLines', 'title', 'lyricist', 'composer'],
};

// 读几行字不需要推理：和分词一样把思考关掉，否则模型会把预算全花在想上。
export const KARAOKE_CREDITS_GEMINI_GENERATION_CONFIG = {
    responseMimeType: 'application/json',
    responseSchema: KARAOKE_CREDITS_GEMINI_SCHEMA,
    maxOutputTokens: KARAOKE_CREDITS_MAX_OUTPUT_TOKENS,
    thinkingConfig: { thinkingBudget: 0 },
};

const SYSTEM_PROMPT = `你在整理一份歌词文件的开头。用户会给你某首歌歌词的前若干行，每行前面带行号。

歌词文件开头常把歌名、作词者、作曲者、编曲者、出品方、语言标记等写成几行文字。它们属于歌曲信息，不是要唱出来的歌词。

请判断并返回：
1. hiddenLines：从第 1 行开始、连成一段的歌曲信息行号（1 起算，照输入原样数）。空行只要夹在这段里也算。
   只统计开头这一段；一旦出现真正的歌词正文，它和它后面的行一律不要。
   开头没有任何信息行时返回空数组。
2. title：歌名。输入里看不出来就返回空字符串。
3. lyricist：作词者。4. composer：作曲者。只填人名，不要带「作词：」这类标签；没有就返回空字符串。
   - 中文要认「作词」「填词」「词」「作曲」「曲」等写法。
   - 英文要认 "Lyrics by"、"Words by"、"Written by"、"Music by"、"Composed by"、"Music & Lyrics:" 等写法。
   - 如果开头只有「歌名 - 歌手」这样一行、没有单独写词曲，就把歌手同时填进 lyricist 和 composer。
   - 纯音乐（只有曲名，没有要唱的歌词）时 lyricist 和 composer 都返回空字符串。
只按给定的 JSON 结构回答，不要解释。`;

export const buildKaraokeCreditsSystemPrompt = () => SYSTEM_PROMPT;

export const buildKaraokeCreditsSourcePrompt = (lines) => (
    `这首歌歌词文件的开头 ${lines.length} 行：\n${lines.map((line, index) => `${index + 1}. ${line}`).join('\n')}`
);

/** 回答最多只该有开头一段，多出来的是模型把正文也划了进去。 */
const MAX_HIDDEN_LINES = KARAOKE_CREDITS_MAX_LINES + 2;

const readText = (value) => (typeof value === 'string' ? value.trim() : '');

/**
 * 把模型的回答对回歌词行。行号是 1 起算；越界、重复、非整数的一律丢掉。
 * 返回的 hiddenIndexes 是 0 起算的下标，已排序去重。
 */
export const parseKaraokeCreditsResponse = (raw, lines) => {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!parsed || typeof parsed !== 'object') {
        throw new Error('Model did not return a credits object');
    }

    const source = Array.isArray(parsed.hiddenLines) ? parsed.hiddenLines : [];
    const seen = new Set();
    for (const entry of source) {
        const value = Number(entry);
        if (!Number.isInteger(value) || value < 1 || value > lines.length) {
            continue;
        }
        seen.add(value - 1);
    }

    const hiddenIndexes = [...seen].sort((left, right) => left - right).slice(0, MAX_HIDDEN_LINES);

    return {
        hiddenIndexes,
        title: readText(parsed.title),
        lyricist: readText(parsed.lyricist),
        composer: readText(parsed.composer),
    };
};
