/*
   液态玻璃
  */
let uid = 0;
const SVGNS = "http://www.w3.org/2000/svg";
const global = { strength: 2.25, blur: 2, sat: 160 };
const clamp = (v: number, a: number, b: number) => Math.min(Math.max(v, a), b);
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
  filter: SVGFilterElement;
  feImage: SVGFEImageElement;
  feDisp: SVGFEDisplacementMapElement;
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
export const makeGlass = (el: HTMLElement) => {
  const existing = glasses.get(el);
  if (existing) return existing;
  const defs = getDefs();
  const id = "lg-" + uid++;
  const filter = document.createElementNS(SVGNS, "filter");
  filter.setAttribute("id", id);
  filter.setAttribute("filterUnits", "userSpaceOnUse");
  filter.setAttribute("color-interpolation-filters", "sRGB");
  const feImage = document.createElementNS(SVGNS, "feImage");
  feImage.setAttribute("result", "map");
  feImage.setAttribute("preserveAspectRatio", "none");
  const feDisp = document.createElementNS(SVGNS, "feDisplacementMap");
  feDisp.setAttribute("in", "SourceGraphic");
  feDisp.setAttribute("in2", "map");
  feDisp.setAttribute("xChannelSelector", "R");
  feDisp.setAttribute("yChannelSelector", "G");
  filter.append(feImage, feDisp);
  defs.appendChild(filter);

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
      filter.setAttribute("width", String(w));
      filter.setAttribute("height", String(h));
      feImage.setAttribute("width", String(w));
      feImage.setAttribute("height", String(h));
      filter.setAttribute("x", "0");
      filter.setAttribute("y", "0");
      feImage.setAttribute("href", url);
      feDisp.setAttribute("scale", scale.toFixed(2));
      const backdrop = `url(#${id}) blur(${global.blur}px) saturate(${global.sat}%)`;
      el.style.backdropFilter = backdrop;
      // lib.dom 没有 webkitBackdropFilter，用 setProperty 写 -webkit 别名，保持原来的双写行为。
      el.style.setProperty("-webkit-backdrop-filter", backdrop);
    },
  };
  new ResizeObserver(() => g.update()).observe(el);
  glasses.set(el, g);
  return g;
};
