---
name: sync-official-version
description: Use when the official chthollyphile/folia-major upstream ships a new version and its commits must be merged into local main in chronological order — computing the from→to range from the docs/upstream-sync.json baseline, cherry-picking each no-merge commit with original authors preserved, resolving conflicts upstream-first while keeping local liquid-glass edits, then updating the baseline and verifying.
---

# Sync Official Version

把官方上游 `chthollyphile/folia-major` 的新版本提交合入本地 `main`。核心约束：**按时间顺序、一提交一条目、保留原作者**；冲突时以上游（传入的提交）为准，但本地"初始状态之后的更改"（流体玻璃等自定义）不得被覆盖。

同步 = 追加提交，历史不改写，推送**不需要 `--force`**。

## 1. 确定范围（从哪个提交到哪个提交）

- **起点**：`docs/upstream-sync.json` → `lastSynced`，即上次同步到的上游提交（当前为 `607771d` release: v0.7.19；0.7.18 范围 `96102de..2fdf038`、0.7.19 范围 `c34aa2b..607771d` 均已逐条合入）。
- **终点**：用户给出的 tag / 分支 / SHA（如 `v0.7.20`），缺省为官方 `main`。
- **范围**：`<lastSynced>..<target>`，只取 no-merge 提交，`--reverse` 按时间正序。
- 脚本会校验"基线是目标的祖先"，范围不成立说明基线写错或拉错仓库。

先干跑，把"从 X 到 Y、共 N 条、作者分布"列给用户确认，再执行：

```powershell
node dev/sync/syncOfficial.mjs                      # 列出范围（干跑，会 fetch 官方仓库）
node dev/sync/syncOfficial.mjs --to v0.7.20         # 指定目标 tag/分支/SHA
node dev/sync/syncOfficial.mjs --status             # 查看基线与进行中状态
node dev/sync/syncOfficial.mjs --apply --to v0.7.20 # 执行
node dev/sync/syncOfficial.mjs --apply --no-fetch   # 断网时用本地已有官方 refs
```

`npm run sync:official -- …` 是等价入口，但本机 PowerShell 5.1 调 npm.cmd 时会丢掉 `--` 分隔符，参数传不进脚本（cmd.exe 下正常）；**PowerShell 里一律用 node 直调**，或 `cmd /c "npm run sync:official -- …"`。

脚本实现：`dev/sync/syncOfficial.mjs`（fetch 官方仓库 → 算范围 → 逐条 `git -c core.editor=true cherry-pick` → 完成后更新基线）。状态存在 `.git/sync-official-state.json`，冲突中断后重跑 `--apply` 即自动 `--continue` 并从断点续pick。

## 2. 执行与中断处理

- 执行前要求工作区干净；应在 `main` 上执行。
- 一条提交冲突 → 脚本停下、打印冲突文件与配方，解决后 `git add -A`，重跑 `--apply`。
- "改动已在本地"的空提交会自动 `cherry-pick --skip` 并计数。
- 全部完成时脚本会：
  - 跑玻璃标记守卫（`src/` 中 `data-glass` / `useGlass(` 行数，同步前后不得减少）；
  - 更新 `docs/upstream-sync.json`（**留作未提交改动**，由用户确认后提交）；
  - 打印验证与推送提示。

## 3. 冲突配方（有冲突以传入为准，本地改动不被覆盖）

通用三方配方，对每个冲突文件 `F`：

```powershell
git checkout --theirs -- F                       # 取上游（本次传入提交）版本
git show <lastSynced>:F > base.tmp               # 本地改动所基于的上游版本
git show <sync前的HEAD>:F > local.tmp            # 同步开始前的本地版本（状态文件 preTip）
git merge-file F base.tmp local.tmp              # 0=干净；非0=有冲突标记需手工
git add -A
```

即"上游新内容 + 本地相对旧上游的改动"三方叠加。拿不准时人工核对，原则：

1. **上游侧为准**：上游的重构、新功能、格式化直接采纳。
2. **贴回本地自定义**：`data-glass`、`useGlass()`、渐变/描边 style、玻璃遮罩动画等本地流体玻璃改动逐一贴回；贴回后核对 `git grep -c -e data-glass -e 'useGlass(' F` 不少于同步前。
3. **按提交时间顺序依次插入**：只贴"该提交时刻已存在"的本地改动；属于未来提交才引入的行（例如上游后续才加的 `onAnimationComplete`）不要提前贴进来，等轮到那条提交时再合入。
4. **i18n / 发布说明双存**：上游新增的 `vX_Y_Z` releaseNotes 与本地历史条目（如 `v0_7_18s-shino`）并存，冲突块里双方都要保留。
5. 保留注释，尤其是 `@note` 注释；不要顺手删除或翻译。

已知易冲突文件（历史配方，可复用）：

| 文件 | 配方 |
| --- | --- |
| `src/components/modal/SettingsModal.tsx`、`src/components/UnifiedPanel.tsx`、`src/components/shared/SlideActionButton.tsx`、`src/components/wall/WallToolsButton.tsx` | 取上游整文件 + `git merge-file` 叠回玻璃改动 |
| `src/components/wall/wall.css` | 以上游为准（本地 2 空格缩进保留） |
| `src/i18n/locales/{en,in,zh-CN}.ts` | 上游新版本对象与本地历史对象并存 |
| `src/components/modal/newFeaturesRelease.ts`、`userGuideContent.ts` | 取上游（新版本号/卡片），本地历史版本不删 |

## 4. 完成后验证与收尾

```powershell
git diff --check
npm run typecheck
npm run test:unit        # 与同步前基线对比；本仓库有 4 个既存失败的 source-contract 测试 + modDigest 偶发
```

验证方式选择遵循 `skills/testing-strategy/SKILL.md`；新增依赖（上游可能加 package.json 条目）记得 `npm install` 后再构建。

收尾动作（需用户确认后执行）：

1. 提交基线更新：`chore: 同步官方上游基线至 <短SHA>`（只含 `docs/upstream-sync.json`）。
2. 汇报：从→到、条数、作者分布、冲突文件与处理方式、跳过条数、验证结果。
3. `git push`（普通推送；只有历史重建才用 `--force`）。

## 5. 附录：一次性全量历史重建（2000+ 条，非常规）

当用户要求把本地根提交（快照型"初始状态"）替换为官方完整历史时（2026-10-14 已做过一次）：

1. 找到与本地根内容对应的上游边界提交（当时为 `a3574a78` = `96102de^`），`git rev-list --count <边界>` 确认祖先条数（2318 条），确认对象已在本地。
2. 本地根相对边界的差异就是"初始状态"的真实改动（当时仅 6 文件）。
3. 用 `git commit-tree <本地根^{tree}> -p <边界> -m "初始状态"` 造出等价提交（树与本地根逐字节相同，保留原作者与日期）。
4. `git rebase --onto <新提交> <本地根> main`：起点树相同 ⇒ 后续所有提交零冲突原样重放，本地改动不被覆盖。
5. 校验：`git diff <重建前tip> main` 必须为空；`git rev-list --max-parents=0 main` 应为官方 init 提交。
6. 这种改写历史的场景才用 `git push --force-with-lease`，并先留备份分支。
