// src/library/suites/grid/home/thumbStretch.ts
// Grid3D 首页摇杆拖动时的速度形变（squash & stretch）：全部手感参数与「速度 → 形变强度」曲线都放这里，
// 调手感只改这一个文件；useHomeTabThumb 只负责采样速度、计时收回和把强度写进 MotionValue。
//
// 它不是玻璃层的拖拽果冻（`data-glass-jelly`，见 shinoinject/liquidglass.ts）：那个按「指针离按下点的距离」
// 形变、rAF 直写容器 transform、受设置里的「果冻效果」开关控制，按下不动就不形变；这里按「滑动的速度」形变，
// 只写摇杆自己的 scaleX / scaleY，按着不动会自己收回，也不跟那个开关走。两者会同时出现（容器归容器、
// 摇杆归摇杆），调这里的手感不用去看 liquidglass 的那组常量。
//
// 形变强度是有符号的比例（-1 → 1），符号就是拖动方向：
//   向右拖（强度 > 0）：scaleX 拉长、scaleY 压扁；
//   向左拖（强度 < 0）：反过来，scaleX 缩短、scaleY 拉长。
// 两条公式对两个方向通用，方向只体现在强度的正负上：
//   scaleX = 基础 scale × (1 + 强度 × STRETCH_X)
//   scaleY = 基础 scale × (1 − 强度 × STRETCH_Y)
// 因为基础 scale 是 DRAG_SCALE（2），看到的形变绝对量也会跟着放大。

// 【X 变形强度】速度拉满时 scaleX 相对基础 scale 变化的比例：向右拖拉长这么多，向左拖就缩短这么多。
// 想让形变更明显就往上加。两个轴都别太大：加起来超过 0.35 之后圆角的形变会明显跑偏、像被拉歪的胶囊。
export const STRETCH_X = 0.1;
// 【Y 变形强度】同一时刻 scaleY 相对基础 scale 变化的比例，方向与 X 相反：向右拖压扁、向左拖拉长。
// 一般和 X 不要差太远，否则两个方向的形变看起来不是同一套手感。当前 0.3 意味着速度拉满时压到 0.7 倍
// （或涨到 1.3 倍）。
export const STRETCH_Y = 0.3;

// 【变形最小速度】低于这个横向速度（px/s）完全不变形：慢拖、手抖、点按都不会让摇杆变形。
// 看的是速度大小，方向不影响门槛。这就是「达到这个速度才开始变形」的门槛；
// 想让轻微拖动也有反应就调小，想更沉稳就调大。
export const STRETCH_MIN_SPEED = 200;
// 【变形满速度】到这个速度形变拉满。必须大于 STRETCH_MIN_SPEED，两者之间就是做曲线变化的那段区间。
// 调小则轻轻一晃就拉满（更夸张），调大则只有猛甩才明显。
export const SPEED_FOR_FULL_STRETCH = 800;
// 【速度曲线】门槛到满速之间不是线性上升，而是按幂曲线走：0.7 意味着过门槛后先起得快、
// 接近满速时再放缓（起步就有反馈、到顶不突兀）；改成 1 是直线；大于 1 会变成过门槛后很久才有明显形变。
export const STRETCH_CURVE_POWER = 0.4;

// 【跟手弹性】形变不是硬跟速度，而是由一个弹簧去追速度算出来的目标值：起步慢半拍、跟上时过冲一下，
// 手感才是软的。阻尼比 ζ = damping / (2·√(stiffness·mass))，当前约 0.5（欠阻尼，会来回晃两下才停）。
// 手感由两件事决定：
//   1) 固有频率 ω = √(stiffness / mass) 决定左右来回甩时形变掉头有多快。ω 太小（比如 14 上下）时，
//      快速左右交替的两次形变会在弹簧里糊成一片，看着发闷；当前 ω ≈ 23，从 +1 掉到 −1 约 0.1s
//      （过零 0.05s），来回甩也能一格一格地翻方向。
//   2) ζ 决定软硬和过冲量：0.5 左右保留甩尾，接近 1 就变硬、没有回弹感。
// 想更软更晃：同时降 stiffness 和 damping（保持 ζ ≈ 0.5，即 damping ≈ √(stiffness·mass)），
// 但别把 ω 压回 15 以下，否则来回拖动会糊。想更干脆：反向加。
export const STRETCH_SPRING = { stiffness: 480, damping: 21, mass: 0.9 } as const;

// 【吸附】速度估计里上一次值的权重：越小越跟手、也越容易抖；越大越稳、越钝。形变抖动就看这个。
export const SPEED_SMOOTHING = 0.12;
// 【吸附】两次采样的最小间隔，太密的采样会放大时间戳抖动；不足就先不采，攒到下一个窗口再算。
export const SPEED_SAMPLE_MIN_MS = 8;
// 【时长】多久没有新的移动采样就当作「停住」，开始把形变收回。它是停手判定，不是形变停留时长：
// 调大只会让「停手之后形变赖着不走」变明显（拖动中松手前稍微一顿就会看着像没恢复），
// 所以保持在一两百毫秒以内；要更跟手就调到 60 左右。真正决定收回快慢的是 STRETCH_RETURN_SECONDS。
export const STRETCH_IDLE_MS = 90;
// 【时长】收回形变的时长：scaleY 在这段时间里回升、scaleX 同步缩回，两者都回到拖动时的基础 scale。
// 这是喂给弹簧的目标曲线长度，实际看到全部归位还要叠加弹簧自身的滞后（当前这组弹簧约 +0.05s），
// 也就是说眼睛看到的收回大约 0.35s。想让收回更慢更绵就把这个值调大。
export const STRETCH_RETURN_SECONDS = 0.3;
// 【时长】配上面那段时长的曲线：先快后慢的减速曲线，收回时带一点回弹。
// 换成 'linear' 会显得机械，换成更陡的 easeOut 会像被瞬间弹了一下。
export const STRETCH_RETURN_EASE = [0.16, 1, 0.3, 1] as const;

// 平滑后的横向速度（px/s，右为正、左为负）→ 形变强度（-1 → 1）：
// 速度大小没过门槛直接 0；过了门槛在 [STRETCH_MIN_SPEED, SPEED_FOR_FULL_STRETCH] 里归一化，
// 再按幂曲线抬起来，最后把速度的符号还给结果——符号就是拖动方向。
export const stretchAmountFromSpeed = (speed: number) => {
    if (Number.isNaN(speed)) return 0;
    const magnitude = Math.abs(speed);
    if (magnitude <= STRETCH_MIN_SPEED) return 0;
    const span = SPEED_FOR_FULL_STRETCH - STRETCH_MIN_SPEED;
    if (span <= 0) return speed < 0 ? -1 : 1;
    const normalized = (magnitude - STRETCH_MIN_SPEED) / span;
    const amount = Math.min(1, normalized ** STRETCH_CURVE_POWER);
    return speed < 0 ? -amount : amount;
};
