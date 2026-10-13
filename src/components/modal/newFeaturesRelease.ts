import { Blend, Droplets, SlidersHorizontal } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

// src/components/modal/newFeaturesRelease.ts

type NewFeatureCard = {
    id: string;
    icon: LucideIcon;
    daylightIconClassName: string;
    darkIconClassName: string;
};

type NewFeaturesRelease = {
    i18nKey: string;
    /** 重大更新：介绍上方显示「<代号> Update · 重大更新」标签；代号不翻译，文案在 help.majorUpdateLabel。 */
    majorUpdate?: { codename: string };
    features: NewFeatureCard[];
};

// Defines the current release's cards; their localized text lives under i18nKey in every locale.
export const NEW_FEATURES_RELEASE: NewFeaturesRelease = {
    i18nKey: 'releaseNotes.v0_7_18s-shino',
    features: [
        { id: 'liquidGlassFix', icon: Droplets, daylightIconClassName: 'text-cyan-600', darkIconClassName: 'text-cyan-400' },
        { id: 'liquidGlassSoften', icon: Blend, daylightIconClassName: 'text-sky-600', darkIconClassName: 'text-sky-400' },
        { id: 'liquidGlassSettings', icon: SlidersHorizontal, daylightIconClassName: 'text-blue-600', darkIconClassName: 'text-blue-400' },
    ],
};
