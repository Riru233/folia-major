import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { readJsonText, stripCodeFence } from '../../../shared/modelJson.mjs';

// test/unit/lyrics/modelJson.test.ts
// 从模型回答里取 JSON 的两个函数（.mjs 与 .cjs 各一份，两份行为必须一样）。
// 用户实际遇到的那条错误就在这里钉住：模型把答案包进 ```json 围栏，直接 JSON.parse 会报
// `Unexpected token '`', "```json { "... is not valid JSON`。

const cjs = createRequire(import.meta.url)('../../../shared/modelJson.cjs');

const ANSWER = '{"hiddenLines":[1,2],"title":"Neon River"}';
const FENCED = '```json\n' + ANSWER + '\n```';

describe('stripCodeFence', () => {
    it('takes the fence off, language tag or not', () => {
        expect(stripCodeFence(FENCED)).toBe(ANSWER);
        expect(stripCodeFence('```\n' + ANSWER + '\n```')).toBe(ANSWER);
    });

    it('also handles a language tag glued to the first brace', () => {
        expect(stripCodeFence('```json ' + ANSWER + '\n```')).toBe(ANSWER);
    });

    it('leaves plain text alone', () => {
        expect(stripCodeFence('  ' + ANSWER + '  ')).toBe(ANSWER);
        expect(stripCodeFence(null)).toBe('');
    });
});

describe('readJsonText', () => {
    it('parses a bare object and a fenced one', () => {
        expect(readJsonText(ANSWER)).toEqual(JSON.parse(ANSWER));
        expect(readJsonText(FENCED)).toEqual(JSON.parse(ANSWER));
    });

    it('ignores one sentence of commentary around the object', () => {
        expect(readJsonText('Here is the answer:\n' + ANSWER + '\nHope it helps.')).toEqual(JSON.parse(ANSWER));
    });

    it('parses an array answer as readily as an object', () => {
        expect(readJsonText('```json\n[["a","b"]]\n```')).toEqual([['a', 'b']]);
    });

    it('answers null for anything that is not JSON', () => {
        expect(readJsonText('I could not read this lyric file.')).toBeNull();
        expect(readJsonText('')).toBeNull();
        expect(readJsonText(undefined)).toBeNull();
    });

    it('behaves identically in the CommonJS copy the main process loads', () => {
        for (const raw of [ANSWER, FENCED, 'Here: ' + ANSWER, 'no json here', '', null]) {
            expect(cjs.readJsonText(raw)).toEqual(readJsonText(raw));
            expect(cjs.stripCodeFence(raw)).toBe(stripCodeFence(raw));
        }
    });
});
