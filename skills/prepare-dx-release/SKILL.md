---
name: prepare-dx-release
description: Use when cutting a Shino Deluxe (dx) release of this fork — a service-pack style version such as 0.7.29.1 shown as 0.7.29S, published to GitHub as a dx-* tag with the built Windows installer attached. Covers the version scheme, the release-intro files and locales, the Windows build prerequisites that make a packaged app crash on launch, the installer filename electron-builder mangles for four-part versions, and publishing the release with its body. Not for upstream Realeco releases; those follow prepare-folia-release.
---

# Prepare a Shino Deluxe (dx) release

这个仓库（`Riru233/folia-major`，Shino Deluxe 分支）自己的发版流程。上游官方版走 `prepare-folia-release`，两者**不要混用**：
dx 版有自己的版本号写法、自己的 tag 前缀、自己的 release 正文格式，并且**不经过** `realeco-release` → main 的那条 CI 发布链路。

## 0. 先分清两条链路

| | 上游 Realeco | 本仓库 dx |
|---|---|---|
| 版本号 | `A.B.C`（如 `0.7.29`） | `A.B.C.D` 服务包（如 `0.7.29.1`），界面上写 `0.7.29S` |
| 触发发布 | 推 `realeco-release` 到 `main`，`.github/workflows/electron-release.yml` 自动跑 | **本地构建 exe**，再用 API 建 GitHub Release 并上传 |
| tag | `vA.B.C` | `dx-A.B.CDs`（小写渠道字母，如 `dx-0.7.29s`） |
| release 标题 | 工作流生成 | `Shino Deluxe <displayVersion>`（如 `Shino Deluxe 0.7.29S`） |

**⚠️ 最大的坑：不要把 dx 版的提交合进 `main`。** 工作流只在 `main` 上有 `realeco-release` 变更时触发，
但 dx 版的 `realeco-release` 写的是 `0.7.29.1`——一旦它随合并进了 `main`，CI 会把它当成正式版发布，
和官方的 `0.7.29` 抢同一个 latest。dx 提交只留在自己的分支（`shino` / `deluxe`）。

同理，`package.json` 的 `version` 也会被 dx 版改写。合并回上游前先把它还原成官方的版本号，
否则下游 `npm` / electron-builder 看到的都是 dx 的版本。

## 1. 定版本号

- 桌面版本号 `A.B.C.D`：在官方基线 `A.B.C` 上追加一位，`0.7.29` → `0.7.29.1`。
- 界面显示 `displayVersion`：`0.7.29S`。渠道字母由用户定（`S` = Shino，历史上有 `L`、`Classic`）。
- tag：`dx-` + 显示版本小写 = `dx-0.7.29s`。
- 确认目标版本**高于**已发布的 dx 版（`git tag --list 'dx-*'`，以及 API 里的 release 列表）。

## 2. 改发版内容

### 2.1 `src/components/modal/newFeaturesRelease.ts`

```ts
export const NEW_FEATURES_RELEASE: NewFeaturesRelease = {
    i18nKey: 'releaseNotes.v0_7_29_1',      // = 'releaseNotes.v' + 版本号里的点换下划线
    displayVersion: '0.7.29S',
    banner: { imageUrl: shinoBanner, i18nKey: 'releaseNotes.v0_7_29_1.banner' },
    features: [ /* 3–6 张卡片 */ ],
};
```

规则：

- `i18nKey` 必须等于 `releaseNotes.v${USER_GUIDE_AUTO_OPEN_VERSION.replace(/\./g, '_')}`，`test/unit/newFeaturesRelease.test.ts` 会核对。
- **修复版不要写 `majorUpdate`**。写了介绍上方就出现「<代号> Update SP<n> · 重大更新」标签；修复版不显示这个标签，整条字段去掉即可。
- banner 想跳首页页签才写 `targetTab`（如 `'welfare'`）。只当标题图用就**不写** `targetTab`：`NewFeaturesIntro` 会只画图，不渲染按钮、提示和点击（`test/unit/newFeaturesRelease.test.ts` 的 banner 用例只在有 `targetTab` 时才要求 `hint` 文案）。
- 标题图放 `assets/banners/`，用 `?url` 导入。图里的版本字样要和 `displayVersion` 一致。

### 2.2 四份语言文件

`en.ts`、`zh-CN.ts`、`in.ts`、`vi.ts` 各加一个 `v0_7_29_1` 对象（**保留历史版本，不要删旧的**）：

- `intro`；
- `banner.alt`（有 `targetTab` 时再加 `banner.hint`）；
- 每张卡片的 `<id>.title` 与 `<id>.description`。

**没有简体中文之外的繁体文件**：`zh-TW` 由 `dev/i18n/traditionalLocalePlugin.mjs` 从 `zh-CN` 构建期转出来，不用手写。

### 2.3 版本号落盘（四处，必须一致）

- `package.json` → `version`
- `package-lock.json` → 顶层 `version` 与 `packages[""].version`（两处）
- `realeco-release`
- `src/components/modal/userGuideContent.ts` → `USER_GUIDE_AUTO_OPEN_VERSION`

校验（应该输出同一个版本号）：

```powershell
node -e "const fs=require('fs');const {validateRealecoReleaseMetadata:v}=require('./shared/realecoReleaseMetadata.cjs');console.log(v({commitMessage:'release: v0.7.29.1',releaseFileContent:fs.readFileSync('realeco-release','utf8'),packageVersion:require('./package.json').version}))"
```

`shared/realecoReleaseMetadata.cjs` 已支持 `A.B.C` 与 `A.B.C.D`（导出 `parseReleaseVersion` / `compareReleaseVersions`，
workflow 的版本比较也复用它们）。`0.7.29 < 0.7.29.1 < 0.7.30`；带 `-beta` 或带 `v` 前缀仍然会被拒。

## 3. 构建安装包

完整前置与排错见 `build-desktop`。dx 发版额外要记住两条，否则打出来的东西**启动即崩**、或文件名不对。

### 3.1 Windows 目录完整性（必查）

```powershell
icacls . | Select-String 'Mandatory Label'
```

出现 `Low Mandatory Level` 就修（Chromium 主进程不允许 Low 完整性运行，症状是 `0xc0000005` / `0x80000003`，
看起来像打包坏了，其实是权限）。顺序不能反——先补写权限再改完整性级别：

```powershell
icacls . /grant "$($env:USERNAME):(OI)(CI)F" /T /C /Q
icacls . /setintegritylevel "(OI)(CI)M" /T /C /Q
```

改完确认 `release` 与 `release\win-unpacked` 都是 Medium。

### 3.2 构建

```powershell
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue   # 有它 electron 会变成纯 Node
npm run build:electron
```

### 3.3 产物重命名（四段版本号必踩）

electron-builder 会按 SemVer 拆四段版本号，把 `0.7.29.1` 拼成 **`Folia-Setup-0.7.2-9.1.exe`**。
这是已知行为（上一个 `0.7.29-shino-dx` 也是手工改的名），不是构建失败：

```powershell
Copy-Item 'release/Folia-Setup-0.7.2-9.1.exe' 'release/Folia-Setup-0.7.29S-shino-dx.exe' -Force
```

发布用的就是这个重命名后的文件。

### 3.4 启动验证（必做）

构建退出码 0 不等于能用：

```powershell
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
$p = Start-Process -FilePath 'release\win-unpacked\Folia.exe' -PassThru
Start-Sleep -Seconds 20
if (Get-Process -Id $p.Id -ErrorAction SilentlyContinue) { "RUNNING" } else { "EXITED $($p.ExitCode)" }
Get-Process Folia -ErrorAction SilentlyContinue | Stop-Process -Force
```

## 4. 提交并打 tag

发版提交信息**必须恰好**是 `release: vA.B.C.D`，多一个字都会让校验失败：

```powershell
git add -A
git commit -m "release: v0.7.29.1"
git push origin <branch>
git tag dx-0.7.29s
git push origin dx-0.7.29s
```

不要在 `main` 上做这件事（见第 0 节）。

## 5. 发布 GitHub Release

**这台机器上没有 `gh` CLI**，`Invoke-RestMethod` 发 POST 时会把 UTF-8 正文弄坏（返回里全是 .NET 资源名）。
用 `git credential fill` 取凭据 + `node` 的 `https` 发请求。

```powershell
$cred = ("protocol=https`nhost=github.com`n`n" | git credential fill 2>&1)
$tok = (($cred -split "`n") | Where-Object { $_ -match '^password=' }) -replace '^password=',''
$env:GHTOK = $tok
node tmp-publish.cjs
```

`tmp-publish.cjs` 的骨架（建 release + 上传资产，用完删）：

```js
const https = require('https'); const fs = require('fs');
const TOKEN = process.env.GHTOK, OWNER = 'Riru233', REPO = 'folia-major', TAG = 'dx-0.7.29s';
// POST /repos/:owner/:repo/releases  { tag_name, name, body, draft:false, prerelease:false }  → 201
// POST https://uploads.github.com/repos/:owner/:repo/releases/:id/assets?name=<file>         → 201
// 上传时 headers 要给 'Content-Type': 'application/octet-stream' 和精确的 Content-Length，body 用 fs.createReadStream 管道
```

要点：

- 正文按 UTF-8 编码成 Buffer 再写，别让 PowerShell 经手字符串。
- 资产名直接决定下载文件名，用 `Folia-Setup-<displayVersion>-shino-dx.exe`。
- 建完再 GET `/releases/tags/<tag>` 核对 `draft:false`、`prerelease:false`、资产 `state: uploaded`。

### release 正文模板

```markdown
该版本为BLG获胜专版

旧项目构建历史请见：[过往项目](https://github.com/Riru233/folia-major-legacy)

官方版: https://github.com/chthollyphile/folia-major/releases/tag/vA.B.C

安装包地址（飞书/豆包）: <用户给的分享链接>

tag: dx-A.B.CDs

# 更新内容

福利歌曲更新内容见[dx-<上一版>](https://github.com/Riru233/folia-major/releases/tag/dx-<上一版>)

## 1. ...
```

正文内容以用户当次给的为准，不要自作主张增删条目；这里只需要保证格式。

## 6. 交付前自检

- [ ] `i18nKey` 与 `USER_GUIDE_AUTO_OPEN_VERSION` 对得上（`npx vitest run -c vitest.config.ts test/unit/newFeaturesRelease.test.ts`）。
- [ ] 四份语言都有 `intro`、`banner.alt`、每张卡片的 title/description。
- [ ] 修复版没有 `majorUpdate`；不需要跳转的 banner 没有 `targetTab`。
- [ ] 四处版本号一致，`validateRealecoReleaseMetadata` 通过。
- [ ] `npm run typecheck` 没有**新增**错误（本仓库基线里有若干既有错误，见下）。
- [ ] 安装包已重命名为 `Folia-Setup-<displayVersion>-shino-dx.exe`，且解包版实测能起窗口。
- [ ] 提交信息恰好 `release: vA.B.C.D`；tag `dx-A.B.CDs` 已推送。
- [ ] Release 已建、资产 `uploaded`、正文与用户给的一致。

## 已知的既有失败（不是本次改动引入）

跑 `npm run test:unit` / `npm run typecheck` 会看到这些，**先确认它们在改动前就红**，别当成回归：

- `test/unit/i18n/vietnameseLocale.test.ts`：vi 缺 `visualizerBackgroundModeTransparent` / `...Desc` 两个键。
- `test/component/_tmpBravaisHistory.spec.ts`、`test/ui/_tmpNarrow.spec.ts`：调试残留，占着多条类型错误。
- 若干 i18n 文件里有重复键（TS1117），`settingsAnchorModel.ts` 的 `'lab'` 不在 `SettingsSubviewId` 里。
- `offsetTuningStore`、`bilibiliMvTuning`、`themeSyncRegistry` 等套件有超时类失败，单独重跑也会红。

## 提交与审查

- 发版准备的提交信息只能是 `release: vA.B.C.D`；内容改动（修 bug、加功能）单独提交，别混进发版提交。
- 按 `development-workflow`：纯发版准备（版本号、介绍文案、banner）不单独审查；若本次顺手改了发布校验、CI 或业务代码，那部分要按完整流程审查。
