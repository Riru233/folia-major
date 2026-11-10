import type { SongResult } from '../../../types';
import type { BilibiliSearchHit } from '../../../types/bilibili';

// src/shinoinject/lab/bilibili/mvMatch.ts
// 从 bilibili 的搜索结果里挑一条「这首歌的 MV」。纯函数，好单测：不联网、不读 store。
//
// 规则很土但够用：标题里得有歌名，作者或标题里得有歌手；标题里带翻唱、舞蹈、教程这些词的
// 直接出局——它们是同一个歌名的别的东西。时长接近的排在前面，因为一首歌的 MV 通常就是这首歌
// 的长度。

/** 会把同一首歌在不同平台认成两首的差别（括号、大小写、标点）都抹掉。 */
export const normalizeForMatch = (text: string): string => text
    .toLowerCase()
    .replace(/\([^)]*\)|（[^）]*）|\[[^\]]*\]|【[^】]*】/g, '')
    .replace(/[\s\-_/\\.,'’"“”·:：!！?？&+~]/g, '');

/** 歌名里那些纯粹给发行版看的尾巴，搜索时留着只会把结果带偏。 */
const releaseFlavour = /\s*[([（【-]\s*(feat\.?|ft\.?|live|remaster(ed)?|remix|demo|acoustic|instrumental|ver\.?|version|edit|explicit|deluxe|bonus|动画版|完整版|现场版)[^)\]）】]*[)\]）】]?/gi;

export const buildSearchKeyword = (song: Pick<SongResult, 'name' | 'artists'>): string => {
    const title = song.name.replace(releaseFlavour, ' ').replace(/\s+/g, ' ').trim();
    const artists = song.artists.map(artist => artist.name).filter(Boolean);
    return [title || song.name, artists[0] ?? ''].filter(Boolean).join(' ').trim();
};

/** 一首歌的身份：标题 + 主艺人。改过 BV 的记录、解析缓存都用它当 key。 */
export const songKeyOf = (song: Pick<SongResult, 'name' | 'artists'>): string => (
    `${normalizeForMatch(song.name)}|||${normalizeForMatch(song.artists[0]?.name ?? '')}`
);

const NOT_THE_MV = [
    '翻唱', 'cover', '钢琴', 'piano', '吉他', 'guitar', '教学', '教程', 'tutorial', '舞蹈', 'dance',
    '纯音乐', 'instrumental', '伴奏', 'karaoke', 'ktv', 'reaction', '混剪', '合集', 'playlist',
    'dj', 'remix', '歌单', '音源', '无损', '动态歌词', 'lyrics video', '8d',
];

const hitExcluded = (title: string): boolean => {
    const lower = title.toLowerCase();
    return NOT_THE_MV.some(word => lower.includes(word));
};

export interface MvMatchOptions {
    /** 歌曲时长（秒）：用来在同名结果里偏向长度对得上的那条。 */
    durationSec?: number;
}

export interface MvMatch {
    hit: BilibiliSearchHit;
    score: number;
}

/**
 * 挑一条最像「这首歌的官方 MV」的结果；没有一条够格时返回 null（宁可显示原背景，也不放一条
 * 完全不相干的视频）。
 */
export const pickBestMvHit = (hits: readonly BilibiliSearchHit[], song: Pick<SongResult, 'name' | 'artists'>, options: MvMatchOptions = {}): MvMatch | null => {
    const songTitle = normalizeForMatch(song.name);
    const artistName = normalizeForMatch(song.artists[0]?.name ?? '');
    if (!songTitle) return null;

    let best: MvMatch | null = null;
    for (const hit of hits) {
        if (!hit.bvid || hitExcluded(hit.title)) continue;
        const hitTitle = normalizeForMatch(hit.title);
        const hitAuthor = normalizeForMatch(hit.author);
        if (!hitTitle.includes(songTitle)) continue;

        let score = 4;
        const artistInTitle = artistName.length > 0 && hitTitle.includes(artistName);
        const artistInAuthor = artistName.length > 0 && (hitAuthor.includes(artistName) || artistName.includes(hitAuthor));
        if (artistInAuthor) score += 3;
        if (artistInTitle) score += 2;
        // 歌手一个字都不沾的结果，多半是同名的别的歌。
        if (artistName.length > 0 && !artistInAuthor && !artistInTitle) continue;
        // 标题比歌名多太多，往往是「xx首合集」之类。
        if (hitTitle.length > songTitle.length * 3) score -= 2;
        if (options.durationSec && hit.durationSec > 0) {
            const gap = Math.abs(hit.durationSec - options.durationSec);
            if (gap <= 15) score += 2;
            else if (gap <= 45) score += 1;
            else if (gap > 180) score -= 1;
        }

        if (score >= 5 && (!best || score > best.score)) best = { hit, score };
    }
    return best;
};

/** 从用户粘进来的一段话里取出 BV 号（支持整条链接、`BV1xx411c7mD` 这样的裸号）。 */
export const extractBvid = (input: string): string | null => {
    const match = input.match(/BV[0-9A-Za-z]{10}/);
    return match ? match[0] : null;
};
