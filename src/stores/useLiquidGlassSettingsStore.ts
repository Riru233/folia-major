import { create } from 'zustand';
import {
    LIQUID_GLASS_DEFAULTS,
    LIQUID_GLASS_STORAGE_KEYS,
    applyLiquidGlassParams,
    clampLiquidGlassParam,
    readStoredLiquidGlassParams,
    type LiquidGlassParams,
} from '../shinoinject/liquidglass';

// src/stores/useLiquidGlassSettingsStore.ts
// 液态玻璃的四个全局参数：折射强度 strength、模糊 blur、饱和度 sat、最大弯曲距离 bend（见 src/mods/liquidglass.ts）。
// 默认值与读回都定义在 liquidglass.ts（它的 global 是运行时实际生效的那份），这里只负责
// 持久化、钳制后的 state 和 setter；setter 同步调 applyLiquidGlassParams 让在场的玻璃立刻重画。

const persistParam = (key: string, value: number) => {
    if (typeof window !== 'undefined') {
        localStorage.setItem(key, String(value));
    }
};

export type LiquidGlassSettingsState = LiquidGlassParams & {
    handleSetLiquidGlassStrength: (value: number) => void;
    handleSetLiquidGlassBlur: (value: number) => void;
    handleSetLiquidGlassSat: (value: number) => void;
    handleSetLiquidGlassBend: (value: number) => void;
    /** 整组写入：导入外观配置时一次应用全部参数，落库与刷新各走一次。 */
    handleSetLiquidGlassParams: (patch: Partial<LiquidGlassParams>) => void;
    resetLiquidGlassParams: () => void;
};

export const useLiquidGlassSettingsStore = create<LiquidGlassSettingsState>((set, get) => {
    // 一次写入：钳制 → 落 localStorage → 更新 state → 重刷已挂玻璃。
    const commit = (patch: Partial<LiquidGlassParams>) => {
        const next: LiquidGlassParams = {
            strength: patch.strength !== undefined
                ? clampLiquidGlassParam('strength', patch.strength)
                : get().strength,
            blur: patch.blur !== undefined
                ? clampLiquidGlassParam('blur', patch.blur)
                : get().blur,
            sat: patch.sat !== undefined
                ? clampLiquidGlassParam('sat', patch.sat)
                : get().sat,
            bend: patch.bend !== undefined
                ? clampLiquidGlassParam('bend', patch.bend)
                : get().bend,
        };
        set(next);
        persistParam(LIQUID_GLASS_STORAGE_KEYS.strength, next.strength);
        persistParam(LIQUID_GLASS_STORAGE_KEYS.blur, next.blur);
        persistParam(LIQUID_GLASS_STORAGE_KEYS.sat, next.sat);
        persistParam(LIQUID_GLASS_STORAGE_KEYS.bend, next.bend);
        applyLiquidGlassParams(next);
    };

    return {
        ...readStoredLiquidGlassParams(),
        handleSetLiquidGlassStrength: (value) => commit({ strength: value }),
        handleSetLiquidGlassBlur: (value) => commit({ blur: value }),
        handleSetLiquidGlassSat: (value) => commit({ sat: value }),
        handleSetLiquidGlassBend: (value) => commit({ bend: value }),
        handleSetLiquidGlassParams: (patch) => commit(patch),
        resetLiquidGlassParams: () => commit({ ...LIQUID_GLASS_DEFAULTS }),
    };
});
