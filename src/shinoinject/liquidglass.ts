import { isWindowsPlatform } from "@/utils/platform";
/*
   液态玻璃
  */
let uid = 0;
const SVGNS = "http://www.w3.org/2000/svg";
// 默认参数：出厂值就是这里，设置面板（useLiquidGlassSettingsStore）的兜底也读它。
// bend = 最大弯曲距离：边缘受折射的区域从边缘向中心延伸多少 px，平面（不受折射）区在中心，bend 越大平面越小。
// ★ 配置位置①：默认弯曲距离（px）。测试直接改下行的 bend 数字，或给元素加 data-glass-bend="80" 单元素覆盖。
const global = { strength: 2.25, blur: 2, sat: 180, bend: 60 };
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
  bend: "liquidglass_bend",
} as const;
// 每个参数的量程：设置面板的滑杆和钳制共用同一份，UI 不会调出存不下的值。
export const LIQUID_GLASS_PARAM_BOUNDS: Record<keyof LiquidGlassParams, { min: number; max: number }> = {
  strength: { min: 0, max: 6 },
  blur: { min: 0, max: 40 },
  sat: { min: 100, max: 300 },
  // ★ 配置位置③：设置面板滑杆量程（弯曲距离最终还会被容器半个短边封顶，见 rebuild）。
  bend: { min: 0, max: 300 },
};
// 预设：一组强度/模糊/弯曲距离（不碰饱和度），一键切到常见观感。通透流体与朦胧流体靠扭曲滤镜，
// 只有 Windows 才有，其他平台不列出（毛玻璃只调模糊、节能在哪都能用）。
// ★ 配置预设：改这里的数值即可；设置面板按 id 匹配当前值高亮，效果图见 public/glass-presets/<id>.png。
export type LiquidGlassPresetId = "frosted" | "clear" | "hazy" | "eco";
export type LiquidGlassPreset = {
  id: LiquidGlassPresetId;
  strength: number;
  blur: number;
  bend: number;
  /** 需要扭曲滤镜（Windows）才有意义，其他平台不列出。 */
  windowsOnly: boolean;
};
export const LIQUID_GLASS_PRESETS: readonly LiquidGlassPreset[] = [
  { id: "frosted", strength: 0, blur: 12, bend: 0, windowsOnly: false },
  { id: "clear", strength: 4, blur: 2.5, bend: 10, windowsOnly: true },
  { id: "hazy", strength: 4, blur: 6, bend: 10, windowsOnly: true },
  { id: "eco", strength: 0, blur: 0, bend: 0, windowsOnly: false },
];
const clamp = (v: number, a: number, b: number) => Math.min(Math.max(v, a), b);
// 每个参数各自钳到自己的量程；非有限值（含缺失键）回落到默认值。
// 非 Windows 平台边缘扭曲与饱和度不存在可调空间：读回、设置面板、外观导入三条路径都走这里，
// 统一钉回固定值，state / localStorage / 实际渲染不会各说各话。
export const clampLiquidGlassParam = <K extends keyof LiquidGlassParams>(key: K, value: number) => {
  if (!LIQUID_GLASS_DISTORTION_SUPPORTED && key === "strength") return LIQUID_GLASS_DEFAULTS.strength;
  if (!LIQUID_GLASS_DISTORTION_SUPPORTED && key === "sat") return 1;
  // bend 只作用于位移图（Windows 才有），非 Windows 上钉回默认值，state / localStorage 保持一致。
  if (!LIQUID_GLASS_DISTORTION_SUPPORTED && key === "bend") return LIQUID_GLASS_DEFAULTS.bend;
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
  bend: readStoredParam("bend"),
});
// 光效（data-glass-light）与果冻效果（data-glass-jelly）是两个开关（不是数值参数），单独一组键。
// 默认都开；本模块启动时读回，store 的初始状态也走这里，两边永远一致。
export const LIQUID_GLASS_EFFECT_KEYS = {
  light: "liquidglass_light",
  jelly: "liquidglass_jelly",
} as const;
export type LiquidGlassEffects = { light: boolean; jelly: boolean };
const readStoredFlag = (key: string) => {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(key) !== "0";
};
export const readStoredLiquidGlassEffects = (): LiquidGlassEffects => ({
  light: readStoredFlag(LIQUID_GLASS_EFFECT_KEYS.light),
  jelly: readStoredFlag(LIQUID_GLASS_EFFECT_KEYS.jelly),
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

// 位移图分辨率长边封顶（px）：modal 等大元素逐像素重建是 O(w·h)，按原尺寸成图会掉帧。
// 边缘折射场是低频的，降采样后由 feImage（preserveAspectRatio=none）拉伸回元素尺寸，视觉无感；
// 几何与位移仍在元素 px 坐标系计算（feDisplacementMap 的 scale 单位是元素 px，不随降采样变化）。
const MAX_DISPLACE_DIM = 512;
// 长宽连续变化（modal 拖角/动画 resize）的重建节流窗口（ms）：窗口内多次触发合并成一次，
// 窗口末尾尾补一次保证最终尺寸正确；同尺寸的参数变更（设置滑杆）不走这道门，仍然即时重建。
const REBUILD_GAP = 64;

type Glass = {
  el: HTMLElement;
  // 非 Windows 平台不建扭曲滤镜，这三个为空；update 据此跳过位移图并写纯 blur 的 backdrop。
  filter: SVGFilterElement | null;
  feImage: SVGFEImageElement | null;
  feDisp: SVGFEDisplacementMapElement | null;
  id: string;
  strength: number;
  zoom: number;
  // 每元素覆盖：带 data-glass-blur / data-glass-strength / data-glass-sat / data-glass-bend（值是数字）的玻璃
  // 固定用自身值，未设置（null）时回落到全局 global 参数。仅在元素同时带 data-glass 时存在
  // （只有 [data-glass] 会走 makeGlass），所以这四个属性离开 data-glass 不生效。
  blurOverride: number | null;
  strengthOverride: number | null;
  satOverride: number | null;
  bendOverride: number | null;
  builtW: number; // 上次成图时的元素尺寸（尺寸变化节流的比对基准）
  builtH: number;
  builtKey: string; // 上次成图的指纹（尺寸 + 影响位移图的参数），相同则跳过重建
  builtAt: number; // 上次成图时刻（performance.now，节流窗口基准）
  rebuildTimer: number; // 尺寸变化节流的尾补定时器 id
  rebuild(): void;
  scheduleRebuild(): void;
  update(): void;
};
// 同一元素只允许建一次玻璃：调用点写在组件渲染体里，每次渲染都会再跑一遍，
// 不去重就会反复换 backdrop-filter 的 id（旧 id 悬空 → 玻璃消失 → 频闪）并泄漏 observer。
const glasses = new WeakMap<HTMLElement, Glass>();
const buildDisplacementMap = (
  w: number, // 元素尺寸：几何与位移都用这个坐标系（feDisp 的 scale 单位 = 元素 px）
  h: number,
  bw: number, // 位移图实际分辨率（长边封顶，≤ 元素尺寸）
  bh: number,
  radius: number,
  bezel: number,
  strength: number,
  zoom: number,
) => {
  const canvas = document.createElement("canvas");
  canvas.width = bw;
  canvas.height = bh;
  const ctx = canvas.getContext("2d");
  // 位移图必须有 2d context 才画得出来，拿不到就直接失败，别静默产出空滤镜。
  if (!ctx) throw new Error("[liquidglass] 2d canvas context unavailable");
  const img = ctx.createImageData(bw, bh);
  const raw = new Float32Array(bw * bh * 2);
  let maxD = 0.0001;
  const hw = w / 2,
    hh = h / 2;
  const k = strength * global.strength; // 边缘折射位移上限（px）由 bezel 决定
  const stepX = w / bw, // 位移图像素 → 元素像素
    stepY = h / bh;

  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      const cx = (x + 0.5) * stepX - hw,
        cy = (y + 0.5) * stepY - hh;
      const d = roundedRectSDF(cx, cy, hw, hh, radius);
      let m = smoothStep(-bezel, 0, d); // 0=深处 → 1=边缘
      m = m * m; // 平滑衰减，中心几乎无形变
      const len = Math.hypot(cx, cy) || 1;
      // 边缘折射（幅度与元素大小无关）+ 整体放大（放大镜模式）
      const dx = -(cx / len) * m * k * bezel - cx * zoom;
      const dy = -(cy / len) * m * k * bezel - cy * zoom;
      const i = (y * bw + x) * 2;
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

// 解析每元素参数覆盖：属性缺失或非有限数时返回 null（回落全局），否则钳到该参数量程。
// 非 Windows 平台上 strength / sat / bend 本就不可调，clampLiquidGlassParam 会把它钉回固定值，覆盖随之失效。
const parseGlassOverride = (raw: string | undefined, key: keyof LiquidGlassParams) => {
  if (raw === undefined) return null;
  const parsed = parseFloat(raw);
  return Number.isFinite(parsed) ? clampLiquidGlassParam(key, parsed) : null;
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
    strength: parseFloat(el.dataset.strength || "0.5"),
    zoom: parseFloat(el.dataset.zoom || "0"),
    blurOverride: parseGlassOverride(el.dataset.glassBlur, "blur"),
    strengthOverride: parseGlassOverride(el.dataset.glassStrength, "strength"),
    satOverride: parseGlassOverride(el.dataset.glassSat, "sat"),
    bendOverride: parseGlassOverride(el.dataset.glassBend, "bend"),
    builtW: 0,
    builtH: 0,
    builtKey: "",
    builtAt: 0,
    rebuildTimer: 0,
    // 在元素当前尺寸上逐像素重建成图（贵的那步，O(w·h) + PNG 编码），成功后刷新指纹与时刻。
    rebuild() {
      const w = Math.round(el.offsetWidth),
        h = Math.round(el.offsetHeight);
      if (!w || !h) return;
      const { filter: curFilter, feImage: curFeImage, feDisp: curFeDisp } = this;
      // 每元素覆盖 data-glass-strength 优先于全局；它参与位移图（k = strength·全局），故进指纹。
      const effGlobalStrength = this.strengthOverride ?? global.strength;
      // 最大弯曲距离：每元素覆盖 data-glass-bend 优先于全局，两者都进指纹（改设置要重建成图）。
      const effBend = this.bendOverride ?? global.bend;
      // 折射关着（强度或弯曲距离为 0）就不成图：即便有 pending 的节流重建也直接跳过，不浪费一次 O(w·h)。
      if (!(curFilter && this.strength > 0 && effGlobalStrength > 0 && effBend > 0)) return;
      if (curFilter && curFeImage && curFeDisp) {
        const cs = getComputedStyle(el);
        let radius = parseFloat(cs.borderRadius) || 0;
        radius = Math.min(radius, w / 2, h / 2);
        // ★ 配置位置②：弯曲距离 → 折射带宽度算法在这里。
        // 折射带宽度 = 最大弯曲距离（px，不随容器缩放），封顶为半个短边，平面区永远留在中心。
        // 想让带更宽/更窄改上面的 effBend，或在这里改封顶方式（例如留最小平面区：Math.min(effBend, Math.min(w, h) / 2 - 8)）。
        const bezel = Math.min(effBend, Math.min(w, h) / 2);
        // 大元素按长边封顶降采样成图，feImage 再拉伸回元素尺寸。
        const k = Math.min(1, MAX_DISPLACE_DIM / Math.max(w, h));
        const { url, scale } = buildDisplacementMap(
          w,
          h,
          Math.max(1, Math.round(w * k)),
          Math.max(1, Math.round(h * k)),
          radius,
          bezel,
          this.strength,
          this.zoom * effGlobalStrength,
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
      this.builtW = w;
      this.builtH = h;
      this.builtKey = `${w}x${h}|${this.strength}|${this.zoom}|${effGlobalStrength}|${effBend}`;
      this.builtAt = performance.now();
    },
    // 长宽变化的节流入口：窗口内只排一次尾补（窗口到期才成图），窗口已过则同步成图。
    // 首图（builtKey 为空）不节流：保证挂上玻璃的第一帧位移图就是对的。
    scheduleRebuild() {
      if (this.rebuildTimer) return;
      const wait = REBUILD_GAP - (performance.now() - this.builtAt);
      if (wait <= 0 || !this.builtKey) {
        this.rebuild();
        return;
      }
      this.rebuildTimer = window.setTimeout(() => {
        this.rebuildTimer = 0;
        this.rebuild();
      }, wait);
    },
    update() {
      const w = Math.round(el.offsetWidth),
        h = Math.round(el.offsetHeight);
      if (!w || !h) return;
      const { filter: curFilter, feImage: curFeImage, feDisp: curFeDisp } = this;
      // 滤镜区域与 backdrop 每次同步写（都是 O(1) 属性写）：区域落后于元素尺寸会让边缘
      // 露出没有滤镜的带状区；位移图本体（逐像素重建，贵）交给 scheduleRebuild 节流换新。
      if (curFilter && curFeImage && curFeDisp) {
        curFilter.setAttribute("width", String(w));
        curFilter.setAttribute("height", String(h));
        curFeImage.setAttribute("width", String(w));
        curFeImage.setAttribute("height", String(h));
        curFilter.setAttribute("x", "0");
        curFilter.setAttribute("y", "0");
      }
      // 非 Windows 平台没有扭曲滤镜：只剩纯 blur 的 backdrop（顺带保证 blur/sat 拖滑杆即时生效）。
      // 每元素覆盖（data-glass-blur / -sat / -strength / -bend）优先于全局，未设置时回落 global。
      const blur = this.blurOverride ?? global.blur;
      const sat = this.satOverride ?? global.sat;
      const effGlobalStrength = this.strengthOverride ?? global.strength;
      const effBend = this.bendOverride ?? global.bend;
      // 性能/资源：强度或弯曲距离为 0 → 位移图恒为零，不挂折射滤镜（省掉 feDisplacementMap 与逐像素成图）；
      // 模糊为 0 → 不挂 blur。非 Windows 无扭曲滤镜，curFilter 为空，只按 blur 决定。
      const refractionOn = !!curFilter && this.strength > 0 && effGlobalStrength > 0 && effBend > 0;
      const parts: string[] = [];
      if (curFilter) parts.push(`saturate(${sat}%)`);
      if (blur > 0) parts.push(`blur(${blur}px)`);
      if (refractionOn) parts.push(`url(#${id})`);
      const backdrop = parts.length ? parts.join(" ") : "none";
      el.style.backdropFilter = backdrop;
      // lib.dom 没有 webkitBackdropFilter，用 setProperty 写 -webkit 别名，保持原来的双写行为。
      el.style.setProperty("-webkit-backdrop-filter", backdrop);
      if (!curFilter || !curFeImage || !curFeDisp) return;
      const key = `${w}x${h}|${this.strength}|${this.zoom}|${effGlobalStrength}|${effBend}`;
      if (key === this.builtKey) return; // 尺寸与建图参数都没变，无事可做
      // 折射关着就不重建位移图（成图是 O(w·h)+PNG 编码，最贵的一步）；builtKey 不更新，
      // 重新打开时 key 与旧值不等，自然会补建。
      if (!refractionOn) return;
      // 尺寸变了 → 节流重建（modal 动画 resize 不再每帧逐像素画）；同尺寸只是参数变 → 即时重建。
      if (w !== this.builtW || h !== this.builtH) this.scheduleRebuild();
      else this.rebuild();
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
  if (next.bend !== undefined) global.bend = clampLiquidGlassParam("bend", next.bend);
  refreshAllGlasses();
};

/* —— 拖拽果冻（data-glass-jelly 注入）——
   pointerdown 命中带 data-glass-jelly 的元素即开会话，指针从按下点拖出的距离 d 驱动形变：
   translate 与 scale 增量都走饱和曲线 T = max·d/(d+k)（增量随 d 反二次衰减，d 越大越接近临界值）；
   scale 沿拖动轴拉伸、垂直轴压缩（垂直向下拖 → scaleX 略减、scaleY 略增），均带临界值。
   形变量经弹簧平滑，松手后目标归零，弹簧把元素带回原状。
   每帧 rAF 直写 transform（不进 React state）；framer / 拖拽组件可能随时改写
   el.style.transform，写前按 lastWritten 比对，外部改写收编为新的 base 再叠果冻项。 */

const JELLY_TMAX = 18; // translate 饱和值（px）
const JELLY_TK = 90; // 半饱和距离：拖 90px 达到 TMAX/2
const JELLY_MMAX = 0.3; // 沿轴拉伸临界值（scale 最多到 1+MMAX）
const JELLY_MK = 80; // 拉伸半饱和距离
const JELLY_PERP = 0.35; // 垂直拖动分量的压缩系数（拖动轴放大时，垂直轴按此比例回缩）
const JELLY_POS_K = 200; // 拖拽跟手用的平移弹簧：稍软，形变平滑逼近目标
const JELLY_POS_C = 24;
const JELLY_STR_K = 260; // 拖拽跟手用的缩放弹簧：略硬，形变跟手
const JELLY_STR_C = 27;
// 回弹（松手后）位移用弹簧：调回弹速度改这组 k（临界阻尼附近 c ≈ 2√k，k = ω²，ω 越大回位越快）。
// 验证：松手后 0.1s 内回到原状、无过冲甩尾；回不完加大 k，甩尾加大 c。
const JELLY_POS_K_BACK = 6000; // 回弹平移弹簧（最远 18px）
const JELLY_POS_C_BACK = 100;
// 回弹缩放不用弹簧，改走 ease-out 动画曲线（先快后慢、末速为 0）：m 从松手值按曲线回 0。
// 调回缩快慢改 JELLY_STR_BACK_DUR（须 ≤0.1s 回弹预算）；换曲线改 jellyEaseOut
// （如换 ease-out 二次：1 - (1-t)**2，起步更平缓）。
const JELLY_STR_BACK_DUR = 0.1; // 缩放回缩时长（s）
const JELLY_STEP = 1 / 120; // 定步长积分（s）
const JELLY_MAX_SUBSTEPS = 8;
const JELLY_REST_OFF = 0.05; // 贴住目标的静止判定（px）
const JELLY_REST_M = 0.004;
const JELLY_REST_V = 0.6; // 弹簧速度静止判定
const JELLY_REST_MV = 0.01;

// 饱和曲线：f(0)=0，f'(0)=max/k 最大，随 d 衰减 ~1/d²，f→max。鼠标越远 translate/scale 越大但增量越小。
const jellySaturate = (d: number, max: number, k: number) => (max * d) / (d + k);

// 半隐式欧拉一步：a = -k·(x - target) - c·v。
const jellyIntegrate = (x: number, v: number, target: number, dt: number, k: number, c: number) => {
  const a = k * (target - x) - c * v;
  const v2 = v + a * dt;
  return [x + v2 * dt, v2] as const;
};

// ease-out 曲线（三次）：p=0 时 0、p=1 时 1，起步快末尾慢，导数末端为 0（回缩无甩尾）。
const jellyEaseOut = (p: number) => 1 - (1 - p) ** 3;

// 单指针单元素会话；模块级状态，不进 React state。
let jellyInstalled = false;
// 果冻效果总开关（设置面板的「果冻效果」）：关掉后带 data-glass-jelly 的元素也不再拖拽形变。
let jellyEnabled = readStoredFlag(LIQUID_GLASS_EFFECT_KEYS.jelly);
let jEl: HTMLElement | null = null;
let jPointerId = -1;
let jDragging = false;
let jStartPX = 0;
let jStartPY = 0;
let jPx = 0; // 当前指针位置
let jPy = 0;
let jTheta = 0; // 拖动方向（rad），d 太小时保持上次方向
let jOx = 0;
let jVoX = 0;
let jOy = 0;
let jVoY = 0;
let jM = 0; // 拉伸量：按 jTheta 方向分解成 scaleX/scaleY（无 rotate），见 jellyWrite
let jVm = 0;
let jStrT = 0; // 回弹缩放曲线已推进时间（s）
let jStrFrom = 0; // 回弹缩放曲线起点（松手瞬间的 m）
let jTOx = 0;
let jTOy = 0;
let jTM = 0;
let jBase = ""; // 外部写在 el.style.transform 上的值（framer / 拖拽组件）
let jLastWritten: string | null = null;
let jRaf = 0;
let jLastFrame = 0;
let jAcc = 0;

const jellyStopLoop = () => {
  if (jRaf) cancelAnimationFrame(jRaf);
  jRaf = 0;
  jLastFrame = 0;
  jAcc = 0;
};

// 收摊：停帧、清会话、transform 还原 base（空则清空），下一轮 pointerdown 重新收编外部值。
const jellyFinish = () => {
  jellyStopLoop();
  const el = jEl;
  jEl = null;
  jDragging = false;
  jPointerId = -1;
  jOx = jVoX = jOy = jVoY = jM = jVm = 0;
  jStrT = jStrFrom = 0;
  jTOx = jTOy = jTM = 0;
  jTheta = 0;
  jLastWritten = null;
  if (el?.isConnected) el.style.transform = jBase;
};

// 弹簧是否贴住目标（静止）：按住不动时贴住目标即停帧省电，松手后目标为 0 即回原状。
const jellyAtRest = () =>
  Math.abs(jOx - jTOx) < JELLY_REST_OFF &&
  Math.abs(jOy - jTOy) < JELLY_REST_OFF &&
  Math.abs(jM - jTM) < JELLY_REST_M &&
  Math.abs(jVoX) < JELLY_REST_V &&
  Math.abs(jVoY) < JELLY_REST_V &&
  Math.abs(jVm) < JELLY_REST_MV;

// 按当前指针位置算形变目标：位移向量 = 指针 - 按下点，方向定角度，模长走饱和曲线。
const jellyUpdateTarget = () => {
  const dx = jPx - jStartPX;
  const dy = jPy - jStartPY;
  const d = Math.hypot(dx, dy);
  if (d < 1) {
    // 没拖动：目标归零，松手感（纯点按不会出现形变，天然免误触门槛）。
    jTOx = jTOy = 0;
    jTM = 0;
    return;
  }
  jTheta = Math.atan2(dy, dx);
  const t = jellySaturate(d, JELLY_TMAX, JELLY_TK);
  jTOx = (dx / d) * t;
  jTOy = (dy / d) * t;
  jTM = jellySaturate(d, JELLY_MMAX, JELLY_MK);
};

// 每帧写入：先收编外部 transform，再合成 base + translate + 方向性 scale（无 rotate / skew）。
const jellyWrite = () => {
  const el = jEl;
  if (!el || !el.isConnected) {
    jellyFinish();
    return;
  }
  const cur = el.style.transform;
  if (cur !== jLastWritten) jBase = cur; // 外部改写（framer layout / 拖拽组件 inline transform）
  if (Math.abs(jOx) < 0.01 && Math.abs(jOy) < 0.01 && Math.abs(jM) < 0.001) {
    // 形变为零：还原 base，不留无意义的 transform 壳。
    el.style.transform = jBase;
    jLastWritten = jBase;
    return;
  }
  // 拖到哪个方向，形变就偏向哪个方向：把拖动单位向量分解到 x/y 轴做纯缩放——
  // 沿拖动分量放大、垂直分量压缩，不引入 rotate / skew。
  // θ=0（拖右）：scaleX↑ scaleY↓；θ=90°（拖下）：scaleX↓ scaleY↑；θ=45°：两轴等比微增。
  const ux = Math.abs(Math.cos(jTheta));
  const uy = Math.abs(Math.sin(jTheta));
  const sx = 1 + jM * (ux - JELLY_PERP * uy);
  const sy = 1 + jM * (uy - JELLY_PERP * ux);
  el.style.transform = `${jBase ? jBase + " " : ""}translate(${jOx.toFixed(2)}px, ${jOy.toFixed(2)}px) scale(${sx.toFixed(4)}, ${sy.toFixed(4)})`;
  jLastWritten = el.style.transform;
};

const jellyFrame = (t: number) => {
  jRaf = 0;
  const dtMs = jLastFrame ? Math.min(t - jLastFrame, 64) : JELLY_STEP * 1000;
  jLastFrame = t;
  jAcc += dtMs / 1000;
  let steps = 0;
  // 松手后：位移切回弹弹簧；缩放不走弹簧，改按 ease-out 曲线回缩（拖拽中缩放仍用跟手弹簧）。
  const back = !jDragging;
  const pk = back ? JELLY_POS_K_BACK : JELLY_POS_K;
  const pc = back ? JELLY_POS_C_BACK : JELLY_POS_C;
  while (jAcc >= JELLY_STEP && steps < JELLY_MAX_SUBSTEPS) {
    [jOx, jVoX] = jellyIntegrate(jOx, jVoX, jTOx, JELLY_STEP, pk, pc);
    [jOy, jVoY] = jellyIntegrate(jOy, jVoY, jTOy, JELLY_STEP, pk, pc);
    if (!back) [jM, jVm] = jellyIntegrate(jM, jVm, jTM, JELLY_STEP, JELLY_STR_K, JELLY_STR_C);
    jAcc -= JELLY_STEP;
    steps++;
  }
  if (back) {
    // 缩放 ease-out 回缩：p 从 0→1，m = 松手值·(1 - easeOut(p))；vm 取解析导数供静止判定。
    jStrT = Math.min(jStrT + dtMs / 1000, JELLY_STR_BACK_DUR);
    const p = jStrT / JELLY_STR_BACK_DUR;
    jM = jStrFrom * (1 - jellyEaseOut(p));
    jVm = (-jStrFrom * 3 * (1 - p) ** 2) / JELLY_STR_BACK_DUR;
  }
  if (steps >= JELLY_MAX_SUBSTEPS) jAcc = 0;
  if (!jDragging && jellyAtRest()) {
    jellyFinish(); // 松手后弹回原状，收摊还原 base
    return;
  }
  jellyWrite();
  if (jDragging && jellyAtRest()) {
    jellyStopLoop(); // 按住不动：形变已贴目标，停帧；再动由 pointermove 拉起
    return;
  }
  jRaf = requestAnimationFrame(jellyFrame);
};

const jellyEnsureLoop = () => {
  if (!jRaf) {
    jLastFrame = 0;
    jRaf = requestAnimationFrame(jellyFrame);
  }
};

const jellyOnPointerDown = (e: PointerEvent) => {
  if (!jellyEnabled || jDragging || typeof window === "undefined") return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  // data-glass-jelly 是果冻注入开关：命中该属性的玻璃才参与拖拽果冻。
  const el = e.target instanceof Element ? e.target.closest<HTMLElement>("[data-glass-jelly]") : null;
  if (!el) return;
  if (jEl) jellyFinish(); // 上一会话还有尾巴（如松手前又按下），先收干净
  jEl = el;
  jPointerId = e.pointerId;
  jDragging = true;
  jStartPX = jPx = e.clientX;
  jStartPY = jPy = e.clientY;
  jOx = jVoX = jOy = jVoY = jM = jVm = 0;
  jStrT = jStrFrom = 0;
  jTOx = jTOy = jTM = 0;
  jTheta = 0;
  jBase = el.style.transform;
  jLastWritten = el.style.transform;
};

const jellyOnPointerMove = (e: PointerEvent) => {
  if (!jDragging || e.pointerId !== jPointerId || !jEl?.isConnected) return;
  jPx = e.clientX;
  jPy = e.clientY;
  jellyUpdateTarget();
  jellyEnsureLoop();
};

const jellyEndPointer = () => {
  if (!jDragging) return;
  jDragging = false;
  jPointerId = -1;
  jTOx = jTOy = jTM = 0; // 松手：目标归零，位移弹簧 + 缩放曲线把元素带回原状
  jStrT = 0; // 缩放回缩曲线从松手瞬间的 m 出发
  jStrFrom = jM;
  jellyEnsureLoop();
};

// 由 useGlass 在 commit 后调一次（幂等）：挂 window 级指针监听。
export const installGlassJelly = () => {
  if (jellyInstalled || typeof window === "undefined") return;
  jellyInstalled = true;
  window.addEventListener("pointerdown", jellyOnPointerDown, { capture: true });
  window.addEventListener("pointermove", jellyOnPointerMove, { passive: true });
  window.addEventListener("pointerup", jellyEndPointer);
  window.addEventListener("pointercancel", jellyEndPointer);
  window.addEventListener("blur", jellyEndPointer);
  document.addEventListener("visibilitychange", jellyEndPointer);
};

// 果冻总开关的运行时入口（设置面板与外观导入调用）：关掉顺手把进行中的会话收干净。
export const setLiquidGlassJellyEnabled = (enabled: boolean) => {
  jellyEnabled = enabled;
  if (!enabled) jellyFinish();
};

/* —— 拖拽光效（data-glass-light 注入）——
   指针悬停在带 data-glass-light 的元素上时，在该容器内挂一层铺满 inset:0 的光晕，光点中心跟随指针
   （换算成元素自身布局坐标），强度是悬停的微光；按下时同一个光晕升到最强，松手回到悬停微光（指针还
   停在元素上）或淡出（已离开）。半径取自属性值（px，缺省 LIGHT_DEFAULT_RANGE）。
   淡入 / 淡出 / 换容器都只在 lightSync 里收敛一处，节点用完即摘，不残留 DOM。不依赖 data-glass；
   可与 data-glass-jelly 叠加（形变 + 光晕）。光晕颜色走 CSS 变量 --lg-light-color（在容器上定义即可），
   缺省为柔和白光。 */

const LIGHT_DEFAULT_RANGE = 160; // 属性缺省时的发光半径（px）
const LIGHT_FALLBACK_COLOR = "rgba(255,255,255,0.6)"; // --lg-light-color 未定义时的颜色
const LIGHT_FADE_MS = 200; // 淡入 / 淡出 / 强弱切换时长（ms）
const LIGHT_HOVER_OPACITY = 0.32; // 悬停微光的强度（相对按下时的 1）
const LIGHT_PRESS_OPACITY = 1; // 按下时光的强度

let lightInstalled = false;
// 光效总开关（设置面板的「光效」）：关掉后带 data-glass-light 的元素也不再出光晕。
let lightEnabled = readStoredFlag(LIQUID_GLASS_EFFECT_KEYS.light);
let lightEl: HTMLElement | null = null; // 当前挂着光晕层的容器
let lightLayer: HTMLDivElement | null = null;
let lightHoverEl: HTMLElement | null = null; // 指针正悬停的容器（只认鼠标）
let lightPressEl: HTMLElement | null = null; // 按下的容器
let lightPointerId = -1;
let lightX = 0; // 光点在容器布局坐标里的位置（按下与悬停共用，换层时不用等下一次 move）
let lightY = 0;
let lightRange = LIGHT_DEFAULT_RANGE;
let lightForcedRelative = false;

// 属性值即发光半径；无值 / 非数 / ≤0 时回落到默认值，同时封顶避免离谱入参。
const parseLightRange = (el: HTMLElement) => {
  const raw = parseFloat(el.dataset.glassLight || "");
  return Number.isFinite(raw) && raw > 0 ? Math.min(raw, 4000) : LIGHT_DEFAULT_RANGE;
};

// 指针视口坐标 → 元素自身布局坐标（除以视觉缩放，兼容 scale-90 这类 transform）。
const lightLocalPoint = (el: HTMLElement, clientX: number, clientY: number) => {
  const rect = el.getBoundingClientRect();
  const sx = rect.width ? el.offsetWidth / rect.width : 1;
  const sy = rect.height ? el.offsetHeight / rect.height : 1;
  return { x: (clientX - rect.left) * sx, y: (clientY - rect.top) * sy };
};

// 把光点挪到指针处：径向渐变铺满容器，range 之外透明，所以 radius 大于到最远角的距离时即覆盖整个容器。
const lightPaint = (el: HTMLElement, clientX: number, clientY: number) => {
  if (!lightLayer) return;
  const { x, y } = lightLocalPoint(el, clientX, clientY);
  lightLayer.style.background = `radial-gradient(circle ${lightRange}px at ${x}px ${y}px, var(--lg-light-color, ${LIGHT_FALLBACK_COLOR}), transparent ${lightRange}px)`;
};

// 收摊：淡出光晕层、还原临时 position、清会话；淡出结束再摘节点（可被下一次会话覆盖，互不影响）。
const lightUnmount = () => {
  const el = lightEl;
  lightEl = null;
  if (lightLayer) {
    const layer = lightLayer;
    lightLayer = null;
    layer.style.opacity = "0";
    window.setTimeout(() => layer.remove(), LIGHT_FADE_MS + 40);
  }
  if (el && lightForcedRelative) el.style.position = "";
  lightForcedRelative = false;
};

// 在 el 上挂一层光晕并淡入到 opacity（同一容器上加减强度不重建，见 lightSync）。
const lightMount = (el: HTMLElement, clientX: number, clientY: number, opacity: number) => {
  if (getComputedStyle(el).position === "static") {
    el.style.position = "relative"; // 光晕层要相对容器定位；原本非 static 的不碰它
    lightForcedRelative = true;
  }
  const layer = document.createElement("div");
  layer.setAttribute("aria-hidden", "true");
  layer.style.cssText = `position:absolute;inset:0;pointer-events:none;z-index:0;opacity:0;transition:opacity ${LIGHT_FADE_MS}ms ease;`;
  // 光晕层要贴着容器的圆角裁剪；inline !important 才能压过 Lattice 把墙内所有子元素压成直角的 !important 重置。
  layer.style.setProperty("border-radius", "inherit", "important");
  lightLayer = layer;
  lightRange = parseLightRange(el);
  lightPaint(el, clientX, clientY);
  el.appendChild(layer);
  void layer.offsetWidth; // 先落地再拉透明度，保证有淡入过渡
  lightEl = el;
  layer.style.opacity = String(opacity);
};

// 每次状态变化（悬停进出、按下松开）后按当前状态收敛光晕：按下压过悬停，同一容器只调强弱，换容器才重建。
const lightSync = () => {
  if (!lightEnabled) {
    lightUnmount();
    return;
  }
  const want = lightPressEl && lightPressEl.isConnected ? lightPressEl
    : lightHoverEl && lightHoverEl.isConnected ? lightHoverEl
      : null;
  const opacity = lightPressEl ? LIGHT_PRESS_OPACITY : LIGHT_HOVER_OPACITY;
  if (!want) {
    lightUnmount();
    return;
  }
  if (lightEl !== want) {
    lightUnmount();
    lightMount(want, lightX, lightY, opacity);
    return;
  }
  lightPaint(want, lightX, lightY);
  if (lightLayer) lightLayer.style.opacity = String(opacity);
};

// 悬停的容器：按下不看（按下有自己的会话），只认鼠标指针（触屏的 pointerover 发生在点按上，不算悬停）。
const lightHoverTarget = (e: PointerEvent) => (
  e.pointerType === "mouse" && e.target instanceof Element
    ? e.target.closest<HTMLElement>("[data-glass-light]")
    : null
);

const lightReduceMotion = () => typeof window !== "undefined"
  && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const lightOnPointerOver = (e: PointerEvent) => {
  if (!lightEnabled || lightReduceMotion()) return;
  const el = lightHoverTarget(e);
  if (el === lightHoverEl) return;
  lightHoverEl = el;
  lightSync();
};

const lightOnPointerOut = (e: PointerEvent) => {
  if (!lightEnabled) return;
  // 离开的是同一个悬停容器的子元素时不动（relatedTarget 还在里面）；真正离开才收掉或换到下一个。
  const to = e.pointerType === "mouse" && e.relatedTarget instanceof Element
    ? e.relatedTarget.closest<HTMLElement>("[data-glass-light]")
    : null;
  if (to === lightHoverEl) return;
  lightHoverEl = to;
  lightSync();
};

const lightOnPointerDown = (e: PointerEvent) => {
  if (!lightEnabled || lightReduceMotion()) return;
  const el = e.target instanceof Element ? e.target.closest<HTMLElement>("[data-glass-light]") : null;
  if (!el) return;
  lightPressEl = el;
  lightPointerId = e.pointerId;
  lightX = e.clientX;
  lightY = e.clientY;
  lightSync();
};

const lightOnPointerMove = (e: PointerEvent) => {
  // 按下时跟手；悬停时也让光点跟着指针走（没有光晕层时 lightPaint 直接返回，开销只是一次判空）。
  if (!lightEnabled || !lightLayer) return;
  if (lightPressEl) {
    if (e.pointerId !== lightPointerId) return;
  } else if (!lightHoverEl) return;
  lightX = e.clientX;
  lightY = e.clientY;
  lightPaint(lightPressEl ?? lightHoverEl!, lightX, lightY);
};

// 触屏的 pointercancel 多因手势被判为滚动 / 平移、浏览器接管而触发；此时按下会话应继续，
// 改由下面的 touchmove 跟手、touchend 收场，否则光晕会在滑动刚开始时就被收掉（表现为「光效散了」）。
const lightOnPointerCancel = (e: PointerEvent) => {
  if (e.pointerType !== "mouse") return;
  lightEndPress(e);
};

// 触屏跟手：pointercancel 之后 pointermove 不再派发，用 touchmove 补上光点位置（仍是按下时的高光）。
const lightOnTouchMove = (e: TouchEvent) => {
  if (!lightEnabled || !lightLayer || !lightPressEl || !lightPressEl.isConnected) return;
  const t = e.touches[0];
  if (!t) return;
  lightX = t.clientX;
  lightY = t.clientY;
  lightPaint(lightPressEl, lightX, lightY);
};

const lightEndPress = (e?: { pointerId?: number }) => {
  if (!lightPressEl) return;
  if (e && typeof e.pointerId === "number" && e.pointerId !== lightPointerId) return;
  lightPressEl = null;
  lightPointerId = -1;
  lightSync();
};

// touchend / touchcancel 是 Event，不带 pointerId；包一层只为收掉按下会话。
const lightOnTouchEnd = () => {
  lightEndPress();
};

const lightEndAll = () => {
  lightPressEl = null;
  lightPointerId = -1;
  lightHoverEl = null;
  lightSync();
};

// 由 useGlass 在 commit 后调一次（幂等）：挂 window 级指针监听，带 data-glass-light 的元素才参与。
export const installGlassLight = () => {
  if (lightInstalled || typeof window === "undefined") return;
  lightInstalled = true;
  window.addEventListener("pointerover", lightOnPointerOver, { capture: true });
  window.addEventListener("pointerout", lightOnPointerOut, { capture: true });
  window.addEventListener("pointerdown", lightOnPointerDown, { capture: true });
  window.addEventListener("pointermove", lightOnPointerMove, { passive: true });
  window.addEventListener("pointerup", lightEndPress);
  window.addEventListener("pointercancel", lightOnPointerCancel);
  window.addEventListener("touchmove", lightOnTouchMove, { passive: true });
  window.addEventListener("touchend", lightOnTouchEnd);
  window.addEventListener("touchcancel", lightOnTouchEnd);
  window.addEventListener("blur", lightEndAll);
  document.addEventListener("visibilitychange", lightEndAll);
};

// 光效总开关的运行时入口（设置面板与外观导入调用）：关掉清会话并收掉在场光晕。
export const setLiquidGlassLightEnabled = (enabled: boolean) => {
  lightEnabled = enabled;
  if (!enabled) {
    lightPressEl = null;
    lightPointerId = -1;
    lightHoverEl = null;
    lightSync(); // lightEnabled 已置 false，这里只做收摊
  }
};
