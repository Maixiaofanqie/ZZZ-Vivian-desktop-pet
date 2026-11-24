# 薇薇安桌宠 · Vivian Desktop Pet

面向 Windows 11 的非商业同人桌面宠物。她安静地待在桌面右下角：单击说一句话，拖拽换位置，久坐、深夜和整点时会轻声提醒。项目使用 Electron、TypeScript 与 React 构建。

> **源码仓库说明**：本仓库**不包含角色美术**。从源码构建时宠物窗口为空（透明、不拦截点击）；包含完整角色形象的官方安装包只在 [Releases](https://github.com/Maixiaofanqie/ZZZ-Vivian-desktop-pet/releases) 提供，按作者抖音@星穹列车星某的非商业同人授权分发。

[English summary](README.en.md)

## 功能

- **桌面宠物**：透明置顶窗口、逐像素点击穿透、拖拽与下落、悬停反馈、托盘与单实例。
- **对话气泡**：单击台词、时段问候、定时主动问候（默认关闭）、纪念日与互动里程碑彩蛋、久坐与深夜提醒；逐字淡入，点击可补全全文。
- **共处记录**：首次见面、互动次数、活跃日与里程碑；只保存在本机。
- **模块**：番茄钟、预知式提醒、整点报时、Claude Code 联动（只读元数据）、天气（Open-Meteo）、日程 · 待办。
- **设置**：形象选择（官方安装版）、待机微动效、夜间互动、开机自启、数据备份导入导出与共处记录重置。
- **隐私**：无遥测、无云同步；除天气与手动打开 VSCode 外不发起网络请求。

## 系统要求

| 使用方式   | 要求                                                 |
| ---------- | ---------------------------------------------------- |
| 官方安装包 | Windows 11 x64；无需管理员权限；安装包未签名         |
| 从源码构建 | Windows 11 x64；Node.js 24.x（见 `.nvmrc`）；npm 11+ |

项目不依赖 Python、Rust 或原生编译工具链。

## 安装（官方发行版）

1. 从 [Releases](https://github.com/Maixiaofanqie/ZZZ-Vivian-desktop-pet/releases) 下载 `Vivian-Desk-Pet-1.0.0-Setup.exe`。
2. 如果 Windows 显示「已保护你的电脑」，点击「更多信息」→「仍要运行」。安装包没有代码签名证书；请不要关闭 SmartScreen 或修改系统安全设置。
3. 按向导安装。默认按当前用户安装，不需要管理员权限。
4. 安装完成后，桌面与开始菜单会出现快捷方式；可在设置中开启「开机自启」。

> 卸载会删除 `%APPDATA%\vivian-desktop-pet\` 下的设置、共处记录、模块数据与日志。卸载前请先在设置页导出备份。

## 从源码运行

```bash
git clone https://github.com/Maixiaofanqie/ZZZ-Vivian-desktop-pet.git
cd ./ZZZ-Vivian-desktop-pet
npm ci
npm run dev
```

源码仓库不包含角色美术，因此开发版宠物窗口为空（透明、不拦截点击）；设置页会提示如何添加本地形象。这是预期行为，不是加载失败。

构建与打包：

```bash
npm run build        # 构建主进程、preload 与渲染层到 out/
npm run package:dir  # 生成未安装的 release/win-unpacked（先 build）
npm run dist         # 生成 NSIS 安装包（先 build）
```

公开源码构建出的安装包同样只含中性图标、不含角色美术，不代表官方发行版。

## 常用命令

| 命令                    | 作用                                            |
| ----------------------- | ----------------------------------------------- |
| `npm run dev`           | 开发运行（electron-vite）                       |
| `npm run build`         | 生产构建到 `out/`                               |
| `npm run start`         | 预览构建产物（需先 build）                      |
| `npm run verify`        | 类型检查 + Biome + Vitest + 文档链接 + 素材检查 |
| `npm run test`          | 只跑单元测试                                    |
| `npm run package:dir`   | 生成未安装目录（冒烟）                          |
| `npm run dist`          | 生成 NSIS 安装包                                |
| `npm run neutral-icons` | 由内置 SVG 重新生成中性图标                     |

`npm run verify` 不包含 `npm run build`；提交前两者都建议跑一遍。

## 目录结构

```text
src/
  main/       主进程：窗口、托盘、服务、模块、存储
  preload/    contextBridge 白名单出口
  renderer/   React 设置页、功能面板与宠物画布
  shared/     IPC 契约、类型、zod schema、常量
tests/        Vitest 单元测试
scripts/      文档/素材检查、中性图标生成、浸泡采样
assets/       字体（OFL）、中性图标、素材说明
build/        打包资源：中性图标、NSIS 自定义脚本
docs/         用户手册、架构、设计与开发文档
```

## 文档

- [用户手册](docs/user-guide.md)
- [架构设计](docs/architecture.md)
- [视觉与交互规范](docs/design.md)
- [技术选型](docs/tech-stack.md)
- [代码规范](docs/code-style.md)
- [模块开发指南](docs/module-guide.md)
- [素材规范](docs/assets.md)
- [从源码构建](BUILDING.md)
- [贡献指南](CONTRIBUTING.md)
- [安全策略](SECURITY.md)

## 素材与许可

- **代码、原创文档与原创中性图标**：MIT，见 [LICENSE](LICENSE)。
- **Noto Serif SC 字体**：SIL Open Font License 1.1，随应用分发；许可全文见 [assets/fonts/OFL.txt](assets/fonts/OFL.txt)，来源与版本记录见 [NOTICE](NOTICE) 与 [assets/CREDITS.md](assets/CREDITS.md)。
- **角色美术**：**不在本仓库中**。官方非商业发行版按作者 **抖音@星穹列车星某** 的非商业授权包含完整角色形象；该素材不适用 MIT，不允许商业改编、提取后再分发或复用于其他项目。详见 [LICENSE-ASSETS](LICENSE-ASSETS)。
- **第三方依赖**：Electron/Chromium、React、Zod、Open-Meteo 等归属与许可见 [NOTICE](NOTICE)。

本项目是《绝区零》的非官方同人作品。《绝区零》及相关角色版权归米哈游（miHoYo）所有；本项目与米哈游无隶属关系，不售卖、不内购、不投放广告。若版权方或素材作者要求，维护者会下架相关内容。

## 隐私

设置、共处记录、记忆与日志只保存在本机。天气功能只把城市名/坐标与固定参数发送给 Open-Meteo；Claude Code 联动只读取项目元数据与会话 id/名称，不读取对话内容、prompt 或代码。项目不包含遥测或自动更新检查。

## 贡献与安全

欢迎提交 Issue 与 Pull Request；请先阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。安全问题请通过 GitHub 的私密漏洞报告渠道提交，不要公开披露，见 [SECURITY.md](SECURITY.md)。

---

## English summary

Vivian Desktop Pet is an unofficial, non-commercial Windows 11 desktop pet built with Electron, TypeScript and React. It lives in the corner of your desktop, speaks through a small bubble, remembers interactions locally, and ships optional modules such as a pomodoro timer, reminders, a read-only Claude Code project panel, weather via Open-Meteo, and a schedule list.

**This source repository intentionally contains no character artwork.** A source build has an empty pet window. The official non-commercial release includes the full character art under the permission of 抖音@星穹列车星某; that artwork is not MIT-licensed and may not be commercially adapted, extracted, redistributed, or reused in other projects. See [LICENSE-ASSETS](LICENSE-ASSETS).

Code, original documentation and the neutral icons are MIT-licensed. Noto Serif SC is distributed under the SIL Open Font License 1.1. See [NOTICE](NOTICE) and [README.en.md](README.en.md).

This is an unofficial fan project. _Zenless Zone Zero_ and its characters are copyright miHoYo. No affiliation, sales, ads, or in-app purchases.
