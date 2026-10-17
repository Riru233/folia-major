import React from 'react';
import { defineVisualizerBackground } from '../definition';
import TransparentBackgroundSettingsCard from './TransparentBackgroundSettingsCard';
import TransparentCoverBackground from './TransparentCoverBackground';

// src/components/visualizer/backgrounds/transparent/entry.tsx
// Registers the cover-only shell background: the song artwork fills the layer like Monet's
// full-overlay layout, but with the color wash and blur removed.

export default defineVisualizerBackground({
    mode: 'transparent',
    order: 60,
    labelKey: 'options.visualizerBackgroundModeTransparent',
    labelFallback: 'Transparent',
    render: ({ coverUrl, theme }) => (
        <TransparentCoverBackground coverUrl={coverUrl} theme={theme} />
    ),
    renderSettingsPanel: ({ t, isDaylight, theme, controlCardBg }) => (
        <TransparentBackgroundSettingsCard
            t={t}
            isDaylight={isDaylight}
            theme={theme}
            controlCardBg={controlCardBg}
        />
    ),
});
