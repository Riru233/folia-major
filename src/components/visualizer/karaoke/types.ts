// src/components/visualizer/karaoke/types.ts
// 卡拉OK 的参数：未唱 / 已唱两部分各自的字色和描边色、描边宽度，字号、字体与字重，
// 以及「预备进度」怎么长出来（扫过 / 淡入 / 整块跳变）。

/** 字体样式：跟随主题，或者在这一句上改用主题自带的三种字体之一。 */
export type KaraokeFontStyle = 'theme' | 'sans' | 'serif' | 'mono';

/** 预备进度样式：未唱的字怎么变成已唱的样子。 */
export type KaraokeProgressStyle = 'sweep' | 'fade' | 'jump';

/** 这一句放不下时怎么办：横向滚动跟唱，或者折行（折行后竖直跟唱）。 */
export type KaraokeOverflowMode = 'scroll' | 'wrap';

export interface KaraokeTuning {
    /** 已唱部分的文字颜色（默认标准蓝）。 */
    activeFill: string;
    /** 已唱部分的描边颜色（默认白）。 */
    activeStroke: string;
    /** 未唱部分的文字颜色（默认白）。 */
    idleFill: string;
    /** 未唱部分的描边颜色（默认黑）。 */
    idleStroke: string;
    /** 描边宽度，屏幕像素；0 就是不描边。 */
    strokeWidth: number;
    /** 这一句的字号倍率，乘在全局歌词字号上。 */
    fontScale: number;
    /** 字体样式：跟随主题或换成主题的某一套字体。 */
    fontStyle: KaraokeFontStyle;
    /** 字重，100–900。 */
    fontWeight: number;
    /** 斜体。 */
    italic: boolean;
    /** 中文歌词按繁体显示（简转繁）。日文假名、韩文、英文那一行原样不动。 */
    traditionalScript: boolean;
    /** 未唱的字变成已唱的样子用哪种方式。 */
    progressStyle: KaraokeProgressStyle;
    /** 翻页（换到下一组两句）时要不要那条淡入上浮的动画；关掉就是硬切。 */
    pageAnimation: boolean;
    /** 一句放不下时：滚动（不折行，横向跟唱）还是换行（折行，竖直跟唱）。 */
    overflowMode: KaraokeOverflowMode;
}

export const DEFAULT_KARAOKE_TUNING: KaraokeTuning = {
    activeFill: '#0000ff',
    activeStroke: '#ffffff',
    idleFill: '#ffffff',
    idleStroke: '#000000',
    strokeWidth: 3,
    fontScale: 1,
    fontStyle: 'theme',
    fontWeight: 800,
    italic: false,
    traditionalScript: false,
    progressStyle: 'sweep',
    pageAnimation: true,
    overflowMode: 'scroll',
};
