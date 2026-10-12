import { isWindowsPlatform } from "@/utils/platform";
/*
   液态玻璃
  */
let uid = 0;
const SVGNS = "http://www.w3.org/2000/svg";
// 默认参数：出厂值就是这里，设置面板（useLiquidGlassSettingsStore）的兜底也读它。
const global = { strength: 2.25, blur: 2, sat: 160 };
export type LiquidGlassParams = typeof global;
export const LIQUID_GLASS_DEFAULTS: LiquidGlassParams = { ...global };
// 边缘扭曲（位移滤镜）与饱和度只有 Windows 平台才支持：非 Windows 上不建 <filter>，
// backdrop-filter 不带 url(#lg-N) 也不写 saturate()，strength/sat 同时钉死不可调，blur 照常。
export const LIQUID_GLASS_DISTORTION_SUPPORTED = isWindowsPlatform;
// localStorage 键：面板读写同一组键；本模块启动时自行读回，
// 保证设置面板还没被打开（store 尚未被 import）时玻璃也用的是用户调过的参数。
export const LIQUID_GLASS_STORAGE_KEYS = {
  strength: "liquidglass_strength",
  blur: "liquidglass_blur",
  sat: "liquidglass_sat",
} as const;
// 每个参数的量程：设置面板的滑杆和钳制共用同一份，UI 不会调出存不下的值。
export const LIQUID_GLASS_PARAM_BOUNDS: Record<keyof LiquidGlassParams, { min: number; max: number }> = {
  strength: { min: 0, max: 6 },
  blur: { min: 0, max: 12 },
  sat: { min: 0, max: 300 },
};
const clamp = (v: number, a: number, b: number) => Math.min(Math.max(v, a), b);
// 每个参数各自钳到自己的量程；非有限值（含缺失键）回落到默认值。
// 非 Windows 平台边缘扭曲与饱和度不存在可调空间：读回、设置面板、外观导入三条路径都走这里，
// 统一钉回固定值，state / localStorage / 实际渲染不会各说各话。
export const clampLiquidGlassParam = <K extends keyof LiquidGlassParams>(key: K, value: number) => {
  if (!LIQUID_GLASS_DISTORTION_SUPPORTED && key === "strength") return LIQUID_GLASS_DEFAULTS.strength;
  if (!LIQUID_GLASS_DISTORTION_SUPPORTED && key === "sat") return 1;
  const { min, max } = LIQUID_GLASS_PARAM_BOUNDS[key];
  return Number.isFinite(value) ? clamp(value, min, max) : LIQUID_GLASS_DEFAULTS[key];
};
const readStoredParam = (key: keyof LiquidGlassParams) => {
  if (typeof window === "undefined") return LIQUID_GLASS_DEFAULTS[key];
  const saved = localStorage.getItem(LIQUID_GLASS_STORAGE_KEYS[key]);
  return saved === null ? LIQUID_GLASS_DEFAULTS[key] : clampLiquidGlassParam(key, parseFloat(saved));
};
// 读回持久化值；store 的初始状态也走这里，两边永远一致。
export const readStoredLiquidGlassParams = (): LiquidGlassParams => ({
  strength: readStoredParam("strength"),
  blur: readStoredParam("blur"),
  sat: readStoredParam("sat"),
});
Object.assign(global, readStoredLiquidGlassParams());
const smoothStep = (a: number, b: number, t: number) => {
  t = clamp((t - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const roundedRectSDF = (
  x: number,
  y: number,
  hw: number,
  hh: number,
  r: number,
) => {
  const qx = Math.abs(x) - hw + r,
    qy = Math.abs(y) - hh + r;
  return (
    Math.min(Math.max(qx, qy), 0) +
    Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) -
    r
  );
};
// 玻璃滤镜统一挂在一个 <defs> 里。优先用 useGlass.tsx 渲染的 <defs id="filter-defs">（App 根常驻、
// 全应用一份，别的代码也往这一处注入）；它不在时回落到本模块自持的 <defs>，自持的只建一次且始终在文档内。
// 两者都靠 url(#lg-N) 按 id 解析，滤镜只要没被摘掉就能解析，所以回落不影响已有玻璃。
let ownDefs: SVGDefsElement | null = null;
const getDefs = () => {
  const shared = document.querySelector<SVGDefsElement>("#filter-defs");
  if (shared) return shared;
  if (ownDefs && ownDefs.isConnected) return ownDefs;
  const svg = document.createElementNS(SVGNS, "svg");
  svg.setAttribute("width", "0");
  svg.setAttribute("height", "0");
  svg.setAttribute("aria-hidden", "true");
  svg.style.position = "absolute";
  const defs = document.createElementNS(SVGNS, "defs");
  svg.append(defs);
  document.documentElement.append(svg);
  ownDefs = defs;
  return defs;
};

type Glass = {
  el: HTMLElement;
  // 非 Windows 平台不建扭曲滤镜，这三个为空；update 据此跳过位移图并写纯 blur 的 backdrop。
  filter: SVGFilterElement | null;
  feImage: SVGFEImageElement | null;
  feDisp: SVGFEDisplacementMapElement | null;
  id: string;
  bezelFrac: number;
  strength: number;
  zoom: number;
  update(): void;
};
// 同一元素只允许建一次玻璃：调用点写在组件渲染体里，每次渲染都会再跑一遍，
// 不去重就会反复换 backdrop-filter 的 id（旧 id 悬空 → 玻璃消失 → 频闪）并泄漏 observer。
const glasses = new WeakMap<HTMLElement, Glass>();
const buildDisplacementMap = (
  w: number,
  h: number,
  radius: number,
  bezel: number,
  strength: number,
  zoom: number,
) => {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  // 位移图必须有 2d context 才画得出来，拿不到就直接失败，别静默产出空滤镜。
  if (!ctx) throw new Error("[liquidglass] 2d canvas context unavailable");
  const img = ctx.createImageData(w, h);
  const raw = new Float32Array(w * h * 2);
  let maxD = 0.0001;
  const hw = w / 2,
    hh = h / 2;
  const k = strength * global.strength; // 边缘折射位移上限（px）由 bezel 决定

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const cx = x + 0.5 - hw,
        cy = y + 0.5 - hh;
      const d = roundedRectSDF(cx, cy, hw, hh, radius);
      let m = smoothStep(-bezel, 0, d); // 0=深处 → 1=边缘
      m = m * m; // 平滑衰减，中心几乎无形变
      const len = Math.hypot(cx, cy) || 1;
      // 边缘折射（幅度与元素大小无关）+ 整体放大（放大镜模式）
      const dx = -(cx / len) * m * k * bezel - cx * zoom;
      const dy = -(cy / len) * m * k * bezel - cy * zoom;
      const i = (y * w + x) * 2;
      raw[i] = dx;
      raw[i + 1] = dy;
      maxD = Math.max(maxD, Math.abs(dx), Math.abs(dy));
    }
  }
  const scale = maxD * 2;
  const data = img.data;
  for (let i = 0, p = 0; i < raw.length; i += 2, p += 4) {
    data[p] = clamp(raw[i] / scale + 0.5, 0, 1) * 255; // R → X
    data[p + 1] = clamp(raw[i + 1] / scale + 0.5, 0, 1) * 255; // G → Y
    data[p + 2] = 128;
    data[p + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return { url: canvas.toDataURL(), scale };
};

// 给元素挂液态玻璃滤镜（幂等）：同一元素只建一次，滤镜同步进文档，
// 保证 backdrop-filter 写下的 url(#lg-N) 立即可解析，不存在悬空引用窗口。
// 非 Windows 平台只登记玻璃记录、不建滤镜，backdrop 只剩 blur。
export const makeGlass = (el: HTMLElement) => {
  const existing = glasses.get(el);
  if (existing) return existing;
  const id = "lg-" + uid++;
  // 只有 Windows 才建位移滤镜；非 Windows 平台连 <filter> 都不落文档，url(#lg-N) 自然无从解析。
  let filter: SVGFilterElement | null = null;
  let feImage: SVGFEImageElement | null = null;
  let feDisp: SVGFEDisplacementMapElement | null = null;
  if (LIQUID_GLASS_DISTORTION_SUPPORTED) {
    const defs = getDefs();
    filter = document.createElementNS(SVGNS, "filter");
    filter.setAttribute("id", id);
    filter.setAttribute("filterUnits", "userSpaceOnUse");
    filter.setAttribute("color-interpolation-filters", "sRGB");
    feImage = document.createElementNS(SVGNS, "feImage");
    feImage.setAttribute("result", "map");
    feImage.setAttribute("preserveAspectRatio", "none");
    feDisp = document.createElementNS(SVGNS, "feDisplacementMap");
    feDisp.setAttribute("in", "SourceGraphic");
    feDisp.setAttribute("in2", "map");
    feDisp.setAttribute("xChannelSelector", "R");
    feDisp.setAttribute("yChannelSelector", "G");
    filter.append(feImage, feDisp);
    defs.appendChild(filter);
  }

  const g: Glass = {
    el,
    filter,
    feImage,
    feDisp,
    id,
    bezelFrac: parseFloat(el.dataset.bezel || "0.5"),
    strength: parseFloat(el.dataset.strength || "0.5"),
    zoom: parseFloat(el.dataset.zoom || "0"),
    update() {
      const w = Math.round(el.offsetWidth),
        h = Math.round(el.offsetHeight);
      if (!w || !h) return;
      const { filter: curFilter, feImage: curFeImage, feDisp: curFeDisp } = this;
      // 非 Windows 平台没有扭曲滤镜：整段位移图（逐像素画 canvas）直接跳过。
      if (curFilter && curFeImage && curFeDisp) {
        const cs = getComputedStyle(el);
        let radius = parseFloat(cs.borderRadius) || 0;
        radius = Math.min(radius, w / 2, h / 2);
        const bezel = (Math.min(w, h) / 2) * this.bezelFrac;
        const { url, scale } = buildDisplacementMap(
          w,
          h,
          radius,
          bezel,
          this.strength,
          this.zoom * global.strength,
        );
        curFilter.setAttribute("width", String(w));
        curFilter.setAttribute("height", String(h));
        curFeImage.setAttribute("width", String(w));
        curFeImage.setAttribute("height", String(h));
        curFilter.setAttribute("x", "0");
        curFilter.setAttribute("y", "0");
        curFeImage.setAttribute("href", url);
        curFeDisp.setAttribute("scale", scale.toFixed(2));
      }
      const backdrop = curFilter
        ? `url(#${id}) blur(${global.blur}px) saturate(${global.sat}%)`
        : `blur(${global.blur}px)`;
      el.style.backdropFilter = backdrop;
      // lib.dom 没有 webkitBackdropFilter，用 setProperty 写 -webkit 别名，保持原来的双写行为。
      el.style.setProperty("-webkit-backdrop-filter", backdrop);
    },
  };
  new ResizeObserver(() => g.update()).observe(el);
  glasses.set(el, g);
  return g;
};

// 设置变更后重刷所有已挂玻璃。走 [data-glass] 查询而不是自持注册表：
// WeakMap 无法遍历，而新 Set 强引用会让卸载的面板泄漏；querySelectorAll 只看在文档内的元素。
// 位移图是逐像素画的，拖滑杆一帧会来多次，所以用 rAF 合并到每帧最多刷一次。
let refreshQueued = false;
const refreshAllGlasses = () => {
  if (refreshQueued) return;
  refreshQueued = true;
  requestAnimationFrame(() => {
    refreshQueued = false;
    document
      .querySelectorAll<HTMLElement>("[data-glass]")
      .forEach((el) => glasses.get(el)?.update());
  });
};

// 应用一组玻璃参数（设置面板的 setter / 导入路径调它）：就地改 global 并重刷在场的玻璃。
export const applyLiquidGlassParams = (next: Partial<LiquidGlassParams>) => {
  if (next.strength !== undefined) global.strength = clampLiquidGlassParam("strength", next.strength);
  if (next.blur !== undefined) global.blur = clampLiquidGlassParam("blur", next.blur);
  if (next.sat !== undefined) global.sat = clampLiquidGlassParam("sat", next.sat);
  refreshAllGlasses();
};
