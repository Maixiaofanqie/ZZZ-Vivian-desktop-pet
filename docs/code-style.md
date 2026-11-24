# 代码规范

## 1. 基本约束

- 语言：TypeScript strict；禁止 `any`（确需时用 `unknown` + 收窄，并注释原因）。
- 编码：UTF-8（无 BOM）；换行 LF。
- 缩进：2 空格；单引号；语句末尾不写分号（由 Biome 统一）。
- 行宽：100 字符。
- 源码标识符用英文；注释与文档使用简体中文。

## 2. 命名

| 对象               | 规则             | 示例                                |
| ------------------ | ---------------- | ----------------------------------- |
| 文件名             | kebab-case       | `windowMotion.ts`、`petWindow.ts`   |
| React 组件文件     | PascalCase       | `SettingsView.tsx`、`PanelView.tsx` |
| 变量 / 函数        | camelCase        | `dragStart`、`selectedImageId`      |
| 类型 / 接口 / 枚举 | PascalCase       | `PetModule`、`WindowBounds`         |
| 常量               | UPPER_SNAKE_CASE | `BUBBLE_WIDTH`                      |
| IPC 通道           | `domain:action`  | `pet:drag-start`、`settings:patch`  |
| CSS 类             | kebab-case       | `.pet-bubble`、`.image-option`      |
| 测试文件           | `*.test.ts`      | `backup.test.ts`                    |

## 3. 目录与模块边界

- `src/shared/` 只放类型、常量、zod schema、纯函数；**不得引入 Electron / Node / React**。
- `src/main/` 不得引入 React 或 DOM 类型。
- `src/renderer/` 不得引入 `electron`、`node:fs` 等特权模块。
- 跨层通信只通过 `src/shared/ipc.ts` 定义的契约。
- 新功能优先做成 `src/main/modules/` 下的模块，见 `module-guide.md`。

## 4. 导入顺序

1. Node / Electron 内置模块
2. 第三方依赖
3. 本项目 `shared` / 相对路径

组间空一行；禁止循环依赖。

## 5. React 规范

- 函数组件 + Hooks；不使用 class 组件。
- 组件只负责展示与交互，业务规则放纯函数或主进程。
- 列表渲染必须有稳定 `key`。
- `useEffect` 必须清理订阅、定时器、监听器。
- 不在渲染过程中做副作用，或直接读写磁盘/网络。

## 6. Electron 规范

- `contextIsolation: true`、`sandbox: true`、`nodeIntegration: false` 为默认，不得关闭。
- preload 使用 CJS 输出，只通过 `contextBridge.exposeInMainWorld` 暴露白名单函数。
- 主进程 IPC handler：
  - 用 zod 校验入参；
  - 校验发送方窗口；
  - 捕获异常并返回结构化错误，不把堆栈泄露给渲染层。
- 禁止在渲染层持有 API Key；禁止通过 IPC 传递密钥明文。
- 所有窗口通过 `WindowManager` 创建与复用，禁止模块内直接 `new BrowserWindow()`。
- 窗口坐标统一使用 DIP，不混用物理像素。

## 7. 错误处理

- 不允许空 `catch`；至少记录日志。
- 对外部输入（文件、IPC、网络响应）一律视为不可信，先校验后使用。
- 网络请求必须设置超时与降级；禁止无限重试。
- 用户可见错误简短、中性；技术细节写入日志。

## 8. 日志

- 主进程使用统一 `logger`（`src/main/services/logger.ts`）。
- 级别：`debug` / `info` / `warn` / `error`。
- 禁止记录 API Key、完整请求头、用户隐私内容。
- 日志按天滚动，保留最近 7 天；崩溃日志保留 14 天。

## 9. 注释

- 注释解释「为什么」，不复述「是什么」。
- 公共接口、状态机转移、非直觉的 Windows 兼容处理必须写注释。
- TODO 必须说明触发条件与后续动作，不写已取消的阶段编号。

## 10. 提交规范

Conventional Commits，描述可用中文：

```text
<type>(<scope>): <summary>
```

| type     | 用途             |
| -------- | ---------------- |
| feat     | 新功能           |
| fix      | 修复缺陷         |
| docs     | 文档             |
| refactor | 重构（不改行为） |
| test     | 测试             |
| chore    | 构建/依赖/杂项   |
| perf     | 性能优化         |

规则：
- 一个提交只做一件事。
- 提交前必须通过 `npm run verify` 与 `npm run build`。
- **绝不提交** API Key、`config.local.json`、`secrets.bin`、`node_modules`、构建产物、未授权素材。

## 11. 质量门禁

```bash
npm run verify   # typecheck + lint + test + docs:check + check-assets
npm run build
```

- 任一失败不得合并。
- 新增核心逻辑（规则、状态机、存储迁移）必须配单元测试。
- 修复 bug 时先补复现测试，再修。

## 12. 性能规范

- 动画循环使用 `requestAnimationFrame`，页面隐藏时暂停。
- 避免在 `mousemove` / 滚动中做重计算；使用节流或主进程轮询。
- 定时器必须可清理；模块 `dispose` 中清除。
- 任何新增依赖都要评估内存与启动开销（见 `tech-stack.md`）。
