// src/library/suites/grid/home/homeSurfaceMotion.ts
// 首页各级页签切换共用的「接力放大」过渡：
// - 旧层：scale 1 → 1.1 同时淡出（消散）；
// - 新层：scale 0.9 → 1（放大到原位），与旧层同时进行，两段共用同一条弹簧，像同一次镜头推进。
// 隐身层（既非活动、也没在退场）停在 0.9 / 透明——下次被激活时就是从 0.9 长到 1，而不是从 1.1 缩回来。
// 一级页签（Grid3D）和本地 sections（LocalGrid3DView）用同一组参数，切起来手感一致。

export const HOME_SURFACE_HIDDEN_SCALE = 0.9;
export const HOME_SURFACE_EXIT_SCALE = 1.1;

// 弹簧而不是定时曲线：中途换页签时目标值一变，动画从当前值接着走，天然可打断、不会跳帧。
// 透明度单给一条短 tween——弹簧回弹时透明度跟着抖会显得脏。
export const HOME_SURFACE_TRANSITION = {
    scale: { type: 'spring' as const, stiffness: 280, damping: 30, mass: 0.9 },
    opacity: { duration: 0.26, ease: [0.22, 1, 0.36, 1] as const },
};

/** 某层的动画目标：活动层停原位，退场层放大消散，隐身层停在缩小位。 */
export const homeSurfaceLayerMotion = (isActive: boolean, isExiting: boolean) => {
    if (isActive) return { scale: 1, opacity: 1 };
    if (isExiting) return { scale: HOME_SURFACE_EXIT_SCALE, opacity: 0 };
    return { scale: HOME_SURFACE_HIDDEN_SCALE, opacity: 0 };
};
