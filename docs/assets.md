# 素材规范

本文说明源码仓库的素材目录、命名、授权边界与交付检查。公开仓库固定为「无角色美术」状态。

## 1. 目录结构

```text
assets/
├── characters/          角色美术 overlay（本仓库只有 README.md）
│   └── README.md
├── fonts/               Noto Serif SC 与 OFL.txt
├── icons/               托盘图标（原创中性图标）
├── audio/               预留（当前为空）
├── live2d/              预留（当前为空）
├── sprites/             预留（当前为空）
└── CREDITS.md           素材来源与授权记录
build/
├── icon.svg             原创中性图标源
├── icon.png / icon.ico  由 icon.svg 生成
└── installer.nsh        NSIS 自定义卸载脚本
```

本仓库**不包含**角色立绘、表情图、裁切图、含角色的截图或由角色图派生的图标。`assets/characters/` 只有说明文件；源码构建没有角色图时宠物窗口保持空白（透明、不拦截点击），不提供占位角色图。

## 2. 角色美术 overlay（本地）

维护者如需在本地构建带完整形象的官方包，可把有授权的图片放到：

```text
assets/characters/<set>/vivian_static_01.png
...
assets/characters/<set>/vivian_static_07.png
```

要求：
- 7 张 PNG，512×512，RGBA，透明背景，无白边、无底色、无阴影残留。
- 文件名严格为 `vivian_static_01.png` 到 `vivian_static_07.png`。
- 顺序对应设置页标签：大笑 / 无语 / 委屈 / 思考 / 嫌弃 / 开摆 / wink。
- `assets/characters/*/` 已被 `.gitignore` 忽略，不要提交到公开仓库。
- 维护者本地构建前可设置 `VIVIAN_REQUIRE_CHARACTER_ART=1`，让 `npm run check-assets` 要求正好 7 张图。

运行时 `src/renderer/staticImages.ts` 会 glob `assets/characters/*/vivian_static_*.png`；没有图片时自动走占位分支。

## 3. 图标

```bash
npm run neutral-icons
```

脚本用 Electron 隐藏窗口把 `build/icon.svg` 绘制到画布，导出：
- `build/icon.svg`
- `build/icon.png`（256×256）
- `build/icon.ico`（16/24/32/48/64/128/256）
- `assets/icons/tray.png`（32×32）

图标为原创暮紫伞形，不依赖任何角色素材，随代码按 MIT 许可提供。源码构建没有角色图时不显示任何占位角色，宠物窗口保持空白。

## 4. 字体

- 文件：`assets/fonts/NotoSerifSC-VF.ttf`
- 许可：SIL Open Font License 1.1；全文见 `assets/fonts/OFL.txt`
- 版权：Copyright 2017–2023 Adobe
- 版本：`2.02;241114204558;non-release`
- SHA-256：`a4aed9985a5916fbf6690456f8732a9fccd517938e353165d4142b4f11a39280`
- 来源：Google Fonts / notofonts/noto-cjk 上游发行版

未修改字体文件；未单独售卖字体；未使用 Noto 名称推广修改版。若未来替换或子集化，必须继续保持 OFL 兼容并更新 `NOTICE` 与 `assets/CREDITS.md`。

## 5. 音频与 Live2D（预留）

当前版本不包含音频或 Live2D 模型。若未来引入：
- 音频优先 OGG Vorbis，44.1kHz，单条语音 < 8 秒，必须有静音开关。
- Live2D 模型放 `assets/live2d/<model_id>/`，记录 Cubism SDK 版本与许可；未获授权不纳入仓库。
- 任何新增素材都要在 `assets/CREDITS.md` 记录文件名、来源、作者、授权方式与日期。

## 6. 来源与授权纪律

- 本项目为非商业同人作品；《绝区零》角色与官方素材版权归米哈游所有。
- **不从游戏中提取素材**，不提交游戏内图片、音频、模型或含角色的截图。
- 只接受你有权分发的原创或已授权素材；委托绘制需保留授权范围。
- 使用 AI 生成素材需注明工具与生成日期。
- 角色美术**不进入本仓库**；官方非商业发行版按作者 **抖音@星穹列车星某** 的授权提供，不适用 MIT，不允许商业改编、提取后再分发或复用于其他项目。详见 `LICENSE-ASSETS`。
- 若权利人或素材作者提出要求，维护者会停止分发并下架相关内容。

## 7. 交付检查清单

- [ ] 透明背景、无白边
- [ ] 命名符合规范
- [ ] 7 张图 id 与顺序正确
- [ ] 体积符合预算（单帧不宜超过 500KB）
- [ ] `assets/CREDITS.md` 已记录来源与授权
- [ ] `npm run check-assets` 通过
- [ ] 未把 `assets/characters/*/` 或 `assets/source/` 提交进仓库
- [ ] 在 125% / 150% 缩放下不发虚
