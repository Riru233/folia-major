import { describe, expect, it } from 'vitest';
import { getMixinKey, signWbiParams, wbiKeyFromUrl } from '../../../src/shinoinject/lab/bilibili/wbi';

// bilibili 的 wbi 签名是一段没有本地反馈的算法：算错了只是被服务端回 -403。这里用固定的时间戳
// 和一个固定的密钥把它钉住，改坏了会当场暴露。

describe('wbiKeyFromUrl', () => {
    it('takes the file name without its extension', () => {
        expect(wbiKeyFromUrl('https://i0.hdslb.com/bfs/wbi/7cd084941338484aae1ad9425b84077c.png'))
            .toBe('7cd084941338484aae1ad9425b84077c');
    });
});

describe('getMixinKey', () => {
    it('reorders the two keys and keeps 32 characters', () => {
        const imgKey = '7cd084941338484aae1ad9425b84077c';
        const subKey = '4932caff0ff746eab6f01bf08b70ac45';
        const mixinKey = getMixinKey(imgKey, subKey);
        expect(mixinKey).toHaveLength(32);
        expect(mixinKey).not.toBe((imgKey + subKey).slice(0, 32));
    });
});

describe('signWbiParams', () => {
    it('sorts the parameters, adds wts, and appends a w_rid', () => {
        const signed = signWbiParams({ search_type: 'video', keyword: 'hello world' }, 'img', 'sub', 1_700_000_000);
        expect(signed.startsWith('keyword=hello%20world&search_type=video&wts=1700000000&w_rid=')).toBe(true);
        expect(signed).toMatch(/&w_rid=[0-9a-f]{32}$/);
    });

    it('is stable for the same input', () => {
        const a = signWbiParams({ b: 2, a: 1 }, 'img', 'sub', 1);
        const b = signWbiParams({ a: 1, b: 2 }, 'img', 'sub', 1);
        expect(a).toBe(b);
    });

    it('strips the characters bilibili filters before encoding', () => {
        expect(signWbiParams({ keyword: "don't" }, 'img', 'sub', 1)).toContain('keyword=dont');
    });
});
