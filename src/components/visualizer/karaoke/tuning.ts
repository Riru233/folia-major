import { defineVisualizerTuning, modChoice, modNumber, MOD_SWITCH, numberWithin, type StoredTuningFields } from '../tuningDefinition';
import {
    DEFAULT_KARAOKE_TUNING,
    type KaraokeFontStyle,
    type KaraokeOverflowMode,
    type KaraokeProgressStyle,
    type KaraokeTuning,
} from './types';

// src/components/visualizer/karaoke/tuning.ts
// 卡拉OK 的参数：默认值、它住在设置 store 的哪三个字段、存到哪个键、怎么读回来，
// 以及渲染器怎么拿到它（entry 用 read() 取，所以这里不写 apply）。

declare module '../tuningDefinition' {
    interface VisualizerTuningSettings extends StoredTuningFields<'karaokeTuning', 'handleSetKaraokeTuning', 'handleResetKaraokeTuning', KaraokeTuning> {}
}

/** 描边宽度的上下限（屏幕像素）。上限给到 10 是为了粗体大字在远处也看得见轮廓。 */
export const KARAOKE_STROKE_MIN = 0;
export const KARAOKE_STROKE_MAX = 10;
/** 字号倍率的上下限：下限还能看清，上限不至于一行只放得下两个字。 */
export const KARAOKE_FONT_SCALE_MIN = 0.5;
export const KARAOKE_FONT_SCALE_MAX = 2;
/** 预备交叉时间的下限（秒）：0 关掉预备点。上限不设——前奏多长都能填，具体到歌的值存在 useKaraokeLeadInStore。 */
export const KARAOKE_LEAD_IN_MIN = 0;
/** Folium 调参面板给交叉时间的量程上限（秒）：60 秒够长前奏了；存下来的值不受这个数限制。 */
export const KARAOKE_LEAD_IN_MOD_MAX = 60;
/** 消失间隔的范围（秒）：上限给到和交叉时间一样长，实际渲染再按「交叉时间 / 3」收窄。 */
export const KARAOKE_LEAD_IN_GAP_MIN = 0.1;
export const KARAOKE_LEAD_IN_GAP_MAX = 10;

const FONT_STYLES: readonly KaraokeFontStyle[] = ['theme', 'sans', 'serif', 'mono'];
const PROGRESS_STYLES: readonly KaraokeProgressStyle[] = ['sweep', 'fade', 'jump'];
const OVERFLOW_MODES: readonly KaraokeOverflowMode[] = ['scroll', 'wrap'];

/** #rgb / #rrggbb / #rrggbbaa 都收；不是这种写法的（含旧版本可能留下的空值）落回默认色。 */
const hexColor = (value: unknown, fallback: string) => (
    typeof value === 'string' && /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value.trim())
        ? value.trim()
        : fallback
);

const oneOf = <T extends string>(value: unknown, options: readonly T[], fallback: T): T => (
    typeof value === 'string' && (options as readonly string[]).includes(value) ? value as T : fallback
);

/** 字重落到 100 的整数倍上，夹在 100–900。 */
const fontWeight = (value: unknown, fallback: number) => (
    typeof value === 'number' && Number.isFinite(value)
        ? Math.min(900, Math.max(100, Math.round(value / 100) * 100))
        : fallback
);

/** 一份存盘值或改动合出来的完整参数：缺的、超范围的、写错的都换成一个能画的值。 */
export const normalizeKaraokeTuning = (value: Partial<KaraokeTuning> | null | undefined): KaraokeTuning => {
    const stored = value ?? {};
    return {
        activeFill: hexColor(stored.activeFill, DEFAULT_KARAOKE_TUNING.activeFill),
        activeStroke: hexColor(stored.activeStroke, DEFAULT_KARAOKE_TUNING.activeStroke),
        idleFill: hexColor(stored.idleFill, DEFAULT_KARAOKE_TUNING.idleFill),
        idleStroke: hexColor(stored.idleStroke, DEFAULT_KARAOKE_TUNING.idleStroke),
        strokeWidth: numberWithin(stored.strokeWidth, DEFAULT_KARAOKE_TUNING.strokeWidth, KARAOKE_STROKE_MIN, KARAOKE_STROKE_MAX),
        fontScale: numberWithin(stored.fontScale, DEFAULT_KARAOKE_TUNING.fontScale, KARAOKE_FONT_SCALE_MIN, KARAOKE_FONT_SCALE_MAX),
        fontStyle: oneOf(stored.fontStyle, FONT_STYLES, DEFAULT_KARAOKE_TUNING.fontStyle),
        fontWeight: fontWeight(stored.fontWeight, DEFAULT_KARAOKE_TUNING.fontWeight),
        italic: typeof stored.italic === 'boolean' ? stored.italic : DEFAULT_KARAOKE_TUNING.italic,
        traditionalScript: typeof stored.traditionalScript === 'boolean'
            ? stored.traditionalScript
            : DEFAULT_KARAOKE_TUNING.traditionalScript,
        // 交叉时间不设上限，只要是个非负的有限数就收：前奏二十秒的歌也填得进去。
        leadInSeconds: (() => {
            const storedSeconds = stored.leadInSeconds;
            return typeof storedSeconds === 'number' && Number.isFinite(storedSeconds) && storedSeconds >= KARAOKE_LEAD_IN_MIN
                ? storedSeconds
                : DEFAULT_KARAOKE_TUNING.leadInSeconds;
        })(),
        leadInGapSeconds: numberWithin(
            stored.leadInGapSeconds,
            DEFAULT_KARAOKE_TUNING.leadInGapSeconds,
            KARAOKE_LEAD_IN_GAP_MIN,
            KARAOKE_LEAD_IN_GAP_MAX,
        ),
        progressStyle: oneOf(stored.progressStyle, PROGRESS_STYLES, DEFAULT_KARAOKE_TUNING.progressStyle),
        pageAnimation: typeof stored.pageAnimation === 'boolean' ? stored.pageAnimation : DEFAULT_KARAOKE_TUNING.pageAnimation,
        overflowMode: oneOf(stored.overflowMode, OVERFLOW_MODES, DEFAULT_KARAOKE_TUNING.overflowMode),
    };
};

export default defineVisualizerTuning<KaraokeTuning>({
    mode: 'karaoke',
    defaults: DEFAULT_KARAOKE_TUNING,
    // 颜色是自由取值的十六进制，没有可校验的区间，所以只公开这几项。
    modKeys: {
        strokeWidth: modNumber(KARAOKE_STROKE_MIN, KARAOKE_STROKE_MAX, 0.5),
        fontScale: modNumber(KARAOKE_FONT_SCALE_MIN, KARAOKE_FONT_SCALE_MAX),
        fontStyle: modChoice(FONT_STYLES),
        fontWeight: modNumber(100, 900, 100),
        italic: MOD_SWITCH,
        traditionalScript: MOD_SWITCH,
        leadInSeconds: modNumber(KARAOKE_LEAD_IN_MIN, KARAOKE_LEAD_IN_MOD_MAX, 0.5),
        leadInGapSeconds: modNumber(KARAOKE_LEAD_IN_GAP_MIN, KARAOKE_LEAD_IN_GAP_MAX, 0.1),
        progressStyle: modChoice(PROGRESS_STYLES),
        pageAnimation: MOD_SWITCH,
        overflowMode: modChoice(OVERFLOW_MODES),
    },
    settingsKey: 'karaokeTuning',
    settingsSetterKey: 'handleSetKaraokeTuning',
    settingsResetterKey: 'handleResetKaraokeTuning',
    storage: {
        key: 'karaoke_tuning',
        // 读回和合并走同一套兜底：滑块拖动、导入、同步、Folium 改出来的值都落在合法范围内。
        read: stored => normalizeKaraokeTuning(stored),
        merge: (held, patch) => normalizeKaraokeTuning({ ...held, ...patch }),
        resetNotice: 'notifications.karaokeReset',
    },
});
