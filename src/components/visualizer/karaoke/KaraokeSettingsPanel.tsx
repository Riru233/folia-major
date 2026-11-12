import React from 'react';
import { ColorField, Group, Row, Segmented, type SettingsGroupDef } from '../../modal/settings/kit';
import type { VisualizerSettingsPanelProps } from '../definition';
import { SliderRow, ToggleRow } from '../panelRows';
import {
    KARAOKE_FONT_SCALE_MAX,
    KARAOKE_FONT_SCALE_MIN,
    KARAOKE_STROKE_MAX,
    KARAOKE_STROKE_MIN,
} from './tuning';
import {
    DEFAULT_KARAOKE_TUNING,
    type KaraokeFontStyle,
    type KaraokeOverflowMode,
    type KaraokeProgressStyle,
    type KaraokeTuning,
} from './types';

// src/components/visualizer/karaoke/KaraokeSettingsPanel.tsx
// 卡拉OK 的参数面板：颜色（四色 + 描边宽度）、文字（字号 / 字体 / 字重 / 斜体）、
// 进度（预备进度样式）。滑块沿用设置窗口的草稿 / 松手提交语义，颜色用 kit 的取色钮。

const COLOR_GROUP: SettingsGroupDef = { id: 'vis-karaoke-color', titleKey: 'options.karaokeColorSection' };
const TEXT_GROUP: SettingsGroupDef = { id: 'vis-karaoke-text', titleKey: 'options.karaokeTextSection' };
const PROGRESS_GROUP: SettingsGroupDef = { id: 'vis-karaoke-progress', titleKey: 'options.karaokeProgressSection' };

/** 取色钮旁边给的常用色：黑白、标准蓝，以及几种常见的卡拉OK亮色。 */
const SWATCHES = ['#ffffff', '#000000', '#0000ff', '#00e5ff', '#ffd400', '#ff4d8d', '#7c4dff'];

const KaraokeSettingsPanel: React.FC<VisualizerSettingsPanelProps<KaraokeTuning>> = ({
    t,
    tuning: karaokeTuning = DEFAULT_KARAOKE_TUNING,
    onTuningChange,
    onSliderPointerDown,
    onSliderCommit,
}) => {
    const setColor = (key: 'activeFill' | 'activeStroke' | 'idleFill' | 'idleStroke', labelKey: string) => (
        <Row key={key} label={t(labelKey)}>
            <ColorField
                value={karaokeTuning[key]}
                onChange={color => onTuningChange?.({ [key]: color })}
                label={t(labelKey)}
                swatches={SWATCHES}
                swatchesLabel={t('options.karaokeSwatches')}
            />
        </Row>
    );

    return (
        <>
            <Group def={COLOR_GROUP}>
                {setColor('activeFill', 'options.karaokeActiveFill')}
                {setColor('activeStroke', 'options.karaokeActiveStroke')}
                {setColor('idleFill', 'options.karaokeIdleFill')}
                {setColor('idleStroke', 'options.karaokeIdleStroke')}
                <SliderRow
                    label={t('options.karaokeStrokeWidth')}
                    note={t('options.karaokeStrokeWidthHint')}
                    value={karaokeTuning.strokeWidth}
                    min={KARAOKE_STROKE_MIN}
                    max={KARAOKE_STROKE_MAX}
                    step={0.5}
                    format={value => `${value.toFixed(1)}px`}
                    onChange={value => onTuningChange?.({ strokeWidth: value })}
                    onDragStart={onSliderPointerDown}
                    onDragEnd={onSliderCommit}
                />
            </Group>

            <Group def={TEXT_GROUP}>
                <SliderRow
                    label={t('options.karaokeFontScale')}
                    value={karaokeTuning.fontScale}
                    min={KARAOKE_FONT_SCALE_MIN}
                    max={KARAOKE_FONT_SCALE_MAX}
                    step={0.05}
                    format={value => `${value.toFixed(2)}x`}
                    onChange={value => onTuningChange?.({ fontScale: value })}
                    onDragStart={onSliderPointerDown}
                    onDragEnd={onSliderCommit}
                />
                <Row label={t('options.karaokeFontStyle')}>
                    <Segmented<KaraokeFontStyle>
                        value={karaokeTuning.fontStyle}
                        options={[
                            { value: 'theme', label: t('options.karaokeFontStyleTheme') },
                            { value: 'sans', label: t('options.karaokeFontStyleSans') },
                            { value: 'serif', label: t('options.karaokeFontStyleSerif') },
                            { value: 'mono', label: t('options.karaokeFontStyleMono') },
                        ]}
                        onChange={fontStyle => onTuningChange?.({ fontStyle })}
                    />
                </Row>
                <SliderRow
                    label={t('options.karaokeFontWeight')}
                    value={karaokeTuning.fontWeight}
                    min={100}
                    max={900}
                    step={100}
                    format={value => String(Math.round(value))}
                    onChange={value => onTuningChange?.({ fontWeight: value })}
                    onDragStart={onSliderPointerDown}
                    onDragEnd={onSliderCommit}
                />
                <ToggleRow
                    label={t('options.karaokeItalic')}
                    checked={karaokeTuning.italic}
                    onChange={italic => onTuningChange?.({ italic })}
                />
            </Group>

            <Group def={PROGRESS_GROUP}>
                <Row label={t('options.karaokeProgressStyle')} note={t('options.karaokeProgressStyleHint')}>
                    <Segmented<KaraokeProgressStyle>
                        value={karaokeTuning.progressStyle}
                        options={[
                            { value: 'sweep', label: t('options.karaokeProgressSweep') },
                            { value: 'fade', label: t('options.karaokeProgressFade') },
                            { value: 'jump', label: t('options.karaokeProgressJump') },
                        ]}
                        onChange={progressStyle => onTuningChange?.({ progressStyle })}
                    />
                </Row>
                <Row label={t('options.karaokeOverflowMode')} note={t('options.karaokeOverflowModeHint')}>
                    <Segmented<KaraokeOverflowMode>
                        value={karaokeTuning.overflowMode}
                        options={[
                            { value: 'scroll', label: t('options.karaokeOverflowScroll') },
                            { value: 'wrap', label: t('options.karaokeOverflowWrap') },
                        ]}
                        onChange={overflowMode => onTuningChange?.({ overflowMode })}
                    />
                </Row>
                <ToggleRow
                    label={t('options.karaokePageAnimation')}
                    checked={karaokeTuning.pageAnimation}
                    onChange={pageAnimation => onTuningChange?.({ pageAnimation })}
                />
            </Group>
        </>
    );
};

export default KaraokeSettingsPanel;
