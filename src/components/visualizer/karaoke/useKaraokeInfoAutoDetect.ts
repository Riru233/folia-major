import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { Line } from '../../../types';
import { detectKaraokeCreditsWithAi, isKaraokeCreditsAiAvailable } from '../../../services/karaokeCreditsAi';
import {
    KARAOKE_INFO_AI_LINE_LIMIT,
    getKaraokeInfoOverride,
    useKaraokeInfoOverrideStore,
} from '../../../stores/useKaraokeInfoOverrideStore';

// src/components/visualizer/karaoke/useKaraokeInfoAutoDetect.ts
// 播放时替用户问一次模型：「开头哪几行是歌曲信息」。
//
// 本地规则只认「作词：」「作曲：」这类写法，英文署名、合成一行的署名、干脆不写的歌词就漏了，
// 于是整块署名被当成歌词唱出来。以前只能去设置里点「让模型认一遍」，可用户不会为每首歌点一次。
//
// 这里补上自动那一步，但要克制：
//   1. 只在真的在播（不是预览、不是停在开头）时问；
//   2. 只在本地一条信息行都没认出来时问——本地认出来了就没必要花用户的额度；
//   3. 同一首歌只问一次：答案（哪怕是「开头没有信息行」）会存进 useKaraokeInfoOverrideStore，
//      下次播放直接用它；本次运行里再挂载也不会重问。
//
// 失败不进界面：额度用完、没配密钥、断网都只记一行日志，用户仍可在设置里手动点「识别」重试。

/** 本次运行里已经问过模型的歌。存过答案的歌连这里都不会进（第 3 条靠存储本身挡住）。 */
const askedInThisRun = new Set<string>();

/** 记下这首歌已经问过了，同一首歌这次运行里不再问。 */
export const markAutoDetectAsked = (songKey: string) => {
    askedInThisRun.add(songKey);
};

/** 测试用：忘掉本次运行问过哪些歌。 */
export const resetAutoDetectedKaraokeInfo = () => askedInThisRun.clear();

/** 「问过哪些歌」的只读快照，测试用。 */
export const autoDetectedKaraokeInfoSongs = (): string[] => [...askedInThisRun];

export interface KaraokeInfoAutoDetectInput {
    /** 播放键；预览里是 null。 */
    songKey: string | null;
    lines: Line[];
    /** 真的在播（预览模式、暂停在开头都不算）。 */
    active: boolean;
    /** 本地一条信息行都没认出来。 */
    needsDetection: boolean;
}

/**
 * 该不该问模型。抽成纯函数是为了能直接钉住那几条克制条件——它们每一条都关系到花不花用户的额度。
 */
export const shouldAutoDetectKaraokeInfo = ({ songKey, lines, active, needsDetection }: KaraokeInfoAutoDetectInput): boolean => {
    if (!active || !songKey || !needsDetection) {
        return false;
    }
    if (lines.length === 0) {
        return false;
    }
    if (askedInThisRun.has(songKey)) {
        return false;
    }
    // 已经有答案（手动勾的，或者上一次播放认过的）就以那份为准。
    if (getKaraokeInfoOverride(songKey)) {
        return false;
    }
    return isKaraokeCreditsAiAvailable();
};

/** 播放时自动认一次这首歌开头的歌曲信息，认完按歌存起来。 */
export const useKaraokeInfoAutoDetect = (input: KaraokeInfoAutoDetectInput): void => {
    const { t } = useTranslation();
    const setOverride = useKaraokeInfoOverrideStore(state => state.setOverride);
    const { songKey, lines, active, needsDetection } = input;

    useEffect(() => {
        if (!shouldAutoDetectKaraokeInfo({ songKey, lines, active, needsDetection }) || !songKey) {
            return;
        }
        // 先登记再发请求：同一帧里挂载两次（叠加层 + 设置面板预览）也只问一次。
        markAutoDetectAsked(songKey);

        const sample = lines.slice(0, KARAOKE_INFO_AI_LINE_LIMIT).map(line => line.fullText ?? '');
        void detectKaraokeCreditsWithAi(sample).then(result => {
            // 等的这会儿用户可能已经自己勾过了：以用户那份为准。
            if (getKaraokeInfoOverride(songKey)) {
                return;
            }

            const rows: string[] = [];
            if (result.lyricist) {
                rows.push(t('options.karaokeInfoCreditRow', {
                    label: t('options.karaokeInfoLyricist'),
                    name: result.lyricist,
                }));
            }
            if (result.composer) {
                rows.push(t('options.karaokeInfoCreditRow', {
                    label: t('options.karaokeInfoComposer'),
                    name: result.composer,
                }));
            }

            setOverride(songKey, {
                hiddenIndexes: result.hiddenIndexes,
                title: result.title || null,
                rows: rows.length > 0 ? rows : null,
                source: 'ai',
            });
        }).catch((error: unknown) => {
            console.warn('[karaoke-credits] automatic read failed:',
                error instanceof Error ? error.message : String(error));
        });
    }, [active, lines, needsDetection, setOverride, songKey, t]);
};
