import type { Line, Word } from '../../../types';

// src/components/visualizer/karaoke/karaokeSegments.ts
// 卡拉OK 的「一个字块」：整句按显示文字切成块（汉字一字一块，拉丁词连同后面的空格一块），
// 每块带自己的起止时间，渲染时按时间算这一块填充了多少。句子里有逐字时间就用逐字时间，
// 没有或对不上显示文字就往整句里按时长均摊。

export interface KaraokeChunk {
    text: string;
    /** 在全句文本里的起始下标，只用来算时间。 */
    offset: number;
    /** 这一块开始填充的时刻。 */
    startTime: number;
    /** 这一块填满的时刻；块太短（或时间戳反了）时等于 startTime。 */
    endTime: number;
}

/** 汉字 / 假名 / 谚文各占一块；其余的连成一个词，空格跟着前一块。 */
const CJK_CHAR = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af\uf900-\ufaff]/;
const SPACE = /\s/;

/** 把整句切成显示块，块文本拼起来就是原句，位置不变。 */
export const splitKaraokeChunks = (text: string): { text: string; offset: number }[] => {
    const characters = Array.from(text);
    const chunks: { text: string; offset: number }[] = [];
    let word = '';
    let wordOffset = 0;

    const flushWord = () => {
        if (word) {
            chunks.push({ text: word, offset: wordOffset });
            word = '';
        }
    };

    characters.forEach((character, index) => {
        if (CJK_CHAR.test(character)) {
            flushWord();
            chunks.push({ text: character, offset: index });
            return;
        }
        if (SPACE.test(character)) {
            // 空格并进前一块（前一块可能是汉字或者刚收起的一个词），块数不因空格变多，填充也就不用管空格。
            flushWord();
            const previous = chunks[chunks.length - 1];
            if (previous) {
                previous.text += character;
                return;
            }
            chunks.push({ text: character, offset: index });
            return;
        }
        if (!word) {
            wordOffset = index;
        }
        word += character;
    });
    flushWord();
    return chunks;
};

/** 逐字时间在整句文本里占的那一段。 */
interface WordRange {
    offset: number;
    length: number;
    startTime: number;
    endTime: number;
}

/**
 * 把逐字时间对到整句文本上：按顺序在句子里找每个词（去掉首尾空白后的 text）。
 * 只要有一个词对不上就整份作废，退回按时长均摊——错的逐字时间比没有更难看。
 */
const resolveWordRanges = (text: string, words: readonly Word[] | undefined): WordRange[] => {
    if (!words || words.length === 0) {
        return [];
    }
    const ranges: WordRange[] = [];
    let cursor = 0;
    for (const word of words) {
        const needle = (word.text ?? '').trim();
        if (!needle) {
            continue;
        }
        const at = text.indexOf(needle, cursor);
        if (at < 0) {
            return [];
        }
        ranges.push({ offset: at, length: needle.length, startTime: word.startTime, endTime: word.endTime });
        cursor = at + needle.length;
    }
    return ranges;
};

const timeAtOffset = (offset: number, line: Line, ranges: readonly WordRange[]): number => {
    const range = ranges.find(candidate => offset >= candidate.offset && offset < candidate.offset + candidate.length);
    if (range) {
        const span = Math.max(1, range.length);
        return range.startTime + ((range.endTime - range.startTime) * (offset - range.offset)) / span;
    }
    // 词间空格或者没有逐字时间：整句按时长线性摊到字符上。
    const total = Math.max(1, Array.from(line.fullText ?? '').length);
    return line.startTime + ((line.endTime - line.startTime) * offset) / total;
};

/**
 * 一句歌词切成带时间的显示块。每块从自己的开始时刻填到下一块开始，整句平滑地扫过去；
 * 最后一块填到句尾。时间戳缺失、为负或者反了都夹成「立刻填满」，不会出现负的进度。
 */
export const buildKaraokeChunks = (line: Line | null | undefined): KaraokeChunk[] => {
    if (!line) {
        return [];
    }
    const text = line.fullText ?? '';
    if (!text) {
        return [];
    }
    const pieces = splitKaraokeChunks(text);
    const ranges = resolveWordRanges(text, line.words);
    const marks = pieces.map(piece => timeAtOffset(piece.offset, line, ranges));
    // 时间必须往前走：均摊或对齐出的小抖动会让后面的块先亮。
    for (let index = 1; index < marks.length; index++) {
        if (marks[index] < marks[index - 1]) {
            marks[index] = marks[index - 1];
        }
    }
    return pieces.map((piece, index) => {
        const startTime = marks[index];
        const next = index + 1 < marks.length ? marks[index + 1] : Math.max(line.endTime, startTime);
        return { text: piece.text, offset: piece.offset, startTime, endTime: Math.max(startTime, next) };
    });
};

/** 这一块在 `time` 时刻填了多少（0 到 1）。 */
export const chunkFillProgress = (chunk: KaraokeChunk, time: number): number => {
    // 时间戳缺失或反了（块没有长度）：到点就算唱完，否则这一块永远不亮。
    if (chunk.endTime <= chunk.startTime) {
        return time >= chunk.startTime ? 1 : 0;
    }
    if (time <= chunk.startTime) {
        return 0;
    }
    if (time >= chunk.endTime) {
        return 1;
    }
    return (time - chunk.startTime) / (chunk.endTime - chunk.startTime);
};
