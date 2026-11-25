# 从源码构建

本文说明如何在本机运行、校验和打包 Vivian Desktop Pet。官方安装包由维护者使用本地角色美术 overlay 构建；公开仓库本身始终是「无角色美术」的可构建状态。

## 环境

- Windows 11 x64
- Node.js 24.x（仓库根目录的 `.nvmrc` 为 `24`；`package.json` 的 `engines` 要求 `>=24 <25`）
- npm 11+

不依赖 Python、Rust 或 node-gyp 原生模块。

## 安装依赖

```bash
npm ci
```

请使用 `npm ci` 而不是 `npm install`，以严格按 `package-lock.json` 安装。

> 如果 Electron 二进制下载失败，可清理 `node_modules` 后重试，或从 Electron 官方镜像重新安装。CI 使用 `windows-latest` + Node 24。

## 开发运行

```bash
npm run dev
```

开发版会加载 `src/renderer/staticImages.ts` 中 `assets/characters/*/vivian_static_*.png` 的图片。公开仓库该目录只有 `README.md`，因此宠物窗口保持空白（透明、不拦截点击）；设置页会提示如何添加本地形象。

## 校验

```bash
npm run verify
```

`verify` 依次执行：
1. `tsc --noEmit`（主进程与渲染层两套配置）
2. `biome check .`
3. `vitest run`
4. `scripts/check-docs.mjs`（Markdown 相对链接）
5. `scripts/check-assets.mjs`（图标、字体与角色图数量）

`verify` **不包含**构建。提交前请再跑：

```bash
npm run build
```

## 构建与打包

```bash
npm run build        # 输出 out/main、out/preload、out/renderer
npm run start        # electron-vite preview，需先 build
npm run package:dir  # 生成 release/win-unpacked
npm run dist         # 生成 NSIS 安装包
```

- `electron-builder.yml` 的 `electronDist` 指向 `node_modules/electron/dist`，因此不要跳过 Electron 二进制安装。
- 打包使用 `build/icon.ico` 与 `assets/icons/tray.png`；两者都是仓库内置的原创中性图标，可由 `npm run neutral-icons` 从 `build/icon.svg` 重新生成。
- `npm run dist` 生成的安装包只含中性图标、不含角色美术，**不是**官方发行版。官方发行版的版本号、SHA-256 与素材说明以 Releases 页面为准。

## 角色美术与本地 overlay

公开仓库不包含角色美术。维护者如需在本地构建带完整形象的官方包，可把有授权的 7 张图片放到：

```text
assets/characters/<set>/vivian_static_01.png
...
assets/characters/<set>/vivian_static_07.png
```

要求：
- 512×512 RGBA PNG，透明背景，无白边。
- 文件名严格为 `vivian_static_01.png` 到 `vivian_static_07.png`。
- 顺序对应设置页标签：大笑 / 无语 / 委屈 / 思考 / 嫌弃 / 开摆 / wink。
- `assets/characters/*/` 已被 `.gitignore` 忽略，不要提交到公开仓库。

构建前可用环境变量强制要求 7 张图：

```bash
VIVIAN_REQUIRE_CHARACTER_ART=1 npm run check-assets
```

该变量只影响素材检查；图片是否存在由本地 overlay 决定。

## 图标

```bash
npm run neutral-icons
```

脚本使用 Electron 的隐藏窗口把内置 SVG 绘制到画布，导出：
- `build/icon.svg`
- `build/icon.png`（256×256）
- `build/icon.ico`（16/24/32/48/64/128/256）
- `assets/icons/tray.png`（32×32）

图标为原创暮紫伞形，不依赖任何角色素材。

## 清理

```bash
rm -rf out release node_modules
npm ci
```

Windows PowerShell 可用 `Remove-Item -Recurse -Force`。

## 许可提醒

- 代码与原创文档：MIT。
- 字体：SIL OFL 1.1，必须保留 `assets/fonts/OFL.txt` 与版权行。
- 角色美术：不在本仓库；官方 Release 中的角色美术不适用 MIT，不得商业改编、提取后再分发或复用。
- 不要提交 `secrets.bin`、`config.local.json`、签名材料或未授权素材。
