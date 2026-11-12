import type { Line } from '../../../types';
import {
    createStaffCreditMatcher,
    detectLeadingStaffBlock,
    isFillerLine,
    type StaffCreditBlock,
} from '../../../utils/lyrics/staffCredits';

// src/components/visualizer/karaoke/karaokeCredits.ts
// 卡拉OK 唱歌前那段「歌名 / 作词 / 作曲」是信息，不是歌词：把它从时间轴里提出来单独居中显示，
// 等作曲那句唱完、真正的歌词要出来时再淡出。
//
// 识别直接复用歌词开头署名块的那套规则（内置词表 + 位置约束），这里只负责挑出作词、作曲两条，
// 以及算出淡出的时间窗——两边各写一套判断迟早会把「哪几行是署名」算出不同答案。

export interface KaraokeCredits {
    /** 歌名：优先用歌曲元数据，没有就退回开头那行「歌名 - 歌手」的前半段。 */
    title: string | null;
    /** 作词、作曲两行（原样保留“作词：某某”的写法）。 */
    rows: string[];
    /** 这些行已经从歌词里提走：两句一页的渲染要跳过它们。 */
    hiddenIndexes: number[];
    /** 淡出开始的时间（作曲那句唱完）；之后线性淡到 fadeEnd。 */
    fadeStart: number;
    fadeEnd: number;
}

export interface KaraokeCreditsOptions {
    /** 歌曲元数据里的歌名。 */
    title?: string | null;
    /** 纯音乐：不显示任何信息。 */
    instrumental?: boolean;
    /**
     * 用户（或模型）手动指定的「开头这几行是歌曲信息」。
     *
     * 传数组就用它，不再走自动识别——识别漏了的歌靠它补，认错了的歌也靠它改。
     * 空数组是一个有效答案（这首歌开头没有任何信息行），和 null / 不传不同。
     */
    hiddenIndexes?: number[] | null;
    /** 指定答案里已经排好版的两行（`作词：…` / `作曲：…`）。给了就不再按原文生成。 */
    rows?: string[] | null;
}

// 只认作词、作曲两类（含常见别名）。词表命中之后还要再过这一道，否则编曲、混音、出品
// 这些也会被当成标题区的一部分——那会是一大坨字糊在屏幕中间。
//
// 中文习惯「作词：张三」「作曲 张三」，英文歌词源则习惯「Lyrics by」「Music & Lyrics:」。
// 英文那一侧要求后面真的跟着分隔词（by / & / ：），否则一句以 Music 开头的歌词会被当成署名。
const CHINESE_LYRICIST = /^\s*[\[（(【]?\s*(?:作词|填词|词作者|词)\s*[\]）)】]?\s*(?:由|[:：\s])/;
const ENGLISH_LYRICIST = /^\s*(?:lyrics?|lyricist|words|written)\s*(?:&|and|\/|,|[:：]|by)\s+/i;
const CHINESE_COMPOSER = /^\s*[\[（(【]?\s*(?:作曲|曲作者|曲)\s*[\]）)】]?\s*(?:由|[:：\s])/;
const ENGLISH_COMPOSER = /^\s*(?:composed|composer|music|composition)\s*(?:&|and|\/|,|[:：]|by)\s+/i;

const oneOf = (value: string, patterns: RegExp[]) => patterns.some(pattern => pattern.test(value));

const CREDIT_PATTERNS = [CHINESE_LYRICIST, ENGLISH_LYRICIST, CHINESE_COMPOSER, ENGLISH_COMPOSER];

const isCreditRow = (text: string): boolean => oneOf(text, CREDIT_PATTERNS);

/** 兜底扫描最多看开头几行：再往后就不是「开头的信息」了。 */
const MAX_PATTERN_SCAN = 8;

/**
 * 内置署名词表要求后面跟冒号，英文的「Lyrics by X」「Music by Y」因此认不出来。
 *
 * 这里按开头那一段自己再收一遍：最多容忍一行「歌名 - 歌手」在前，之后连续的作词/作曲行算一块。
 * 少于两行就放弃——单行命中的多半是正文，和内置规则的取舍一致。
 */
const detectPatternCreditBlock = (lines: Line[]): StaffCreditBlock | null => {
    let cursor = 0;
    // 只跳过明确像标题的一行：正文首句恰好以「Lyrics」开头这种事不该被吞掉。
    if (/\s[-–—]\s/.test(lines[0]?.fullText?.trim() ?? '')) {
        cursor = 1;
    }

    const memberIndexes: number[] = [];
    const staffIndexes: number[] = [];
    while (cursor < lines.length && cursor < MAX_PATTERN_SCAN) {
        const text = lines[cursor]?.fullText?.trim() ?? '';
        if (text && !isCreditRow(text)) {
            break;
        }
        memberIndexes.push(cursor);
        if (text) {
            staffIndexes.push(cursor);
        }
        cursor += 1;
    }

    if (staffIndexes.length < 2 || cursor >= lines.length) {
        return null;
    }

    return {
        staffIndexes,
        memberIndexes,
        firstLyricIndex: cursor,
        headerLineCount: staffIndexes.length > 0 ? memberIndexes[0] : 0,
        absorbedIndexes: [],
    };
};

/** 淡出时长上限：作曲唱完到第一句歌词之间通常很短，拖太久会糊在歌词上。 */
const FADE_SECONDS = 0.8;

/** 整段标题区短到这个程度就不值得显示：还没来得及淡出就得淡完，只会闪一下。 */
const MIN_INTRO_SECONDS = 1.2;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

const headerTitle = (lines: Line[], headerIndexes: number[]): string => {
    for (const index of headerIndexes) {
        const text = lines[index]?.fullText?.trim() ?? '';
        const [beforeSeparator] = text.split(/\s[-–—]\s/);
        if (beforeSeparator?.trim()) {
            return beforeSeparator.trim();
        }
    }

    return '';
};

/**
 * 手动指定（或模型认出来）的一版信息行：歌名优先用元数据/指定值，剩下几行整段当「作词 / 作曲」
 * 那样列出来。淡出窗和自动识别一致——最后一行唱完开始淡，正文第一句出来之前淡干净。
 */
const creditsFromIndexes = (
    lines: Line[],
    hiddenIndexes: number[],
    metaTitle: string,
    providedRows: string[] | null,
): KaraokeCredits | null => {
    const indexes = [...new Set(hiddenIndexes)]
        .filter(index => Number.isInteger(index) && index >= 0 && index < lines.length)
        .sort((left, right) => left - right);

    // 空行可以勾，但没有字可显示：它照样从时间轴里拿掉，只是不进标题区。
    const texts = indexes
        .map(index => ({ index, text: lines[index]?.fullText?.trim() ?? '' }))
        .filter(entry => entry.text.length > 0);

    if (indexes.length === 0) {
        return null;
    }

    // 有现成的两行（作词/作曲是模型认出来的，原文里没有这两行）就直接用，不再从原文里挑。
    const givenRows = (providedRows ?? []).map(row => row.trim()).filter(Boolean);

    // 没有现成两行时：有元数据歌名就全进 h2；没有就把最靠前、不像「作词：」的那一行当歌名，
    // 否则歌名会既当标题又在下面列一遍。
    const titleRow = givenRows.length > 0 || metaTitle
        ? undefined
        : texts.find(entry => !isCreditRow(entry.text) && !isFillerLine(lines[entry.index]));

    const title = metaTitle || headerTitle(lines, titleRow ? [titleRow.index] : []);
    const rows = givenRows.length > 0
        ? givenRows
        : texts.filter(entry => entry.index !== titleRow?.index).map(entry => entry.text);

    const lastEnd = Math.max(0, ...indexes.map(index => lines[index]?.endTime ?? 0));
    const lastIndex = indexes[indexes.length - 1];
    let firstLyricStart = lastEnd + FADE_SECONDS;
    for (let index = lastIndex + 1; index < lines.length; index += 1) {
        if (!isFillerLine(lines[index]) && (lines[index]?.fullText?.trim() ?? '')) {
            firstLyricStart = lines[index].startTime;
            break;
        }
    }

    const fadeStart = lastEnd;
    const fadeEnd = Math.max(
        fadeStart + 0.15,
        Math.min(fadeStart + FADE_SECONDS, firstLyricStart + FADE_SECONDS * 0.6),
    );

    return {
        title: title || null,
        rows,
        hiddenIndexes: indexes,
        fadeStart,
        fadeEnd,
    };
};

/**
 * 从歌词行里提炼标题区。没有作词/作曲、或者前奏短到只够闪一下的，一律返回 null（照常直接放歌词）。
 */
export const resolveKaraokeCredits = (
    lines: Line[],
    options: KaraokeCreditsOptions = {}
): KaraokeCredits | null => {
    if (options.instrumental || lines.length === 0) {
        return null;
    }

    // 手动指定压过自动识别：用户（或模型）已经回答过「哪几行是信息」，就没必要再猜一遍。
    if (options.hiddenIndexes) {
        return creditsFromIndexes(
            lines,
            options.hiddenIndexes,
            options.title?.trim() || '',
            options.rows ?? null,
        );
    }

    const metaTitle = options.title?.trim() || '';
    // 内置词表认不出来（英文「Lyrics by …」没有冒号）时，按开头那一段自己再收一遍。
    const block = detectLeadingStaffBlock(lines, createStaffCreditMatcher(), {
        meta: { title: metaTitle || undefined },
    }) ?? detectPatternCreditBlock(lines);

    // 署名行可能在上游的「开头署名」策略里已经被整块拿掉了：这时只把歌名亮出来，
    // 否则同一个功能在一半的歌上都不出现，反而像坏了。
    if (!block) {
        return titleOnlyCredits(lines, metaTitle);
    }

    const rows = block.staffIndexes
        .map(index => lines[index]?.fullText?.trim() ?? '')
        .filter(isCreditRow);

    if (rows.length === 0) {
        return null;
    }

    // 块之前的非分隔行就是文件开头的「歌名 - 歌手」那一行：它也属于信息，不是歌词。
    const headerIndexes: number[] = [];
    for (let index = 0; index < block.memberIndexes[0]; index += 1) {
        if (!isFillerLine(lines[index])) {
            headerIndexes.push(index);
        }
    }

    const title = metaTitle || headerTitle(lines, headerIndexes);
    const hiddenIndexes = [...headerIndexes, ...block.memberIndexes].sort((a, b) => a - b);

    const lastCreditEnd = Math.max(...block.staffIndexes.map(index => lines[index]?.endTime ?? 0));
    const firstLyric = block.firstLyricIndex === null ? null : lines[block.firstLyricIndex];
    const firstLyricStart = firstLyric?.startTime ?? lastCreditEnd + FADE_SECONDS;

    // 作曲那句一唱完就开始淡，淡 0.8 秒左右——可以和第一句歌词的前半秒交叉着过，
    // 但不能留着陪唱，否则字会叠在歌词上。
    const fadeStart = lastCreditEnd;
    const fadeEnd = Math.max(
        fadeStart + 0.15,
        Math.min(fadeStart + FADE_SECONDS, firstLyricStart + FADE_SECONDS * 0.6),
    );

    if (fadeStart < MIN_INTRO_SECONDS) {
        return null;
    }

    return {
        title: title || null,
        rows,
        hiddenIndexes,
        fadeStart,
        fadeEnd,
    };
};

/** 开头最多容忍几行标题/空行：再多就说明这不是一个标题，是歌词本身。 */
const MAX_HEADER_SCAN = 3;

/**
 * 没有署名块时只显示歌名：前奏里亮一段，第一句歌词出来之前淡掉。
 * 这个分支只在歌曲自带歌名（或元数据）时有意义，否则没有内容可显示。
 */
const titleOnlyCredits = (lines: Line[], title: string): KaraokeCredits | null => {
    if (!title) {
        return null;
    }

    const hiddenIndexes: number[] = [];
    let cursor = 0;
    while (cursor < lines.length && hiddenIndexes.length < MAX_HEADER_SCAN) {
        const text = lines[cursor].fullText?.trim() ?? '';
        // 只认「空行 / 分隔符 / 歌名 - 歌手 / 与歌名完全一致」这几种，不去猜别的，
        // 否则第一句正好带歌名的副歌会被当成标题藏起来。
        const isHeader = isFillerLine(lines[cursor])
            || /\s[-–—]\s/.test(text)
            || text === title;
        if (!isHeader) {
            break;
        }
        hiddenIndexes.push(cursor);
        cursor += 1;
    }

    const firstLyric = lines[cursor];
    if (!firstLyric || firstLyric.startTime < MIN_INTRO_SECONDS) {
        return null;
    }

    return {
        title,
        rows: [],
        hiddenIndexes,
        fadeStart: Math.max(0, firstLyric.startTime - FADE_SECONDS),
        fadeEnd: firstLyric.startTime,
    };
};

/** 标题区在这一时刻的不透明度：唱到作曲那句末尾之前是 1，之后线性淡到 0。 */
export const karaokeCreditsOpacity = (credits: KaraokeCredits, time: number): number => {
    if (time <= credits.fadeStart) {
        return 1;
    }

    if (time >= credits.fadeEnd) {
        return 0;
    }

    return 1 - clamp01((time - credits.fadeStart) / (credits.fadeEnd - credits.fadeStart));
};
