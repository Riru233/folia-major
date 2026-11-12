import React from 'react';
import BilibiliMvBackground from './BilibiliMvBackground';
import VideoBackgroundSettingsCard from './VideoBackgroundSettingsCard';
import { defineVisualizerBackground } from '../../../components/visualizer/backgrounds/definition';

// src/shinoinject/lab/videoBackground/entry.tsx
// Registers the experimental 「视频」 background: the current song's bilibili MV, picture only.
// 它由 Shino 实验室里的开关决定出不出现（backgrounds/availability.ts），关掉时背景选择器里没有它。

export default defineVisualizerBackground({
    mode: 'video',
    order: 45,
    labelKey: 'options.visualizerBackgroundModeVideo',
    labelFallback: 'Video',
    // 视频：一个播放三角
    glyph: (
        <>
            <rect x="3.5" y="5" width="17" height="14" rx="2" />
            <path d="M10 9.5l5 2.5-5 2.5z" />
        </>
    ),
    command: {
        title: 'Background: Video (bilibili MV)',
        description: 'Switch background to the current song\u2019s bilibili MV',
        keywords: ['video background', 'mv background', 'bilibili', 'mv', '视频背景', '背景切换到 视频', '背景切换到视频'],
    },
    render: props => <BilibiliMvBackground {...props} />,
    renderSettingsPanel: props => <VideoBackgroundSettingsCard {...props} />,
});
