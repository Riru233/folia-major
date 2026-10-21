# 0.7.21 之后 Riru233 的改动

范围：从 v0.7.21 的发布提交 `54367cec`（release: v0.7.21，2026-10-18）到本地 `main`（已同步官方上游到 `979e6e87`）。

这里只记本地有特色的改动。官方上游基线同步（`chore: 同步官方上游基线至 …`）、同步过程的冲突修整与由此带来的测试补录不算本地改动，不在此列。

## 液态玻璃与果冻

### `8121a419`（2026-10-18）add(liquidglass)：最大边缘弯曲距离、预设、非流体玻璃流畅度

- 新增「边缘弯曲距离」参数（`bend`）：边缘受折射的区域从边框向中心延伸多少像素，数值越大，中间不受折射的平面区越小。参数进 `LiquidGlassParams` 与 `useLiquidGlassSettingsStore`，落库、导入导出（`visualConfigTransfer`）与 OBS 视觉设置配置一起带上。
- 四组流体玻璃预设：毛玻璃 / 通透流体 / 朦胧流体 / 节能，设置页里一键套用。
- 设置页新增「流体玻璃」锚点（命令面板 `settings-liquid-glass`），可直接跳到强度、模糊与预设。
- 非流体玻璃状态（果冻关闭时）减少每帧计算，滚动更顺。

涉及：`src/shinoinject/liquidglass.ts`、`src/stores/useLiquidGlassSettingsStore.ts`、`src/components/modal/settings/pages/GraphicsPage.tsx`、`pictures.tsx`、`storage/visualConfigTransfer.ts`、`src/services/obs/visualSettingsConfig.ts`、`src/components/command-palette/commands/settingsCommands.ts`、`src/i18n/locales/{en,in,zh-CN}.ts`

### `2dc8bc02`（2026-10-18）settings(liquidglass)：预设预览图

四个预设各配一张效果图（`public/glass-presets/{clear,eco,frosted,hazy}.png`），设置页里选预设时能直接看到观感。

### `2360b7ab`（2026-10-18）settings(liquidglass)：光效与果冻效果的设置

- 新增两个可调项：**光效**（指针悬停在玻璃上时跟随的高光，按下时更亮）、**果冻效果**（拖拽时拉伸、松手回弹）。
- 同时把设置名改短：流体玻璃强度 → 折射强度、边缘弯曲距离 → 折射面距离、模糊 → 透明元素模糊值、饱和度 → 饱和。

涉及：`src/shinoinject/liquidglass.ts`、`src/stores/useLiquidGlassSettingsStore.ts`、`src/components/modal/settings/pages/GraphicsPage.tsx`、`src/services/obs/visualSettingsConfig.ts`、三份语言文件

### `5a51346c`（2026-10-19）fix(liquidglass)：修复光效、调整参数边界

光效在高亮与按下时的表现修正；光效、果冻两个参数的取值边界收紧。

### `0a572422`（2026-10-19）fix(liquidglass)：液态玻璃设置的描述文案

只改文案（en / in / zh-CN 三份一起），把各条描述改得更准确。

### `a3bf9268`（2026-10-21）fix(liquidglass)：果冻形变体验、液态玻璃覆盖

- 果冻重写：平移走饱和曲线（上限 60px，起始斜率 1px:10px），拖动轴按 1px:10px 增长、垂直轴回缩 0.35，单轴尺寸增量封顶 20px，目标尺寸限制在基准的 0.5~1.5 倍，尺寸弹簧略硬以便跟手。
- 每帧先收编外部 transform，再合成 `base + translate + 由目标尺寸换算出的 scale`（不再有 rotate / skew）。
- 修复部分场景没有覆盖液态玻璃的问题（lattice 列表、海报墙、焦点按钮等补上玻璃标记与样式）。

涉及：`src/shinoinject/liquidglass.ts`、`src/components/app/lattice/{Lattice.tsx,Lattice.css,LatticeSectionFinder.tsx,LatticeSections.css,PosterWall.tsx}`

## 设置与文案

### `91a80b84`（2026-10-19）fix(settings)：系统毛玻璃表述、去掉播放页透明背景

- 「开启播放页原生毛玻璃背景」改称「亚克力背景」，提示改成「用系统毛玻璃替代播放页背景，但液态玻璃不会折射系统亚克力」。
- 去掉播放页的透明背景开关（`IntegrationPage`、`AppearanceSection`）。

### `8501ef98`（2026-10-19）fix(remote)：去掉遥控器透明背景设置

遥控器面板里把「透明背景」那一行去掉（`src/components/remote/RemoteSheet.tsx`）。

## 页面切换与网格性能

### `20a81324`（2026-10-18）fix(pagetoggle)：切换页面卡顿（初步）

- 首页页签改成 keep-alive 分层：访问过的页签各自常驻一层，切页签只切可见性与横向位移，不重挂视图——不丢玻璃位移图、不重解码封面、不重跑各层自己的 effect。这是切换不再卡顿的关键。
- 切换动画只做 x 位移、不做 opacity：Chromium 在祖先有 opacity 动画时会丢掉整代的 `backdrop-filter`，视图里的玻璃面板会在整段动画期间不显示。
- 去掉 `useDeferredValue` 的推迟渲染：视图已经常驻，不需要把新视图排到低优先级那一拍。
- 非活动层用 `React.memo` 跳过重渲染；每层各自留一份在线列表 / 目录会话快照，隐藏层用它渲染，不会拿到活动页签的数据。

涉及：`src/library/suites/grid/home/{Grid3D.tsx,LocalGrid3DView.tsx,NavidromeGrid3DView.tsx}`

### `0632e985`（2026-10-18）fix(pagetoggle)：探索页内容过多、分页导致过渡卡顿

- `Grid3DSlider` 的渲染窗口按视口自适应（可见卡数的一半再加一点缓冲），不再固定挂焦点两侧各 18 张；窗口与「当前视口实际盖住的索引范围」取并集，焦点与滚动位置短暂不一致时不会再整片闪空白。
- 探索页进入时先给一段加载环（`exploreLoading.css`），让那些很重的入场过渡有一帧干净的画布。

### `db6389a7`（2026-10-18）fix(pagetoggle)：进一步优化性能，去除骨架屏

探索页的骨架屏换成项目统一的加载环（新增 `src/components/shared/LoadingRing.tsx` 与 `loadingRing.css`），删掉 `exploreLoading.css`。

### `0d1b95a7`（2026-10-18）fix(pagetoggle)：GridMap 被首页层级覆盖

调整 GridMap 与首页层级的 z 序，地图不再被首页压住（`GridMap.tsx`、`Grid3D.tsx`、`SwitcherPill.tsx`）。

### `dcbf9ff2`（2026-10-18）fix(pagetoggle)：连续切换标签导致渲染异常

修掉连续快速切页签时 `Grid3DSlider` 的渲染异常（渲染窗口与视口范围的写入顺序）。

## 探索页沉浸化

### `3fcb86ac`（2026-10-21）add(explore)：探索页沉浸化

- 探索页的列表固定铺满视口，上下都做渐隐：顶部按滚动量淡出，底部按「还没滚到的部分」淡出（`--ex-bottom-fade`）。
- 新增 `src/library/suites/grid/home/gridMapVisibilityStore.ts`：GridMap 显示着（含退场动画）时页头逐块淡出。它与目录会话分开——会话要等地图退场结束才关（筛选结果不能先跳回全部），页头却要从退场第一帧就淡回来。
- 页头淡出按「带玻璃的元素各自淡」来做：给页头容器加 opacity 会把 `backdrop-filter` 的取样根截断在容器内，整段动画期间玻璃都不显示。

### `57a0d54d`（2026-10-21）add(explore)：渐进模糊

新增 `ExploreEdgeBlur`：列表的两条边各由三层模糊叠成，越靠边越糊，内容是「淡出去」而不是「被切掉」。模糊带在列表内部，列表自己的淡出把它变成取样根，所以只糊列表内容，页面背景照旧。

### `c32a4268`（2026-10-21）fix(explore)：滚动条悬浮化

新增 `ExploreScrollbar`：贴在窗口右缘的玻璃药丸滚动条，滑块显示列表位置，每个分区的记号可以直接跳到那个分区。

## 底部播放器浮岛

### `1b50c4c0`（2026-10-21）add(fluid)：流动频谱浮岛

新增 `PlayerBarGlow`：播放时浮动播放条底边发出的光（白心 + 强调色光晕 + 一道横向掠过的流光），强度跟着音频能量与重拍变化。强度每帧写进 CSS 变量，不进 React state。

### `25cd8168`（2026-10-21）fix(fluid)：修复浮岛流动音乐光效

去掉没接上的流光 keyframes 与相应样式。

### `f34a10b0`（2026-10-21）fix(fluid)：动态光效的音乐律动

- 光效改成**水面波形**：canvas 绘制，频谱按对数频率切成 128 列 → 逐列时间平滑（上升快、回落慢）→ 水面高度，叠一层往右流动的正弦波纹；安静处波纹收小，响的地方才翻涌。
- 两层水面制造往前流的视差；颜色是射线型渐变，白色从圆心射向主题强调色；圆心沿 X 轴做噪声驱动的慢速往复游走（值噪声而不是正弦，看不出周期）。
- 频谱 → 高度的纯计算抽到 `src/components/floating-player/playerBarWave.ts`，绘制留在组件里；胶囊展开/收起时按布局尺寸（不是视觉尺寸）重新量画布。

涉及：`src/components/floating-player/{PlayerBarGlow.tsx,PlayerBarGlow.css,playerBarWave.ts}`、`src/components/FloatingPlayerControls.tsx`

### `1ea71002`（2026-10-21）add(play)：底部播放器岛固定按钮

- 播放条新增「固定」：固定后不再随指针离开而收缩。
- 命令面板加「固定播放条 / 取消固定播放条」，设置页加对应开关（`usePlayerChromeSettingsStore` 持久化 `player_bar_pinned`），切换时给出状态提示。

涉及：`src/components/FloatingPlayerControls.tsx`、`src/stores/usePlayerChromeSettingsStore.ts`、`src/components/command-palette/commands/settingsCommands.ts`、`src/components/app/command-palette-context/buildSettingsCommandContext.ts`、`src/components/{panelTab/shell/PanelShell.tsx,shared/SidePanelList.tsx}`、三份语言文件

## 网格卡片

### `e331ca77`（2026-10-21）fix(grid3d)：修复卡片镜像

卡片倒影被横向滚动容器（`overflow-y-hidden`）在中途切掉，断口是一条硬边，看着割裂。改成贴着卡片底边的一条 48px 带子，遮罩在带子内部就淡完；带子外本来就是全透明的，被裁掉也看不出来。

涉及：`src/library/suites/grid/home/Grid3DSlider.tsx`
