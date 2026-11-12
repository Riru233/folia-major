import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveDockedBarColors } from '../../../src/components/docked-player/dockedBarTheme';

// test/unit/components/dockedBarTheme.test.ts
// 停靠控制栏两套配色的约定：Dreamcore 就是改名之前那套颜色（浅色与深色只在封面底和进度条底上不同），
// 莫奈只从应用主题变量里取色（--bg-color / --text-primary / --text-accent / --text-on-accent），
// 因此白天黑夜由主题自己切换，不再各写一套。两套的播放键都保留液态玻璃。

describe('docked bar colours', () => {
    it('leaves Dreamcore as it was in both modes', () => {
        const light = resolveDockedBarColors('dreamcore', true, '#fff', '#fffa');
        const dark = resolveDockedBarColors('dreamcore', false, '#fff', '#fffa');
        expect(light.surfaceClassName).toBe('bg-gradient-to-t from-[#000]/60 to-transparent');
        expect(dark.surfaceClassName).toBe(light.surfaceClassName);
        expect(light.surfaceStyle).toEqual({});
        expect(light.textPrimary).toBe('#fff');
        expect(light.textSecondary).toBe('#fffa');
        expect(light.iconFill).toBe('#fff');
        expect(light.iconStyle).toEqual({ filter: 'drop-shadow(0 0 1px #000)' });
        expect(light.iconButtonHoverClass).toBe('hover:bg-white/10');
        expect(light.titleTextShadow).not.toBe('none');
        expect(light.playButtonStyle.background).toContain('#9cafd788');
        expect(light.playButtonStyle.borderTop).toBe('#fffa 1px solid');
        expect(light.playButtonStyle.outline).toBe('#666 1px solid');
        expect(light.coverStyle.backgroundColor).toBe('rgba(0,0,0,0.06)');
        expect(dark.coverStyle.backgroundColor).toBe('rgba(255,255,255,0.08)');
        expect(light.progressFill).toBe('#fff');
        expect(light.progressTrack).toBe('rgba(0,0,0,0.08)');
        expect(dark.progressTrack).toBe('rgba(255,255,255,0.12)');
        expect(light.accent).toBe('#fff');
        expect(light.artistFadeClass).toBe('opacity-50');
        expect(light.timeFadeClass).toBe('opacity-60');
        expect(light.panelToggleActiveColor).toBe('rgba(0,0,0,0.08)');
        expect(dark.panelToggleActiveColor).toBe('rgba(255,255,255,0.14)');
    });

    it('paints Monet from the app theme variables instead of its own colours', () => {
        const light = resolveDockedBarColors('monet', true, '#123456', '#abcdef');
        const dark = resolveDockedBarColors('monet', false, '#123456', '#abcdef');
        // 前景 / 背景 / 强调 / 强调上的文字，全部来自主题变量：白天黑夜由主题自己换。
        expect(light.surfaceStyle.backgroundImage).toContain('var(--bg-color)');
        expect(light.textPrimary).toBe('var(--text-primary)');
        expect(light.iconFill).toBe('var(--text-primary)');
        expect(light.playButtonStyle.background).toBe('var(--text-accent)');
        expect(light.playButtonStyle.color).toBe('var(--text-on-accent)');
        expect(light.progressFill).toBe('var(--text-accent)');
        // 面板传入的两个主题色不参与：莫奈读的是 CSS 变量，不是这里的 hex。
        expect(light.textPrimary).not.toBe('#123456');
        expect(dark.textPrimary).not.toBe('#123456');
        // 不按日夜各写一套：同一套变量，两档结果自然相同。
        expect(light).toEqual(dark);
    });

    it('lays the Monet bar out like Dreamcore: colour at the bottom, clear at the top', () => {
        const colors = resolveDockedBarColors('monet', true, '#fff', '#fff');
        const background = String(colors.surfaceStyle.backgroundImage);
        expect(background.startsWith('linear-gradient(to top,')).toBe(true);
        expect(background.endsWith('transparent 100%)')).toBe(true);
        // 整条栏不再铺满：没有底色块、模糊或投影，和 Dreamcore 一样只有那层渐变。
        expect(colors.surfaceStyle.backgroundColor).toBeUndefined();
        expect(colors.surfaceStyle.backdropFilter).toBeUndefined();
        expect(colors.surfaceStyle.boxShadow).toBeUndefined();
    });

    it('keeps the glass play button, drawn with the accent and the colour that reads on it', () => {
        const light = resolveDockedBarColors('monet', true, '#fff', '#fff');
        const dreamcore = resolveDockedBarColors('dreamcore', true, '#fff', '#fffa');
        // 底色是强调色，上面的图标读 --text-on-accent（强调色可能很浅，白字会看不见）。
        expect(String(light.playButtonStyle.background)).toBe('var(--text-accent)');
        expect(light.playButtonStyle.color).toBe('var(--text-on-accent)');
        // 边框、阴影、outline 与 Dreamcore 一致。
        expect(light.playButtonStyle.borderTop).toBe(dreamcore.playButtonStyle.borderTop);
        expect(light.playButtonStyle.borderBottom).toBe(dreamcore.playButtonStyle.borderBottom);
        expect(light.playButtonStyle.outline).toBe(dreamcore.playButtonStyle.outline);
        expect(light.playButtonStyle.boxShadow).toBeUndefined();
    });

    it('leaves the play button on the liquid glass path', () => {
        const source = readFileSync(
            path.resolve(__dirname, '../../../src/components/docked-player/DockedPlayerBar.tsx'),
            'utf8',
        );
        expect(source).toContain('data-glass data-glass-jelly');
        expect(source).toContain('useGlass()');
        expect(source).toContain('style={colors.playButtonStyle}');
    });
});
