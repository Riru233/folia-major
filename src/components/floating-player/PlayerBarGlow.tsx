import React, { useEffect, useRef } from "react";
import { audioPower, beatImpact } from "../../stores/motionSignals";
import "./PlayerBarGlow.css";

// src/components/floating-player/PlayerBarGlow.tsx
// 播放时从浮动播放条底边发出的光：白心、周围是更亮的强调色，强度跟着音乐实时变化，
// 上面再叠一道横向掠过的流光。
//
// 这一层在胶囊**内部**（挂在胶囊的子节点里），贴在底边往上摊；z-index: -1 让它压在
// 按钮、进度条下面，浮在胶囊自己的底色上面，所以它照亮的是底边，不会盖住控件。
// 胶囊里 data-glass-light 的光晕层（liquidglass.ts 追加的子节点）是跟着指针走的白色
// 光斑，z-index 0、在内容之上；两者亮部叠加也只是更亮，不会互相冲淡。
//
// 强度直接读全局音频信号（stores/motionSignals）：那里存的是 MotionValue，读一次不
// 触发任何渲染，所以这里用自己的 rAF 往 DOM 上写一个 CSS 变量，不进 React state
// （见 skills/frontend-runtime-guardrails）。光的高度、透明度、渐变全在 CSS 里由这个
// 变量推出来，JS 每帧只写一个数。

// 上升快、回落慢：跟得上鼓点，又不会一闪一闪。
const GLOW_ATTACK = 16;
const GLOW_RELEASE = 3.6;

const clamp01 = (value: number) => Math.min(Math.max(value, 0), 1);

type PlayerBarGlowProps = {
  /** 只在播放时发光。 */
  active: boolean;
};

const PlayerBarGlow: React.FC<PlayerBarGlowProps> = ({ active }) => {
  const rootRef = useRef<HTMLDivElement>(null);
  // 播放状态进 ref：它只决定这一帧的强度，切换时不该重建帧循环（那会把平滑中的
  // 强度清零，光就硬生生地断掉）。
  const activeRef = useRef(active);
  activeRef.current = active;

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    let frame = 0;
    let level = 0;
    let last = performance.now();

    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;

      // 强度：整体能量（分析器的 0..255 刻度）打底，重拍再补一下。
      const playing = activeRef.current;
      const power = playing ? audioPower.get() : 0;
      const beat = playing ? beatImpact.get() : 0;
      const raw = clamp01((power / 255) * 1.9 + beat * 0.3);
      const rate = raw > level ? GLOW_ATTACK : GLOW_RELEASE;
      level += (raw - level) * Math.min(1, rate * dt);

      root.style.setProperty("--player-bar-glow-level", level.toFixed(3));
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div ref={rootRef} className="player-bar-glow" aria-hidden="true">
      <div className="player-bar-glow-core" />
      <div className="player-bar-glow-stream" />
    </div>
  );
};

export default PlayerBarGlow;
