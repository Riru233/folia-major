import React, { useMemo, useState } from 'react';
import { Button, ColorField, Group, Row, Segmented, type SettingsGroupDef } from '../../modal/settings/kit';
import type { VisualizerSettingsPanelProps } from '../definition';
import { SliderRow, ToggleRow } from '../panelRows';
import { selectDisplayLyrics, selectDisplaySong, usePlaybackStore } from '../../../stores/usePlaybackStore';
import { getPlaybackSongKey } from '../../../utils/appPlaybackGuards';
import {
    KARAOKE_INFO_CANDIDATE_LIMIT,
    useKaraokeInfoOverrideStore,
} from '../../../stores/useKaraokeInfoOverrideStore';
import {
    isKaraokeCreditsAiAvailable,
    isKaraokeCreditsBridgeStale,
    detectKaraokeCreditsWithAi,
} from '../../../services/karaokeCreditsAi';
import { resolveKaraokeCredits } from './karaokeCredits';
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
// 卡拉OK 的参数面板：颜色（四色 + 描边宽度）、文字（字号 / 字体 / 字重 / 斜体 / 繁体字形）、
// 进度（预备进度样式 / 超长歌词 / 切页动画），以及这首歌开头的「歌曲信息」。
// 滑块沿用设置窗口的草稿 / 松手提交语义，颜色用 kit 的取色钮。

const COLOR_GROUP: SettingsGroupDef = { id: 'vis-karaoke-color', titleKey: 'options.karaokeColorSection' };
const TEXT_GROUP: SettingsGroupDef = { id: 'vis-karaoke-text', titleKey: 'options.karaokeTextSection' };
const PROGRESS_GROUP: SettingsGroupDef = { id: 'vis-karaoke-progress', titleKey: 'options.karaokeProgressSection' };
const INFO_GROUP: SettingsGroupDef = { id: 'vis-karaoke-info', titleKey: 'options.karaokeInfoSection' };

/** 取色钮旁边给的常用色：黑白、标准蓝，以及几种常见的卡拉OK亮色。 */
const SWATCHES = ['#ffffff', '#000000', '#0000ff', '#00e5ff', '#ffd400', '#ff4d8d', '#7c4dff'];

/** 候选行太长的截一下：面板一行放不下整句歌词，也没必要。 */
const trimCandidate = (text: string) => (text.length > 24 ? `${text.slice(0, 24)}…` : text);

/** 面板的 t 只声明了一个参数，插值键得自己放宽。 */
type Translate = VisualizerSettingsPanelProps['t'] & ((key: string, options?: Record<string, unknown>) => string);

/**
 * 这首歌开头的「歌曲信息」怎么认：自动识别、AI 认、还是手动勾。
 *
 * 自动识别只认「作词：」「作曲：」这类写法，漏了就靠这里的后两条补。结果按歌存在
 * useKaraokeInfoOverrideStore，渲染端和这里读的是同一份。
 */
const KaraokeInfoRows: React.FC<{ t: VisualizerSettingsPanelProps['t'] }> = ({ t }) => {
    const translate = t as Translate;
    const displaySong = usePlaybackStore(selectDisplaySong);
    const displayLyrics = usePlaybackStore(selectDisplayLyrics);
    const songKey = displaySong ? getPlaybackSongKey(displaySong) : null;
    const override = useKaraokeInfoOverrideStore(state => (songKey ? state.bySong[songKey] : undefined));
    const setOverride = useKaraokeInfoOverrideStore(state => state.setOverride);
    const [busy, setBusy] = useState(false);
    const [failure, setFailure] = useState('');

    const lines = displayLyrics?.lines ?? [];

    // 没有手动答案时，勾选框照着自动识别的结果亮，用户一眼能看出它认成了什么。
    const autoCredits = useMemo(
        () => resolveKaraokeCredits(lines, { title: displaySong?.name ?? null }),
        [lines, displaySong?.name],
    );
    const checked = useMemo(
        () => new Set(override ? override.hiddenIndexes : autoCredits?.hiddenIndexes ?? []),
        [override, autoCredits],
    );

    const candidates = useMemo(() => {
        const out: { index: number; text: string }[] = [];
        for (let index = 0; index < lines.length && out.length < KARAOKE_INFO_CANDIDATE_LIMIT; index += 1) {
            const text = lines[index]?.fullText?.trim() ?? '';
            if (text) {
                out.push({ index, text });
            }
        }
        return out;
    }, [lines]);

    if (!songKey || candidates.length === 0) {
        return <Row label={t('options.karaokeInfoEmpty')} />;
    }

    const saveIndexes = (indexes: number[]) => {
        setOverride(songKey, {
            hiddenIndexes: [...new Set(indexes)].sort((left, right) => left - right),
            // 手改之后就不再是模型那份答案了：标题只留元数据，两行按勾中的原文重新排。
            source: 'manual',
        });
    };

    const toggle = (index: number) => (value: boolean) => {
        const next = new Set(checked);
        if (value) {
            next.add(index);
        } else {
            next.delete(index);
        }
        saveIndexes([...next]);
    };

    const askModel = async () => {
        setBusy(true);
        setFailure('');
        try {
            const result = await detectKaraokeCreditsWithAi(lines.map(line => line.fullText ?? ''));
            const rows: string[] = [];
            if (result.lyricist) {
                rows.push(translate('options.karaokeInfoCreditRow', {
                    label: t('options.karaokeInfoLyricist'),
                    name: result.lyricist,
                }));
            }
            if (result.composer) {
                rows.push(translate('options.karaokeInfoCreditRow', {
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
        } catch (error) {
            setFailure(isKaraokeCreditsBridgeStale(error)
                ? t('options.karaokeInfoAiRestart')
                : (error instanceof Error ? error.message : String(error)));
        } finally {
            setBusy(false);
        }
    };

    const canAsk = isKaraokeCreditsAiAvailable();

    return (
        <>
            <Row label={t('options.karaokeInfoHint')} note={t('options.karaokeInfoHintNote')} />
            {candidates.map(candidate => (
                <ToggleRow
                    key={candidate.index}
                    sub
                    label={trimCandidate(candidate.text)}
                    checked={checked.has(candidate.index)}
                    onChange={toggle(candidate.index)}
                />
            ))}
            <Row
                label={t('options.karaokeInfoAi')}
                note={failure || t('options.karaokeInfoAiNote')}
            >
                <Button onClick={askModel} disabled={busy || !canAsk} variant="primary">
                    {busy ? t('options.karaokeInfoAiBusy') : t('options.karaokeInfoAiRun')}
                </Button>
            </Row>
            <Row label={t('options.karaokeInfoReset')}>
                <Button
                    variant="quiet"
                    onClick={() => {
                        setFailure('');
                        setOverride(songKey, null);
                    }}
                    disabled={!override}
                >
                    {t('options.karaokeInfoResetAction')}
                </Button>
            </Row>
        </>
    );
};

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
                <ToggleRow
                    label={t('options.karaokeTraditional')}
                    note={t('options.karaokeTraditionalHint')}
                    checked={karaokeTuning.traditionalScript}
                    onChange={traditionalScript => onTuningChange?.({ traditionalScript })}
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

            <Group def={INFO_GROUP}>
                <KaraokeInfoRows t={t} />
            </Group>
        </>
    );
};

export default KaraokeSettingsPanel;
