import React from 'react';
import { defineVisualizer } from '../definition';
import KaraokeSettingsPanel from './KaraokeSettingsPanel';
import karaokeTuning, { normalizeKaraokeTuning } from './tuning';

const VisualizerKaraoke = React.lazy(() => import('./VisualizerKaraoke'));

// src/components/visualizer/karaoke/entry.tsx
// 注册「卡拉OK」歌词样式：一行字两遍叠着画，唱到哪亮到哪，未唱白字黑边、已唱白边蓝字。
export default defineVisualizer({
    mode: 'karaoke',
    order: 35,
    labelKey: 'ui.visualizerKaraoke',
    labelFallback: '卡拉OK',
    previewSeed: 'karaoke',
    previewStartOffset: 0,
    // 卡拉OK：一行字，左半边已经点亮
    glyph: (
        <>
            <path d="M3 9.5h18" opacity="0.35" />
            <path d="M3 9.5h9" />
            <path d="M3 14.5h18" opacity="0.35" />
        </>
    ),
    command: {
        title: 'Visualizer: Karaoke',
        description: 'Switch to the karaoke lyric style: sung text in blue with a white outline',
        keywords: ['karaoke', 'ktv', '卡拉ok', '跟唱', '描边'],
    },
    // 不声明 usesWordSegmentation：字块是「汉字一字一块、拉丁词连空格一块」自己切的，用户保存的分词
    // 不改变这里画出来的样子。
    // 参数从 bundle 里取（tuning.ts 的 read），不给 definition 加 prop，也不写 apply。
    // read 拿的是存着的对象本身，缺字段的（旧版本、mod 直接塞的部分对象、探针）要补成完整一份再画。
    render: props => (
        <VisualizerKaraoke {...props} karaokeTuning={normalizeKaraokeTuning(karaokeTuning.read(props.visualizerTunings))} />
    ),
    renderSettingsPanel: props => <KaraokeSettingsPanel {...props} />,
});
