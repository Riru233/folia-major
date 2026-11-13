import React, { useMemo, useState } from 'react';
import { Button, ColorField, Group, Row, Segmented, type SettingsGroupDef } from '../../modal/settings/kit';
import type { VisualizerSettingsPanelProps } from '../definition';
import { SliderRow, StepperRow, ToggleRow } from '../panelRows';
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
import { useKaraokeLeadInStore } from '../../../stores/useKaraokeLeadInStore';
import { resolveKaraokeCredits } from './karaokeCredits';
import {
    KARAOKE_CREDITS_ADVANCE_MAX,
    KARAOKE_CREDITS_ADVANCE_MIN,
    KARAOKE_FONT_SCALE_MAX,
    KARAOKE_FONT_SCALE_MIN,
    KARAOKE_LEAD_IN_DOT_SIZE_MAX,
    KARAOKE_LEAD_IN_DOT_SIZE_MIN,
    KARAOKE_LEAD_IN_GAP_MAX,
    KARAOKE_LEAD_IN_GAP_MIN,
    KARAOKE_LEAD_IN_MIN,
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
// 进度（预备点交叉时间 / 消失间隔 / 预备点大小 / 预备进度样式 / 超长歌词 / 切页动画），以及这首歌开头的「歌曲信息」。
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

/**
 * 预备点那一组：交叉时间 + 消失间隔。
 *
 * 交叉时间按歌单独记（useKaraokeLeadInStore）：前奏三秒的歌要三秒，前奏二十秒的要二十秒，
 * 一个全局值套不到所有歌上。所以这里改的是「当前这首歌」，没记过的歌跟着设置里的全局值走；
 * 想回到全局就按「改用全局值」。没有正在播放的歌时，改的就是全局值。
 */
const KaraokeLeadInRows: React.FC<{
    t: VisualizerSettingsPanelProps['t'];
    tuning: KaraokeTuning;
    onTuningChange?: VisualizerSettingsPanelProps<KaraokeTuning>['onTuningChange'];
    onSliderPointerDown?: VisualizerSettingsPanelProps<KaraokeTuning>['onSliderPointerDown'];
    onSliderCommit?: VisualizerSettingsPanelProps<KaraokeTuning>['onSliderCommit'];
}> = ({ t, tuning, onTuningChange, onSliderPointerDown, onSliderCommit }) => {
    const displaySong = usePlaybackStore(selectDisplaySong);
    const songKey = displaySong ? getPlaybackSongKey(displaySong) : null;
    const override = useKaraokeLeadInStore(state => (songKey ? state.bySong[songKey] : undefined));
    const setSeconds = useKaraokeLeadInStore(state => state.setSeconds);
    const hasOverride = typeof override === 'number';
    const seconds = hasOverride ? override : tuning.leadInSeconds;

    const saveSeconds = (value: number) => {
        if (songKey) {
            setSeconds(songKey, value);
            return;
        }
        onTuningChange?.({ leadInSeconds: value });
    };

    return (
        <>
            {/* 交叉时间没有上限，用带减号/加号的输入框而不是滑块：滑块总得给个顶，
                而前奏多长都能填。最低 0（0 就是关掉预备点）。 */}
            <StepperRow
                label={t('options.karaokeLeadIn')}
                note={t('options.karaokeLeadInHint')}
                value={seconds}
                min={KARAOKE_LEAD_IN_MIN}
                step={0.5}
                unit="s"
                onChange={saveSeconds}
            />
            {/* 间隔的上限是交叉时间的三分之一：三个点必须都赶在交叉结束前走完，
                所以量程跟着上面一格走；交叉时间为 0（关掉预备点）时不给拖。 */}
            <SliderRow
                label={t('options.karaokeLeadInGap')}
                note={t('options.karaokeLeadInGapHint')}
                value={tuning.leadInGapSeconds}
                min={KARAOKE_LEAD_IN_GAP_MIN}
                max={Math.max(
                    KARAOKE_LEAD_IN_GAP_MIN,
                    Math.round(Math.min(KARAOKE_LEAD_IN_GAP_MAX, seconds / 3) * 10) / 10,
                )}
                step={0.1}
                format={value => `${value.toFixed(1)}s`}
                disabled={seconds <= 0}
                onChange={value => onTuningChange?.({ leadInGapSeconds: value })}
                onDragStart={onSliderPointerDown}
                onDragEnd={onSliderCommit}
            />
            {/* 直径直接给像素，不跟着歌词字号走；白边固定 2px，不随直径变。
                交叉时间为 0（没有预备点）时跟上面一格一起变灰。 */}
            <SliderRow
                label={t('options.karaokeLeadInDotSize')}
                note={t('options.karaokeLeadInDotSizeHint')}
                value={tuning.leadInDotSize}
                min={KARAOKE_LEAD_IN_DOT_SIZE_MIN}
                max={KARAOKE_LEAD_IN_DOT_SIZE_MAX}
                step={1}
                format={value => `${Math.round(value)}px`}
                disabled={seconds <= 0}
                onChange={value => onTuningChange?.({ leadInDotSize: value })}
                onDragStart={onSliderPointerDown}
                onDragEnd={onSliderCommit}
            />
            {songKey && (
                <Row label={t('options.karaokeLeadInReset')}>
                    <Button
                        variant="quiet"
                        onClick={() => setSeconds(songKey, null)}
                        disabled={!hasOverride}
                    >
                        {t('options.karaokeLeadInResetAction')}
                    </Button>
                </Row>
            )}
        </>
    );
};

/**
 * 歌曲信息提前消失：整块信息（歌名 + 作词/作曲）在原淡出点之前多少秒淡完。
 *
 * 上限跟着「这首歌的交叉时间」走：再早就是在重合开始之前就把信息撤了，那段时间会变成空屏。
 * 交叉时间按歌存（useKaraokeLeadInStore），所以这里的量程也按当前这首歌算。
 */
const KaraokeCreditsAdvanceRow: React.FC<{
    t: VisualizerSettingsPanelProps['t'];
    tuning: KaraokeTuning;
    onTuningChange?: VisualizerSettingsPanelProps<KaraokeTuning>['onTuningChange'];
    onSliderPointerDown?: VisualizerSettingsPanelProps<KaraokeTuning>['onSliderPointerDown'];
    onSliderCommit?: VisualizerSettingsPanelProps<KaraokeTuning>['onSliderCommit'];
}> = ({ t, tuning, onTuningChange, onSliderPointerDown, onSliderCommit }) => {
    const displaySong = usePlaybackStore(selectDisplaySong);
    const songKey = displaySong ? getPlaybackSongKey(displaySong) : null;
    const override = useKaraokeLeadInStore(state => (songKey ? state.bySong[songKey] : undefined));
    const seconds = typeof override === 'number' ? override : tuning.leadInSeconds;
    const max = Math.max(
        KARAOKE_CREDITS_ADVANCE_MIN,
        Math.round(Math.min(KARAOKE_CREDITS_ADVANCE_MAX, seconds) * 10) / 10,
    );

    return (
        <SliderRow
            label={t('options.karaokeCreditsAdvance')}
            note={t('options.karaokeCreditsAdvanceHint')}
            value={Math.min(tuning.creditsAdvanceSeconds, max)}
            min={KARAOKE_CREDITS_ADVANCE_MIN}
            max={max}
            step={0.1}
            format={value => `${value.toFixed(1)}s`}
            disabled={max <= KARAOKE_CREDITS_ADVANCE_MIN}
            onChange={value => onTuningChange?.({ creditsAdvanceSeconds: value })}
            onDragStart={onSliderPointerDown}
            onDragEnd={onSliderCommit}
        />
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
                <KaraokeLeadInRows
                    t={t}
                    tuning={karaokeTuning}
                    onTuningChange={onTuningChange}
                    onSliderPointerDown={onSliderPointerDown}
                    onSliderCommit={onSliderCommit}
                />
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
                <KaraokeCreditsAdvanceRow
                    t={t}
                    tuning={karaokeTuning}
                    onTuningChange={onTuningChange}
                    onSliderPointerDown={onSliderPointerDown}
                    onSliderCommit={onSliderCommit}
                />
                <KaraokeInfoRows t={t} />
            </Group>
        </>
    );
};

export default KaraokeSettingsPanel;
