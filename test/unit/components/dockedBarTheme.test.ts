import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveDockedBarColors } from '../../../src/components/docked-player/dockedBarTheme';

// test/unit/components/dockedBarTheme.test.ts
// 停靠控制栏两套配色的约定：Dreamcore 就是改名之前那套颜色（浅色与深色只在封面底和进度条底上不同），
// 莫奈浅色深色各一套；两套的播放键都保留液态玻璃，区别只在底下的竖向渐变。

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

    it('gives Monet a palette for each mode and ignores the theme colours it is handed', () => {
        const light = resolveDockedBarColors('monet', true, '#123456', '#abcdef');
        const dark = resolveDockedBarColors('monet', false, '#123456', '#abcdef');
        expect(light.surfaceClassName).toBe('');
        expect(light.surfaceStyle.backgroundImage).not.toBe(dark.surfaceStyle.backgroundImage);
        expect(light.textPrimary).not.toBe(dark.textPrimary);
        expect(light.progressFill).not.toBe(dark.progressFill);
        expect(light.textPrimary).not.toBe('#123456');
        expect(dark.textPrimary).not.toBe('#123456');
    });

    it('lays the Monet bar out like Dreamcore: colour at the bottom, clear at the top', () => {
        for (const isDaylight of [true, false]) {
            const colors = resolveDockedBarColors('monet', isDaylight, '#fff', '#fff');
            const background = String(colors.surfaceStyle.backgroundImage);
            expect(background.startsWith('linear-gradient(to top,')).toBe(true);
            expect(background.endsWith(',0) 100%)')).toBe(true);
            // 整条栏不再铺满：没有底色块、模糊或投影，和 Dreamcore 一样只有那层渐变。
            expect(colors.surfaceStyle.backgroundColor).toBeUndefined();
            expect(colors.surfaceStyle.backdropFilter).toBeUndefined();
            expect(colors.surfaceStyle.boxShadow).toBeUndefined();
        }
        // 底边那一笔：日间暖白、夜间黑，和播放键用的是同一笔颜色。
        expect(String(resolveDockedBarColors('monet', true, '#fff', '#fff').surfaceStyle.backgroundImage))
            .toContain('rgba(252,246,236,0.94) 0%');
        expect(String(resolveDockedBarColors('monet', false, '#fff', '#fff').surfaceStyle.backgroundImage))
            .toContain('rgba(0,0,0,0.92) 0%');
    });

    it('keeps the glass play button and lays a bar-colour-to-transparent gradient under it', () => {
        const light = resolveDockedBarColors('monet', true, '#fff', '#fff');
        const dark = resolveDockedBarColors('monet', false, '#fff', '#fff');
        // 从下往上：底部日间暖白、夜间黑色，顶上透明。
        expect(String(light.playButtonStyle.background))
            .toBe('linear-gradient(to top, rgba(252,246,236,0.92), rgba(252,246,236,0))');
        expect(String(dark.playButtonStyle.background))
            .toBe('linear-gradient(to top, rgba(0,0,0,0.88), rgba(0,0,0,0))');
        // 液态玻璃还在：播放键上的文字色是莫奈自己的，不是纯白。
        expect(light.playButtonStyle.color).toBe('#3a3155');
        expect(dark.playButtonStyle.color).toBe('#f4eee7');
        // 边框、阴影、outline 与 Dreamcore 一致。
        const dreamcore = resolveDockedBarColors('dreamcore', true, '#fff', '#fffa');
        for (const colors of [light, dark]) {
            expect(colors.playButtonStyle.borderTop).toBe(dreamcore.playButtonStyle.borderTop);
            expect(colors.playButtonStyle.borderBottom).toBe(dreamcore.playButtonStyle.borderBottom);
            expect(colors.playButtonStyle.outline).toBe(dreamcore.playButtonStyle.outline);
            expect(colors.playButtonStyle.boxShadow).toBeUndefined();
        }
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
