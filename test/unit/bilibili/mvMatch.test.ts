import { describe, expect, it } from 'vitest';
import { buildSearchKeyword, extractBvid, normalizeForMatch, pickBestMvHit, songKeyOf } from '../../../src/shinoinject/lab/bilibili/mvMatch';
import type { BilibiliSearchHit } from '../../../src/types/bilibili';
import type { SongResult } from '../../../src/types';

// 自动匹配 MV 是这条实验链路里最容易「悄悄选错」的一步：选错一条不会报错，只会放一段不相干的
// 画面。所以「什么算同一首歌」和「什么时候宁可什么都不放」都钉在这里。

const hit = (overrides: Partial<BilibiliSearchHit>): BilibiliSearchHit => ({
    bvid: 'BV1xx411c7mD',
    title: '',
    author: '',
    durationSec: 0,
    coverUrl: '',
    playCount: 0,
    ...overrides,
});

const song = (name: string, artist: string): Pick<SongResult, 'name' | 'artists'> => ({
    name,
    artists: [{ id: artist, name: artist }],
});

describe('normalizeForMatch', () => {
    it('folds case, punctuation and bracketed tails away', () => {
        expect(normalizeForMatch('Hello, World! (Live)')).toBe(normalizeForMatch('hello world'));
        expect(normalizeForMatch('【MV】Hello World')).toBe(normalizeForMatch('Hello World'));
    });
});

describe('buildSearchKeyword', () => {
    it('drops a release flavour and keeps the artist', () => {
        expect(buildSearchKeyword(song('Some Song (Remastered 2011)', 'A Band')))
            .toBe('Some Song A Band');
    });

    it('survives a nameless artist', () => {
        expect(buildSearchKeyword({ name: 'Some Song', artists: [] })).toBe('Some Song');
    });
});

describe('songKeyOf', () => {
    it('is the same for the same title and main artist, whatever the punctuation', () => {
        expect(songKeyOf(song('Some Song', 'A Band'))).toBe(songKeyOf(song('some song!', 'a band')));
    });

    it('differs between artists', () => {
        expect(songKeyOf(song('Some Song', 'A Band'))).not.toBe(songKeyOf(song('Some Song', 'B Band')));
    });
});

describe('pickBestMvHit', () => {
    it('takes a title + artist hit', () => {
        const match = pickBestMvHit([hit({ title: 'Some Song 官方MV', author: 'A Band' })], song('Some Song', 'A Band'));
        expect(match?.hit.title).toBe('Some Song 官方MV');
    });

    it('prefers the hit whose length is the song\u2019s', () => {
        const match = pickBestMvHit(
            [
                hit({ bvid: 'BVshort', title: 'Some Song', author: 'A Band', durationSec: 30 }),
                hit({ bvid: 'BVright', title: 'Some Song', author: 'A Band', durationSec: 214 }),
            ],
            song('Some Song', 'A Band'),
            { durationSec: 215 },
        );
        expect(match?.hit.bvid).toBe('BVright');
    });

    it('refuses a hit by someone else', () => {
        expect(pickBestMvHit([hit({ title: 'Some Song', author: 'Another Band' })], song('Some Song', 'A Band'))).toBeNull();
    });

    it('refuses covers, dances and tutorials', () => {
        for (const title of ['Some Song 翻唱', 'Some Song 舞蹈版', 'Some Song 教学']) {
            expect(pickBestMvHit([hit({ title, author: 'A Band' })], song('Some Song', 'A Band')), title).toBeNull();
        }
    });

    it('refuses a hit that only shares a word', () => {
        expect(pickBestMvHit([hit({ title: 'Another Song', author: 'A Band' })], song('Some Song', 'A Band'))).toBeNull();
    });

    it('answers null for an empty search', () => {
        expect(pickBestMvHit([], song('Some Song', 'A Band'))).toBeNull();
    });
});

describe('extractBvid', () => {
    it('reads a BV out of a link or a bare id', () => {
        expect(extractBvid('https://www.bilibili.com/video/BV1xx411c7mD?p=1')).toBe('BV1xx411c7mD');
        expect(extractBvid(' BV1xx411c7mD ')).toBe('BV1xx411c7mD');
    });

    it('answers null when there is none', () => {
        expect(extractBvid('https://www.bilibili.com/video/av12345')).toBeNull();
        expect(extractBvid('')).toBeNull();
    });
});
