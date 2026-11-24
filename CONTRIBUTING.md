# 贡献指南

感谢你愿意帮助 Vivian Desktop Pet。这是一个 Windows 11 的非商业同人项目，代码以 MIT 许可接收贡献。

## 沟通语言

Issue、Pull Request 与提交说明可以使用中文或英文。文档以中文为主；代码标识符使用英文。

## 开始之前

- 小修复可以直接提 PR；较大的功能、模块或架构调整请先开 Issue 说明动机、范围与替代方案，避免做完才发现方向不一致。
- 一个 PR 只做一件事。不要把无关重构、格式化或依赖升级混进功能 PR。
- 不要提交任何未授权的角色美术、游戏内提取素材、含角色的截图或第三方素材。素材政策见 [LICENSE-ASSETS](LICENSE-ASSETS) 与 [docs/assets.md](docs/assets.md)。
- 不要提交 `secrets.bin`、`config.local.json`、`.env*`、签名材料或日志。

## 环境

- Windows 11 x64
- Node.js 24.x（见 `.nvmrc`）
- npm 11+

```bash
npm ci
npm run dev
```

公开仓库不含角色美术，开发版宠物窗口为空；这是预期行为。

## 常用命令

```bash
npm run dev          # 开发运行
npm run typecheck    # TypeScript strict 检查
npm run lint         # Biome
npm run test         # Vitest
npm run docs:check   # Markdown 链接检查
npm run check-assets # 图标/字体/角色图数量检查
npm run verify       # 以上全部
npm run build        # 生产构建（verify 不包含）
```

提 PR 前请至少跑通：

```bash
npm run verify
npm run build
```

## 代码约定

- TypeScript strict；不使用 `any`，确需放宽时用 `unknown` 并在注释中说明。
- 2 空格缩进、单引号、无分号、行宽 100，由 Biome 统一。
- `src/shared/` 只放类型、常量、zod schema 与纯函数，不引入 Electron、Node 或 React。
- 渲染进程不得引入 `electron`、`node:*`、文件系统或密钥。
- 跨层调用先改 `src/shared/ipc.ts`，再实现主进程、preload 与渲染层。
- 新功能优先做成 `src/main/modules/` 下的模块，并在 `src/main/modules/index.ts` 注册；参考 [docs/module-guide.md](docs/module-guide.md)。
- IPC 入参必须用 zod 校验，并校验发送方窗口。
- 定时器、监听器与 IPC handler 必须能在模块 `dispose` 中清理。
- 修复 bug 时先补复现测试，再修。

## 提交与 PR

提交信息使用 Conventional Commits，描述可用中文：

```text
<type>(<scope>): <summary>
```

常用 type：`feat`、`fix`、`docs`、`refactor`、`test`、`chore`、`perf`。

PR 模板会要求：
- 变更摘要与关联 Issue
- 行为变化与测试方式
- 是否涉及 IPC、存储迁移或素材
- 已运行 `npm run verify` 与 `npm run build`

项目不要求签署 CLA；提交即表示你同意以 MIT 许可提供该贡献。DCO 可选，不强制。

## 素材贡献

- 只接受你有权分发的原创素材，并在 PR 中写明来源、作者、许可与生成方式。
- 不接受从游戏中提取的图片、音频、模型或含角色的截图。
- 中性图标由项目维护，修改前请先开 Issue 对齐视觉方向。
- 字体若需替换，必须保持 OFL 兼容并更新 `NOTICE` 与 `assets/CREDITS.md`。

## 安全

发现安全问题时不要开公开 Issue，请按 [SECURITY.md](SECURITY.md) 的私密渠道报告。

## 行为准则

参与本项目即表示同意遵守 [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)。
