import { describe, expect, it, vi } from 'vitest';
import {
    DEFAULT_VISUALIZER_BACKGROUND_MODE,
    VISUALIZER_BACKGROUND_REGISTRY,
    getVisualizerBackgroundModeLabel,
    getVisualizerBackgroundRegistryEntry,
    hasVisualizerBackgroundMode,
} from '@/components/visualizer/backgrounds/registry';
import { isBackgroundModeAvailable } from '@/components/visualizer/backgrounds/availability';

// test/unit/visualizer/backgroundRegistry.test.ts
// Locks the folder-discovered visualizer background registry contract.

describe('visualizer background registry', () => {
    it('auto-loads built-in backgrounds in stable order', () => {
        expect(VISUALIZER_BACKGROUND_REGISTRY.map(entry => entry.mode)).toEqual([
            'common',
            'monet',
            'nomand',
            'latent',
            'url',
            'video',
            'sora',
            'transparent',
        ]);
    });

    it('keeps background modes unique and renderable', () => {
        const modes = VISUALIZER_BACKGROUND_REGISTRY.map(entry => entry.mode);

        expect(new Set(modes).size).toBe(modes.length);
        expect(VISUALIZER_BACKGROUND_REGISTRY.every(entry => typeof entry.render === 'function')).toBe(true);
    });

    it('falls back to Latent for unknown lookups', () => {
        expect(DEFAULT_VISUALIZER_BACKGROUND_MODE).toBe('latent');
        expect(hasVisualizerBackgroundMode('nomand')).toBe(true);
        expect(hasVisualizerBackgroundMode('latent')).toBe(true);
        expect(hasVisualizerBackgroundMode('missing-mode')).toBe(false);
        expect(getVisualizerBackgroundRegistryEntry('missing-mode').mode).toBe('latent');
    });

    it('uses label fallback when translation is missing', () => {
        expect(getVisualizerBackgroundModeLabel('nomand', key => key)).toBe('Nomand');
        expect(getVisualizerBackgroundModeLabel('latent', key => key)).toBe('Latent');
    });

    it('gates the experimental video background behind both Shino Lab switches', () => {
        // 内建类型始终可选。
        expect(isBackgroundModeAvailable('latent', { bilibiliMvEnabled: false, videoPlaybackEnabled: false })).toBe(true);
        expect(isBackgroundModeAvailable('sora', { bilibiliMvEnabled: false, videoPlaybackEnabled: false })).toBe(true);
        // 「视频」需要视频播放（前置）与 bilibili MV 两项都开，缺一不可。
        expect(isBackgroundModeAvailable('video', { bilibiliMvEnabled: false, videoPlaybackEnabled: false })).toBe(false);
        expect(isBackgroundModeAvailable('video', { bilibiliMvEnabled: true, videoPlaybackEnabled: false })).toBe(false);
        expect(isBackgroundModeAvailable('video', { bilibiliMvEnabled: false, videoPlaybackEnabled: true })).toBe(false);
        expect(isBackgroundModeAvailable('video', { bilibiliMvEnabled: true, videoPlaybackEnabled: true })).toBe(true);
        // 注册表收得到 video，但两项没同时打开时选择器过滤后不含它。
        expect(VISUALIZER_BACKGROUND_REGISTRY.map(entry => entry.mode)).toContain('video');
        const modesWhenGatesOff = VISUALIZER_BACKGROUND_REGISTRY
            .filter(entry => isBackgroundModeAvailable(entry.mode, { bilibiliMvEnabled: false, videoPlaybackEnabled: false }))
            .map(entry => entry.mode);
        expect(modesWhenGatesOff).not.toContain('video');
        const modesWhenVideoOnOnly = VISUALIZER_BACKGROUND_REGISTRY
            .filter(entry => isBackgroundModeAvailable(entry.mode, { bilibiliMvEnabled: false, videoPlaybackEnabled: true }))
            .map(entry => entry.mode);
        expect(modesWhenVideoOnOnly).not.toContain('video');
        const modesWhenBothOn = VISUALIZER_BACKGROUND_REGISTRY
            .filter(entry => isBackgroundModeAvailable(entry.mode, { bilibiliMvEnabled: true, videoPlaybackEnabled: true }))
            .map(entry => entry.mode);
        expect(modesWhenBothOn).toContain('video');
    });

    it('resets only the active background settings without changing its mode', () => {
        const onModeChange = vi.fn();
        const onResetTuning = vi.fn();

        getVisualizerBackgroundRegistryEntry('nomand').resetSettings?.({
            onModeChange,
            nomand: { onResetTuning },
        });

        expect(onResetTuning).toHaveBeenCalledOnce();
        expect(onModeChange).not.toHaveBeenCalled();
    });
});
