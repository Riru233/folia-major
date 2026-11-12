import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import * as esm from '../../../shared/karaokeCreditsPrompt.mjs';

// test/unit/lyrics/karaokeCreditsPrompt.test.ts
// 这份提示词有两份拷贝：.mjs 给浏览器、Vercel 和 Worker，.cjs 给 Electron 主进程（它拿不到 .mjs）。
// 两份一旦漂移，桌面版和网页版问出来的东西就不一样了，所以下面这些断言是这文件的重点；
// 后半段钉住的是「模型回来的行号怎么对回歌词」——数错一行就会藏掉一句本该唱出来的歌词。

const cjs = createRequire(import.meta.url)('../../../shared/karaokeCreditsPrompt.cjs');

const LINES = ['Neon River - Probe', 'Lyrics by Ann Lee', 'Music by Bo Chen'];

describe('karaoke credits prompt parity', () => {
    it('produces an identical system prompt in both module formats', () => {
        expect(cjs.buildKaraokeCreditsSystemPrompt()).toBe(esm.buildKaraokeCreditsSystemPrompt());
    });

    it('produces an identical source prompt in both module formats', () => {
        expect(cjs.buildKaraokeCreditsSourcePrompt(LINES)).toBe(esm.buildKaraokeCreditsSourcePrompt(LINES));
    });

    it('shares one schema and name', () => {
        expect(cjs.KARAOKE_CREDITS_JSON_SCHEMA).toEqual(esm.KARAOKE_CREDITS_JSON_SCHEMA);
        expect(cjs.KARAOKE_CREDITS_GEMINI_SCHEMA).toEqual(esm.KARAOKE_CREDITS_GEMINI_SCHEMA);
        expect(cjs.KARAOKE_CREDITS_SCHEMA_NAME).toBe(esm.KARAOKE_CREDITS_SCHEMA_NAME);
        expect(cjs.KARAOKE_CREDITS_MAX_OUTPUT_TOKENS).toBe(esm.KARAOKE_CREDITS_MAX_OUTPUT_TOKENS);
    });
});

describe('buildKaraokeCreditsSourcePrompt', () => {
    it('numbers every line so the answer can point at one', () => {
        const prompt = esm.buildKaraokeCreditsSourcePrompt(LINES);

        expect(prompt).toContain('开头 3 行');
        expect(prompt).toContain('1. Neon River - Probe');
        expect(prompt).toContain('3. Music by Bo Chen');
    });
});

describe('parseKaraokeCreditsResponse', () => {
    it('turns 1-based line numbers into 0-based indexes', () => {
        const credits = esm.parseKaraokeCreditsResponse(JSON.stringify({
            hiddenLines: [1, 2, 3],
            title: 'Neon River',
            lyricist: 'Ann Lee',
            composer: 'Bo Chen',
        }), LINES);

        expect(credits).toEqual({
            hiddenIndexes: [0, 1, 2],
            title: 'Neon River',
            lyricist: 'Ann Lee',
            composer: 'Bo Chen',
        });
    });

    it('drops out-of-range, duplicate and non-integer rows', () => {
        const credits = esm.parseKaraokeCreditsResponse({
            hiddenLines: [1, 1, 0, 9, 2.5, '2'],
            title: 'T',
        }, LINES);

        expect(credits.hiddenIndexes).toEqual([0, 1]);
    });

    it('reads missing fields as "not found" rather than null', () => {
        const credits = esm.parseKaraokeCreditsResponse({ hiddenLines: [] }, LINES);

        expect(credits).toEqual({ hiddenIndexes: [], title: '', lyricist: '', composer: '' });
    });

    it('refuses an answer that is not an object', () => {
        expect(() => esm.parseKaraokeCreditsResponse('null', LINES)).toThrow('credits object');
    });
});
