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
    /**
     * 预备交叉时间（秒）：开头那三个预备点在这个倒数窗里依次消失，交叉时间之前只放歌名和信息。
     * 这里存的是全局值，单首歌改过的值存在 useKaraokeLeadInStore。0 就是不要预备点。
     */
    leadInSeconds: number;
    /**
     * 消失间隔（秒）：相邻两个预备点消失之间隔多久。
     * 三个点都赶在交叉时间结束前走完，所以间隔最多是交叉时间的三分之一。
     */
    leadInGapSeconds: number;
    /**
     * 预备点的直径，屏幕像素：三个圆一样大，直接给尺寸而不是倍率。
     * 不跟着歌词字号走；白色边框固定宽度，不随点变大变小。
     */
    leadInDotSize: number;
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
    leadInSeconds: 3,
    leadInGapSeconds: 1,
    leadInDotSize: 10,
    progressStyle: 'sweep',
    pageAnimation: true,
    overflowMode: 'scroll',
};
