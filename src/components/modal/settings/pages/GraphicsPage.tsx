import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import ConfirmDialog from '../../../shared/ConfirmDialog';
import { MOTION_SURFACE_IDS, useMotionSettingsStore, type MotionSurfaceId } from '../../../../stores/useMotionSettingsStore';
import { usePlayerChromeSettingsStore } from '../../../../stores/usePlayerChromeSettingsStore';
import { useThemeSettingsStore } from '../../../../stores/useThemeSettingsStore';
import { useVisualizerSettingsStore } from '../../../../stores/useVisualizerSettingsStore';
import { useLiquidGlassSettingsStore } from '../../../../stores/useLiquidGlassSettingsStore';
import { LIQUID_GLASS_PARAM_BOUNDS, LIQUID_GLASS_PRESETS, type LiquidGlassPresetId } from '../../../../shinoinject/liquidglass';
import { isWindowsPlatform } from '../../../../utils/platform';
import { VISUALIZER_FRAME_RATE_OPTIONS } from '../../../../utils/frameRateLimiter';
import { Group, Link, PictureChoice, Reveal, Row, Segmented, Slider, Toggle, option, useSettingsKitTheme, type SettingsGroupDef, type SettingsOptionDef } from '../kit';
import { GlassPresetPicture } from './pictures';

// src/components/modal/settings/pages/GraphicsPage.tsx
// The 性能与动效 page: what trades picture for smoothness or works around a renderer problem
// (static mode, the home background, native blur, the frame-rate cap, the Linux glow fix), and
// which parts of the interface play reduced motion.

/** Docs page behind the "Fix lyric animation freeze on Linux" switch. */
const CHROMIUM_FD_EXHAUSTION_DOCS_URL = 'https://folia-site.cielaniska.top/guide/chromium-fd-exhaustion';

/** The rate the frame-rate cap starts at when it is switched on. */
const FRAME_RATE_WHEN_SWITCHED_ON = 120;

/** Native blur is not offered on Linux. */
const IS_LINUX = typeof navigator !== 'undefined' && navigator.userAgent.toLowerCase().includes('linux');

const PERFORMANCE: SettingsGroupDef = { id: 'graphicsPerformance', titleKey: 'options.labPerformanceSection' };
const MOTION: SettingsGroupDef = { id: 'graphicsMotion', titleKey: 'options.reduceMotionSection' };
const GLASS: SettingsGroupDef = { id: 'liquidGlass', titleKey: 'options.liquidGlassSection' };

/** The liquid glass tuning: distortion and saturation only exist where the backend distorts (Windows). */
const IS_WINDOWS = isWindowsPlatform;

const O = {
    glassPreset: option(GLASS, 'liquidGlassPreset', 'options.liquidGlassPreset'),
    staticMode: option(PERFORMANCE, 'enableStaticMode', 'options.enableStaticMode'),
    homeBackground: option(PERFORMANCE, 'disableHomeDynamicBackground', 'options.disableHomeDynamicBackground'),
    nativeBlur: option(PERFORMANCE, 'enablePlayerPageNativeBlur', 'options.enablePlayerPageNativeBlur'),
    frameRate: option(PERFORMANCE, 'visualizerFrameRate', 'options.visualizerFrameRate'),
    frameRateValue: option(PERFORMANCE, 'visualizerFrameRateValue', 'options.visualizerFrameRateValue'),
    glowFix: option(PERFORMANCE, 'glowBlurQuantize', 'options.glowBlurQuantize'),
    followSystem: option(MOTION, 'reduceMotionFollowSystem', 'options.reduceMotionFollowSystem'),
    glassStrength: option(GLASS, 'liquidGlassStrength', 'options.liquidGlassStrength', { available: () => IS_WINDOWS }),
    glassBend: option(GLASS, 'liquidGlassBend', 'options.liquidGlassBend', { available: () => IS_WINDOWS }),
    glassBlur: option(GLASS, 'liquidGlassBlur', 'options.liquidGlassBlur'),
    glassSat: option(GLASS, 'liquidGlassSat', 'options.liquidGlassSat', { available: () => IS_WINDOWS }),
};

/** One row per part of the interface whose motion can be reduced, in the store's order. */
const SURFACE_ROWS: Record<MotionSurfaceId, { option: SettingsOptionDef; hintKey: string }> = {
    lattice: { option: option(MOTION, 'reduceMotionLattice', 'options.reduceMotionLattice'), hintKey: 'options.reduceMotionLatticeDesc' },
    transitionOverlay: { option: option(MOTION, 'reduceMotionTransitionOverlay', 'options.reduceMotionTransitionOverlay'), hintKey: 'options.reduceMotionTransitionOverlayDesc' },
    collectionMorph: { option: option(MOTION, 'reduceMotionCollectionMorph', 'options.reduceMotionCollectionMorph'), hintKey: 'options.reduceMotionCollectionMorphDesc' },
    monetBackground: { option: option(MOTION, 'reduceMotionMonetBackground', 'options.reduceMotionMonetBackground'), hintKey: 'options.reduceMotionMonetBackgroundDesc' },
    uiMicroMotion: { option: option(MOTION, 'reduceMotionUiMicroMotion', 'options.reduceMotionUiMicroMotion'), hintKey: 'options.reduceMotionUiMicroMotionDesc' },
    settingsScroll: { option: option(MOTION, 'reduceMotionSettingsScroll', 'options.reduceMotionSettingsScroll'), hintKey: 'options.reduceMotionSettingsScrollDesc' },
};

export const OPTIONS: SettingsOptionDef[] = [
    ...Object.values(O).filter(row => row !== O.nativeBlur || !IS_LINUX),
    ...MOTION_SURFACE_IDS.map(surface => SURFACE_ROWS[surface].option),
];
const FRAME_RATE_CHOICES = VISUALIZER_FRAME_RATE_OPTIONS.map(rate => ({ value: String(rate), label: `${rate} FPS` }));

/** 预设名走 i18n（三份语言文件一起加），效果图占位见 GlassPresetPicture。 */
const PRESET_LABEL_KEY: Record<LiquidGlassPresetId, string> = {
    frosted: 'options.liquidGlassPresetFrosted',
    clear: 'options.liquidGlassPresetClear',
    hazy: 'options.liquidGlassPresetHazy',
    eco: 'options.liquidGlassPresetEco',
};

const GraphicsPage: React.FC = () => {
    const { t } = useTranslation();
    const { isDaylight } = useSettingsKitTheme();
    const theme = useThemeSettingsStore(useShallow(state => ({
        staticMode: state.staticMode,
        homeBackgroundOff: state.disableHomeDynamicBackground,
        setStaticMode: state.handleToggleStaticMode,
        setHomeBackgroundOff: state.handleToggleDisableHomeDynamicBackground,
    })));
    const nativeBlur = usePlayerChromeSettingsStore(state => state.enablePlayerPageNativeBlur);
    const setNativeBlur = usePlayerChromeSettingsStore(state => state.handleTogglePlayerPageNativeBlur);
    const visualizer = useVisualizerSettingsStore(useShallow(state => ({
        frameRate: state.visualizerFrameRate,
        glowFix: state.glowBlurQuantize,
        setFrameRate: state.handleSetVisualizerFrameRate,
        setGlowFix: state.handleToggleGlowBlurQuantize,
    })));
    const motion = useMotionSettingsStore(useShallow(state => ({
        surfaces: state.reducedMotionSurfaces,
        followSystem: state.followSystemReducedMotion,
        systemPrefers: state.systemPrefersReducedMotion,
        setSurface: state.handleToggleReducedMotionSurface,
        setFollowSystem: state.handleToggleFollowSystemReducedMotion,
    })));
    const glass = useLiquidGlassSettingsStore(useShallow(state => ({
        strength: state.strength,
        blur: state.blur,
        sat: state.sat,
        bend: state.bend,
        setStrength: state.handleSetLiquidGlassStrength,
        setBlur: state.handleSetLiquidGlassBlur,
        setSat: state.handleSetLiquidGlassSat,
        setBend: state.handleSetLiquidGlassBend,
        setParams: state.handleSetLiquidGlassParams,
    })));
    // Native blur can drop frames on some GPUs, so switching it on asks first.
    const [nativeBlurAsking, setNativeBlurAsking] = useState(false);
    const frameRateLimited = visualizer.frameRate !== 'off';
    // 预设：非 Windows 不列出通透/朦胧流体；按当前值高亮（非 Windows 强度与弯曲距离被钉死，只按模糊匹配）。
    const presetOptions = LIQUID_GLASS_PRESETS
        .filter(preset => !preset.windowsOnly || IS_WINDOWS)
        .map(preset => ({ value: preset.id as string, label: t(PRESET_LABEL_KEY[preset.id]), picture: <GlassPresetPicture id={preset.id} /> }));
    const activePreset = LIQUID_GLASS_PRESETS.find(preset => (
        preset.windowsOnly && !IS_WINDOWS
            ? false
            : IS_WINDOWS
                ? glass.strength === preset.strength && glass.blur === preset.blur && glass.bend === preset.bend
                : glass.blur === preset.blur
    ))?.id ?? '';
    const applyPreset = (id: string) => {
        const preset = LIQUID_GLASS_PRESETS.find(candidate => candidate.id === id);
        if (preset) glass.setParams({ strength: preset.strength, blur: preset.blur, bend: preset.bend });
    };

    return (
        <>
            <Group def={PERFORMANCE}>
                <Row option={O.staticMode} hint={t('options.enableStaticModeDesc')}>
                    <Toggle checked={theme.staticMode} onChange={theme.setStaticMode} />
                </Row>
                <Row option={O.homeBackground} hint={t('options.disableHomeDynamicBackgroundDesc')}>
                    <Toggle checked={theme.homeBackgroundOff} onChange={theme.setHomeBackgroundOff} />
                </Row>
                {!IS_LINUX && (
                    <Row option={O.nativeBlur} hint={t('options.enablePlayerPageNativeBlurHint')} note={t('options.enablePlayerPageNativeBlurDesc')}>
                        <Toggle checked={nativeBlur} onChange={enabled => (enabled ? setNativeBlurAsking(true) : setNativeBlur(false))} />
                    </Row>
                )}
                <Row option={O.frameRate} hint={t('options.visualizerFrameRateDesc')}>
                    <Toggle
                        checked={frameRateLimited}
                        onChange={enabled => visualizer.setFrameRate(enabled ? FRAME_RATE_WHEN_SWITCHED_ON : 'off')}
                    />
                </Row>
                <Reveal when={frameRateLimited}>
                    <Row sub option={O.frameRateValue}>
                        <Segmented
                            value={String(visualizer.frameRate)}
                            options={FRAME_RATE_CHOICES}
                            onChange={(value) => {
                                const rate = VISUALIZER_FRAME_RATE_OPTIONS.find(candidate => String(candidate) === value);
                                if (rate) visualizer.setFrameRate(rate);
                            }}
                        />
                    </Row>
                </Reveal>
                <Row
                    option={O.glowFix}
                    hint={(
                        <>
                            {t('options.glowBlurQuantizeDesc')}{' '}
                            <Link href={CHROMIUM_FD_EXHAUSTION_DOCS_URL}>{t('options.glowBlurQuantizeDocs')}</Link>
                        </>
                    )}
                >
                    <Toggle checked={visualizer.glowFix} onChange={visualizer.setGlowFix} />
                </Row>
            </Group>

            <Group def={MOTION} foot={t('options.reduceMotionSectionDesc')}>
                <Row option={O.followSystem} hint={t('options.reduceMotionFollowSystemDesc')}>
                    <Toggle checked={motion.followSystem} onChange={motion.setFollowSystem} />
                </Row>
                {/* While the system asks for reduced motion and is followed, every row below is reduced whatever its switch says. */}
                <Reveal when={motion.followSystem && motion.systemPrefers}>
                    <Row sub notice={t('options.reduceMotionForcedNotice')} />
                </Reveal>
                {MOTION_SURFACE_IDS.map(surface => (
                    <Row key={surface} option={SURFACE_ROWS[surface].option} hint={t(SURFACE_ROWS[surface].hintKey)}>
                        <Toggle checked={motion.surfaces[surface]} onChange={enabled => motion.setSurface(surface, enabled)} />
                    </Row>
                ))}
            </Group>

            <Group def={GLASS} foot={t('options.liquidGlassSectionDesc')}>
                <Row option={O.glassPreset} hint={t('options.liquidGlassPresetDesc')}>
                    <PictureChoice value={activePreset} options={presetOptions} onChange={applyPreset} />
                </Row>
                {IS_WINDOWS && (
                    <Row option={O.glassStrength} hint={t('options.liquidGlassStrengthDesc')}>
                        <Slider
                            value={glass.strength}
                            min={LIQUID_GLASS_PARAM_BOUNDS.strength.min}
                            max={LIQUID_GLASS_PARAM_BOUNDS.strength.max}
                            step={0.25}
                            onChange={glass.setStrength}
                            format={value => value.toFixed(2)}
                        />
                    </Row>
                )}
                {IS_WINDOWS && (
                    <Row option={O.glassBend} hint={t('options.liquidGlassBendDesc')}>
                        <Slider
                            value={glass.bend}
                            min={LIQUID_GLASS_PARAM_BOUNDS.bend.min}
                            max={LIQUID_GLASS_PARAM_BOUNDS.bend.max}
                            step={2}
                            onChange={glass.setBend}
                            format={value => `${Math.round(value)}px`}
                        />
                    </Row>
                )}
                <Row option={O.glassBlur} hint={t('options.liquidGlassBlurDesc')}>
                    <Slider
                        value={glass.blur}
                        min={LIQUID_GLASS_PARAM_BOUNDS.blur.min}
                        max={LIQUID_GLASS_PARAM_BOUNDS.blur.max}
                        step={0.5}
                        onChange={glass.setBlur}
                        format={value => value.toFixed(1)}
                    />
                </Row>
                {IS_WINDOWS && (
                    <Row option={O.glassSat} hint={t('options.liquidGlassSatDesc')}>
                        <Slider
                            value={glass.sat}
                            min={LIQUID_GLASS_PARAM_BOUNDS.sat.min}
                            max={LIQUID_GLASS_PARAM_BOUNDS.sat.max}
                            step={5}
                            onChange={glass.setSat}
                            format={value => `${Math.round(value)}%`}
                        />
                    </Row>
                )}
            </Group>

            <ConfirmDialog
                isOpen={nativeBlurAsking}
                isDaylight={isDaylight}
                title={t('options.nativeBlurConfirmTitle')}
                description={t('options.nativeBlurConfirmDesc')}
                confirmText={t('options.nativeBlurConfirmAction')}
                onConfirm={() => {
                    setNativeBlur(true);
                    setNativeBlurAsking(false);
                }}
                onClose={() => setNativeBlurAsking(false)}
            />
        </>
    );
};

export default GraphicsPage;
