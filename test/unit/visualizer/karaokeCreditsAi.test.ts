import { afterEach, describe, expect, it } from 'vitest';
import {
    detectKaraokeCreditsWithAi,
    isKaraokeCreditsBridgeStale,
} from '@/services/karaokeCreditsAi';

// test/unit/visualizer/karaokeCreditsAi.test.ts
// 「让模型认一遍」走的是 preload 桥 + main 里的 IPC 处理函数。改完代码只刷新页面时，桥是新的、
// 主进程还是旧的，Electron 会抛 "No handler registered for 'detect-karaoke-credits'"。
// 这条原话对用户没有意义，要认出来换成「重启应用」的提示；这里钉住这个判定。

const setWindow = (value: unknown) => {
    Object.defineProperty(globalThis, 'window', {
        value,
        configurable: true,
        writable: true,
    });
};

afterEach(() => {
    setWindow(undefined);
});

describe('isKaraokeCreditsBridgeStale', () => {
    it('认出 Electron 的「没有注册这个处理函数」', () => {
        const error = new Error(
            'Error invoking remote method \'detect-karaoke-credits\': '
            + 'Error: No handler registered for \'detect-karaoke-credits\'',
        );
        expect(isKaraokeCreditsBridgeStale(error)).toBe(true);
    });

    it('认不出真正的业务错误：模型说没配密钥就照原样报给用户', () => {
        expect(isKaraokeCreditsBridgeStale(new Error('AI key is not configured'))).toBe(false);
        expect(isKaraokeCreditsBridgeStale('something else')).toBe(false);
        expect(isKaraokeCreditsBridgeStale(null)).toBe(false);
    });
});

describe('detectKaraokeCreditsWithAi', () => {
    it('桌面里没有这个方法（preload 也是旧的）时按「重启应用」处理，而不是去撞不存在的网页端点', async () => {
        setWindow({ electron: {} });

        const failure = await detectKaraokeCreditsWithAi(['Neon River', '作词：某某']).catch(error => error);
        expect(isKaraokeCreditsBridgeStale(failure)).toBe(true);
    });

    it('有桥就用桥，并把越界的行下标丢掉', async () => {
        const calls: string[][] = [];
        setWindow({
            electron: {
                detectKaraokeCredits: async (lines: string[]) => {
                    calls.push(lines);
                    return { hiddenIndexes: [0, 1, 7, 0], title: ' Neon River ', lyricist: '某某', composer: '' };
                },
            },
        });

        const result = await detectKaraokeCreditsWithAi(['Neon River', '作词：某某']);
        expect(calls).toHaveLength(1);
        expect(result).toEqual({
            hiddenIndexes: [0, 1],
            title: 'Neon River',
            lyricist: '某某',
            composer: '',
        });
    });
});
