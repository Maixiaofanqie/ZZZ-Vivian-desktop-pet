# 角色美术目录

本目录在**公开源码仓库**中只包含这份说明，不包含任何角色图片。

## 运行时行为

`src/renderer/staticImages.ts` 会 glob：

```text
assets/characters/*/vivian_static_*.png
```

- 找到完整 7 张图时，宠物窗口按设置显示对应形象。
- 没有图片（本仓库的默认状态）或图片加载失败时，`src/renderer/pet/PetStage.tsx` 清空画布并把命中面罩置零，宠物窗口保持空白（透明、不拦截点击）；设置页会提示如何添加本地形象。
- 设置页会显示占位预览与说明，并禁用「双击切换形象」。

## 本地 overlay（维护者）

有授权的 7 张图可放在任意子目录，例如：

```text
assets/characters/<set>/vivian_static_01.png
...
assets/characters/<set>/vivian_static_07.png
```

要求：
- PNG，512×512，RGBA，透明背景，无白边。
- 文件名严格为 `vivian_static_01.png` 到 `vivian_static_07.png`。
- 顺序对应设置页标签：大笑 / 平静 / 委屈 / 害羞 / 慌张 / 困倦 / 眨眼。
- 该目录已被 `.gitignore` 忽略（`assets/characters/*`，保留本 README），不要提交到公开仓库。
- 维护者构建前可用 `VIVIAN_REQUIRE_CHARACTER_ART=1 npm run check-assets` 强制要求 7 张图。

## 授权边界

角色美术不适用本仓库的 MIT 许可。官方非商业发行版按素材作者许可包含完整形象；不得商业改编、从安装包提取后再分发或复用于其他项目。详见仓库根目录的 `LICENSE-ASSETS` 与 `NOTICE`。
