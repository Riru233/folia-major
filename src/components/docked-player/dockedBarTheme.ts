import type { CSSProperties } from 'react';
import type { DockedBarAppearance } from '../../stores/usePlayerChromeSettingsStore';

// src/components/docked-player/dockedBarTheme.ts
// 停靠控制栏的两套配色。结构、图标、位置都不动，换的只有颜色：
// - dreamcore：原来那套（深色渐变底 + 蓝色玻璃播放键），浅色与深色沿用原来的颜色，
//   这两档只在封面底与进度条底上不同；
// - monet：底色和 Dreamcore 同构——底部有颜色、往上淡到全透明，只是那笔颜色换成莫奈的：
//   日间底边暖白、往上经淡紫，夜间底边黑、往上经深靛紫。
// DockedPlayerBar 只按这里的 tokens 上色，不再自己写死颜色。

export type DockedBarColors = {
    /** 底色用的 Tailwind 类：dreamcore 是那条黑色渐变；monet 的底色走 surfaceStyle。 */
    surfaceClassName: string;
    /** 底色与模糊。monet 在这里画几团色晕，dreamcore 留空。 */
    surfaceStyle: CSSProperties;
    textPrimary: string;
    textSecondary: string;
    /** 歌手名比歌名淡一档；莫奈把淡调在颜色里，不再叠一层 opacity。 */
    artistFadeClass: string;
    /** 时长同理，原来比歌手名再淡一点。 */
    timeFadeClass: string;
    /** 歌名那一块的字影：压在画面上的一律是深色栏，浅色栏不需要。 */
    titleTextShadow: string;
    iconFill: string;
    /** 图标自己的投影（让白图标在亮画面上也看得清）；monet 的深色图标不需要。 */
    iconStyle: CSSProperties | undefined;
    /** 图标按钮悬停时的底色。 */
    iconButtonHoverClass: string;
    /** 侧边面板按钮处于展开态时的底色。 */
    panelToggleActiveColor: string;
    playButtonStyle: CSSProperties;
    playIconStyle: CSSProperties | undefined;
    coverStyle: CSSProperties;
    progressFill: string;
    progressTrack: string;
    /** 音量滑杆的 accent-color。 */
    accent: string;
};

/**
 * 原来那套外观。这里的每个值都与改名之前 DockedPlayerBar 里写的一致，
 * 所以「Dreamcore」不论浅色还是深色都还是原来那个样子（这两档只在封面底与进度条底上不同）。
 */
const dreamcoreColors = (
    isDaylight: boolean,
    primaryColor: string,
    secondaryColor: string,
): DockedBarColors => ({
    surfaceClassName: 'bg-gradient-to-t from-[#000]/60 to-transparent',
    surfaceStyle: {},
    textPrimary: primaryColor,
    textSecondary: secondaryColor,
    artistFadeClass: 'opacity-50',
    timeFadeClass: 'opacity-60',
    titleTextShadow: '0 0px 4px #000, 0 0px 4px #000',
    iconFill: '#fff',
    iconStyle: { filter: 'drop-shadow(0 0 1px #000)' },
    iconButtonHoverClass: 'hover:bg-white/10',
    panelToggleActiveColor: isDaylight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.14)',
    playButtonStyle: {
        background: 'linear-gradient(to bottom, #9cafd788, #316faf88, #47cbfa88)',
        color: '#fff',
        borderTop: '#fffa 1px solid',
        borderBottom: '#fffa 1px solid',
        outline: '#666 1px solid',
    },
    playIconStyle: { filter: 'drop-shadow(0 0 1px #000)' },
    coverStyle: {
        backgroundColor: isDaylight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)',
    },
    progressFill: primaryColor,
    progressTrack: isDaylight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.12)',
    accent: primaryColor,
});

const monetColors = (isDaylight: boolean): DockedBarColors => ({
            surfaceClassName: '',
            surfaceStyle: {
                // 和 Dreamcore 同构：底部有颜色、往上淡到全透明，不铺满整条栏。
                // 日间底边是暖白（和播放键同一笔），往上过渡到一层淡紫，到顶全透明。
                backgroundImage: 'linear-gradient(to top, var(--bg-color) 28%, transparent 100%)',
            },
            textPrimary: 'var(--text-primary)',
            textSecondary: 'var(--text-secondary)',
            artistFadeClass: '',
            timeFadeClass: '',
            titleTextShadow: 'none',
            iconFill: 'var(--text-primary)',
            iconStyle: undefined,
            iconButtonHoverClass: 'hover:bg-black/10',
            panelToggleActiveColor: 'var(--text-secondary)',
            playButtonStyle: {
                // 播放键仍是液态玻璃（标记和 useGlass 都在），底色是一条竖向渐变：
                // 底部暖白、往上淡到全透明；边框、阴影、outline 与 Dreamcore 一致。
                background: 'var(--text-accent)',
                color: '#fff',
                borderTop: '#fffa 1px solid',
                borderBottom: '#fffa 1px solid',
                outline: '#666 1px solid',
                opacity: 1
            },
            playIconStyle: undefined,
            coverStyle: {
                backgroundColor: 'rgba(255,255,255,0.4)',
                boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.55)',
            },
            progressFill: 'var(--text-accent)',
            progressTrack: 'var(--scrollbar-track)',
            accent: 'var(--text-primary)',
        }
);

/**
 * 停靠栏当前该用的颜色。`primaryColor` / `secondaryColor` 是 App 给的那两个主题色，
 * 只有 Dreamcore 用它们（原来就是这样）；莫奈自带一套，不受主题色影响。
 */
export const resolveDockedBarColors = (
    appearance: DockedBarAppearance,
    isDaylight: boolean,
    primaryColor: string,
    secondaryColor: string,
): DockedBarColors => (
    appearance === 'monet'
        ? monetColors(isDaylight)
        : dreamcoreColors(isDaylight, primaryColor, secondaryColor)
);
