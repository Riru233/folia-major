import { ListMusic, MessageSquareText, Puzzle, SlidersVertical, Sparkles, Store } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { HomeViewTab } from '../../types';
import shinoBanner from '../../../assets/banners/folia-shino-0.7.29s.png?url';

// src/components/modal/newFeaturesRelease.ts
// 当前版本的介绍：卡片 id 和文案 key 对不上会在 test/unit/newFeaturesRelease.test.ts 里报出来。

type NewFeatureCard = {
    id: string;
    icon: LucideIcon;
};

/** 更新日志顶部的一张图。带 targetTab 时点它跳到首页的那个页签（先关掉日志所在的窗口）；不带就只是图。 */
type NewFeatureBanner = {
    imageUrl: string;
    targetTab?: HomeViewTab;
    /** 文案 key 前缀：`<key>.alt` 是图的说明，`<key>.hint` 是图上的跳转提示（没有跳转时不显示）。 */
    i18nKey: string;
};

type NewFeaturesRelease = {
    i18nKey: string;
    /** 界面上写的版本（可以带渠道字母，如 0.7.29S）；不给就按 help 页的版本号显示。 */
    displayVersion?: string;
    banner?: NewFeatureBanner;
    /** 重大更新：介绍上方显示「<代号> Update · 重大更新」标签；代号不翻译，文案在 help.majorUpdateLabel。
     *  servicePack：同一重大更新的热修复版，标签改成「<代号> Update SP<n> · 重大更新」，文案在 help.servicePackLabel。 */
    majorUpdate?: { codename: string; servicePack?: number };
    features: NewFeatureCard[];
};


export const NEW_FEATURES_RELEASE: NewFeaturesRelease = {
    i18nKey: 'releaseNotes.v0_8_0',
    majorUpdate: { codename: 'Severance' },
    features: [
        { id: 'sourceMods', icon: Puzzle },
        { id: 'modMarket', icon: Store },
        { id: 'foliaPlaylists', icon: ListMusic },
        { id: 'moments', icon: MessageSquareText },
        { id: 'stemMixer', icon: SlidersVertical },
        { id: 'moreDetails', icon: Sparkles },
    ],
};
