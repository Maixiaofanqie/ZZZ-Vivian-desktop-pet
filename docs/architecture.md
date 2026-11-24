# 架构设计

本文描述 v1.0 的实际架构。代码以 `src/` 为准；架构级变更应先写 ADR。

## 1. 进程模型

```text
┌─────────────────────────────────────────────────────────┐
│ Electron Main（唯一特权进程）                            │
│  app 生命周期 / 单实例 / 自启 / 托盘                      │
│  WindowManager：pet / bubble / settings / function panel │
│  WindowMotion：拖动、下落、边缘夹紧                       │
│  Tray / Scheduler / Secrets / Store / Logger / Net       │
│  Modules：pomodoro、reminders、chime、claude-code、weather │
└───────────────▲─────────────────────────────────────────┘
                │ IPC（zod 校验，白名单，领域命名）
┌───────────────┴─────────────────────────────────────────┐
│ Preload（CJS，contextBridge 唯一出口）                   │
│  只暴露 src/shared/ipc.ts 定义的白名单 API               │
└───────────────▲─────────────────────────────────────────┘
                │ window.vivian.*
┌───────────────┴─────────────────────────────────────────┐
│ Renderer（无特权）                                       │
│  pet/：画布绘制、命中面罩、待机 CSS 动效                  │
│  ui/：React 气泡、设置、功能面板                         │
│  modules/：模块的渲染侧页面                              │
└─────────────────────────────────────────────────────────┘
```

**边界铁律**：
- 渲染进程不接触文件系统、网络、密钥、Node API、tray、窗口创建。
- 主进程不关心「怎么画」，只负责状态、窗口、系统能力。
- 所有跨层调用先改 `src/shared/ipc.ts`，再实现两端。

## 2. 窗口策略

| 窗口             | 类型     | 关键配置                                                                                                                                                                | 职责                             |
| ---------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| `petWindow`      | 透明置顶 | `transparent`、`frame:false`、`alwaysOnTop('screen-saver')`、`skipTaskbar`、`type:'toolbar'`（Win）、`hasShadow:false`、`resizable:false`、`backgroundThrottling:false` | 只包住形象本体，固定 320×320 DIP |
| `bubbleWindow`   | 透明置顶 | `focusable:false`、默认忽略鼠标、按需局部可点                                                                                                                           | 对话气泡，独立定位，贴边翻转     |
| `settingsWindow` | 普通窗口 | 单例、任务栏可见、可缩放                                                                                                                                                | 设置、关于、模块管理             |
| `functionPanel`  | 普通窗口 | 单例、可缩放、从宠物右键打开                                                                                                                                            | Claude Code、天气、日程 · 待办   |

宠物窗口只包住精灵，不做「全屏透明窗口 + 局部穿透」。窗口种类上限为上述四类。

### 2.1 点击穿透与命中

- 渲染层绘制形象后生成 alpha 面罩（72×72 网格），经 `pet:update-hit-mask` 上报主进程。
- 渲染层同时量出形象的可见范围，经 `pet:update-visual-metrics` 上报；主进程用它把气泡贴到形象头顶，而不是窗口的透明边缘。
- 主进程以约 30Hz 轮询 `screen.getCursorScreenPoint()`，用 `getContentBounds()` 归一化坐标做逐像素命中，切换 `win.setIgnoreMouseEvents(true/false, { forward: true })`。不依赖渲染层 mousemove，避免「一旦穿透就收不到事件」的死区。
- 不使用 `-webkit-app-region: drag`；由渲染层 `pointerdown` 发起 IPC，主进程按屏幕坐标跟随。
- 跨屏/DPI 变化监听 `display-metrics-changed`、`display-added`、`display-removed`，重新夹紧窗口到 `display.workArea`。

### 2.2 DPI 与尺寸稳定

Windows 125% 缩放下，高频调用 `setPosition` 会让无边框透明窗口的内容尺寸逐帧累积膨胀。规则：
- 窗口移动一律使用 `setContentBounds({ x, y, width, height })`，每帧写入固定内容尺寸，不要只调用 `setPosition`。
- 固定尺寸使用逻辑常量（320×320），不要把 `getContentBounds()` 的取整结果回写。
- 拖拽跟随定时器使用 **8ms** 间隔：Windows 默认定时器精度约 15.6ms，`setInterval(16)` 实际会退化成约 31ms 一帧。
- 渲染层对 `resize` 做 150ms 防抖，并在 DPI 舍入导致尺寸未变时跳过重绘；不要每次 resize 都重建画布。
- 渲染层按 `window.innerWidth/innerHeight` 缩放绘制，命中面罩按窗口归一化，天然兼容 DPI 取整。

## 3. IPC 契约

单一事实来源：`src/shared/ipc.ts`。

### 3.1 宠物窗口

| 方向      | 通道                                                  | 说明                                 |
| --------- | ----------------------------------------------------- | ------------------------------------ |
| 渲染 → 主 | `pet:update-hit-mask`                                 | 上报 alpha 面罩（zod 校验）          |
| 渲染 → 主 | `pet:update-visual-metrics`                           | 上报形象可见范围，用于气泡锚定       |
| 渲染 → 主 | `pet:drag-start` / `pet:drag-end`                     | 拖拽起止；松手后主进程接管下落       |
| 渲染 → 主 | `pet:click`                                           | 延迟单击（300ms，双击窗口 280ms）    |
| 渲染 → 主 | `pet:pointer-up`                                      | 即时抬起；用于淡入中补全气泡，不计数 |
| 渲染 → 主 | `pet:context-menu`                                    | 请求打开宠物右键菜单                 |
| 渲染 → 主 | `pet:get-image-selection` / `pet:set-image`           | 读取/切换形象（invoke）              |
| 渲染 → 主 | `pet:get-idle-motion`                                 | 读取待机微动效开关（invoke）         |
| 设置 → 主 | `settings:set-idle-animation`                         | 保存开关并广播到宠物窗口             |
| 设置 → 主 | `settings:set-proactive-lines`                        | 保存定时问候开关并重排定时器         |
| 主 → 渲染 | `pet:image-selection-changed`                         | 形象选择变更广播                     |
| 主 → 渲染 | `pet:idle-motion-changed`                             | 待机微动效开关广播                   |
| 主 → 渲染 | `pet:hover-changed`                                   | 命中检测驱动的悬停状态               |
| 主 → 渲染 | `pet:landed`                                          | 首次触地，触发落地挤压动画           |
| 主 → 气泡 | `bubble:show` / `bubble:complete` / `bubble:fade-out` | 显示 / 补全逐字淡入 / 淡出           |
| 面板 → 主 | `panel:list-pages`                                    | 读取已启用模块贡献的功能面板页       |
| 面板 → 主 | `claude-code:get-snapshot`                            | 模块页面读取只读快照                 |
| 面板 → 主 | `claude-code:open-project`                            | 按项目 id 打开文件夹                 |
| 面板 → 主 | `claude-code:open-session`                            | 先开文件夹，再打开对应对话           |

功能面板的模块 IPC 只接受设置窗口与功能面板的 sender；`panel:list-pages` 只接受功能面板窗口。渲染层只拿页面元数据与项目 id，不接触主进程路径。

### 3.2 约定

1. 通道命名 `domain:action`，例如 `settings:patch`。
2. 请求/响应用 `ipcMain.handle` + `ipcRenderer.invoke`；事件用 `webContents.send` + preload 订阅函数。
3. 每个 handler 用 zod 校验入参，并校验 `event.sender` 属于已知窗口。
4. preload 只暴露函数，绝不暴露 `ipcRenderer` 本身。
5. IPC 变更必须在同一次提交中更新 `shared`、主进程、preload、渲染层与文档。

## 4. 模块系统

编译期静态注册，不做运行时加载第三方代码。

```ts
export interface PetModule {
  id: string
  title: string
  description: string
  deps?: string[]
  defaultEnabled: boolean
  panelPage?: { id: string; title: string; description?: string; order?: number }
  settingsSchema?: ZodTypeAny
  setup(ctx: ModuleContext): Promise<void>
  start?(): Promise<void>
  stop?(): Promise<void>
  dispose?(): Promise<void>
}
```

规则：
- 静态 `import` + 依赖拓扑排序注册；按设置启用/停用。
- 模块不直接 `new BrowserWindow()`，统一走 `WindowManager`。
- `dispose` 必须移除 IPC handler、清理 timer/listener，否则热重载会重复注册。
- 模块的渲染侧 UI 通过 `src/renderer/modules/` 注册，不在主界面硬编码。
- 新功能优先做成模块；只有核心桌宠行为（窗口、命中、气泡）才进入核心层。

### 4.1 功能面板与模块 UI 贡献

- `functionPanel` 是普通窗口，左侧功能列表、右侧内容区；从宠物右键或快捷键打开。
- 模块可贡献：
  - `panelPage`：功能面板中的一页（如「Claude Code · 最近项目」）
  - `clickLine`：点击宠物时的台词来源（`registerModuleClickLine`，返回 `null` 表示不参与）
  - `settingsSchema`：设置项
- 预留 `ModuleManifest` 与运行时加载边界，但**不实现**外部代码加载；所有模块在编译期注册。

**已落地**：
- `src/main/windows/panelWindow.ts`：单例普通窗口，加载 `?view=panel`，可缩放；固定窗口标题，避免被页面 `<title>` 覆盖。
- 宠物右键菜单包含「功能面板」；开发期可用 `VIVIAN_OPEN_PANEL=1` 自动打开，打包版不生效。
- `ModuleRegistry.listPanelPages()` 只返回已启用模块的页面。
- 渲染侧 `src/renderer/modules/index.ts` 按 page id 静态注册组件；`src/renderer/ui/PanelView.tsx` 负责左侧列表与右侧内容。

### 4.2 Claude Code 联动

`ClaudeCodeService`（主进程，`src/main/services/claudeCode.ts`）只读扫描 `~/.claude/projects/*`：
- 项目目录、`.jsonl` 会话数、最新 mtime；只遍历项目根下的一层目录，不递归。
- 项目显示名：读取最近会话开头 256KB 内的顶层 `cwd` 字段，取文件夹名；失败时回退目录名。
- 会话显示名：只读 `~/.claude/sessions/*.json` 的 `sessionId`、`name` 与 `nameSource`；缺失、损坏或超过 64KB 时回退短 id。
- VSCode 页签名：用 Electron 内置 `node:sqlite` 只读打开 `workspaceStorage/*/state.vscdb`，只查询 `Anthropic.claude-code` 的 `panelTabSessions[].sessionId/title`；损坏/锁定/字段变化时跳过。显示优先级为页签名 > 注册表 `name` > 短 id。
- 扫描结果缓存 5 分钟；功能面板打开、重新可见或点击刷新时立即扫描；面板隐藏时暂停轮询。
- 项目内部 id 为路径的 SHA-256 前 16 位；渲染层只拿 `{ id, displayName, lastActiveAt, sessionCount, sessions }`，完整路径不出主进程。
- 项目范围可在设置中选 7 天 / 30 天 / 全部，默认 30 天；面板最多 5 个项目，每个项目最近 5 个会话。
- 主动台词：低 10% / 中 25% / 高 40%，关闭为 0；每分钟最多 1 次、每小时最多 3 次；时间戳存 `modules.json`，重启后仍生效。
- 工作记忆：每次扫描把最近项目名、最后活跃时间、会话数与项目数并入 `profile.json` 的 `memory.work`；不存路径或会话标题。
- 打开项目：渲染层发送项目 `id`，主进程用扫描时保留的会话 `cwd` 映射到真实项目目录，校验绝对路径且目录存在后调用 `shell.openExternal('vscode://file/...')`。
- 打开会话：先打开文件夹，等待 800ms 后调用 `shell.openExternal('vscode://anthropic.claude-code/open?session=<id>')`；会话 id 必须仍在该项目最近列表中。
- 失败退路：`vscode://file` 失败时用 `shell.openPath` 打开资源管理器；会话 URI 失败时提示安装扩展或运行 `claude --resume <id>`。
- 数据只在本机；不读取对话内容、prompt、代码；不发送网络请求；扫描失败或文件损坏返回空/跳过，不崩溃。

### 4.3 记忆、作息与备份

- **记忆**：写入 `profile.json`（v3）。只存聚合事实——首次见面、互动次数、最近 90 天活跃日、最多 100 条里程碑，以及 Claude Code 工作聚合（最近项目名、最后活跃时间、会话数、项目数）；不存台词原文、坐标、路径、会话标题或屏幕内容。
- **里程碑**：由共处天数、互动次数与纪念日推导，首次跨过时写入 `{ id, reachedAt, seen }`；`seen` 用于保证彩蛋只展示一次。
- **作息**：`RoutineReminder` 为纯状态机，主进程每 60 秒读取 `powerMonitor.getSystemIdleTime()` 并驱动；宠物隐藏、拖拽、已有气泡时跳过。久坐与催睡共用 10 分钟冷却。
- **优先级**：用户点击 > 里程碑彩蛋 > 作息提醒 > 定时问候；同一时间只显示一条气泡。
- **备份**：导出单个 JSON（设置 + profile + modules + 窗口位置）；导入先整体校验，再自动备份现有文件，最后整体替换。备份不含 `secrets.bin`。不同 `app` 标识的旧备份仍可导入，读取时统一归一化为当前标识。

### 4.4 信息模块

- `weather` 为编译期模块，贡献「天气」页；提醒模块贡献「日程 · 待办」页。
- 面板页 `order`：Claude Code 10 / 天气 20 / 日程 40。
- 天气只在主进程请求：
  - 地理编码：`geocoding-api.open-meteo.com`，最多返回 5 个候选，重名城市在设置页选择。
  - 当前天气：`api.open-meteo.com`，取当前温度、体感、天气代码、风速、湿度与当日高低温/降水概率。
  - 超时 8 秒、最多 2 次尝试；30 分钟缓存；手动刷新 1 分钟限频。
  - 城市、坐标与最后成功快照写入 `modules.json` 的 `weather` 状态；城市变更清空旧快照。
  - 失败显示旧缓存并标记「更新失败」；无缓存显示空状态，不崩溃。
- 渲染层只通过模块 IPC 获取快照，不直接访问网络；天气请求不涉及 Key。

## 5. 持久化

路径：`app.getPath('userData')`（Windows 为 `%APPDATA%\vivian-desktop-pet\`）。

| 文件               | 内容                                                   |
| ------------------ | ------------------------------------------------------ |
| `settings.json`    | 用户设置、模块开关、自启等                             |
| `profile.json`     | 共处记录、记忆（v3：活跃日 + 里程碑 + 工作聚合）、统计 |
| `modules.json`     | 模块运行时数据（天气快照、提醒、番茄钟等）             |
| `state.json`       | 窗口位置、当前状态等易失信息                           |
| `run-state.json`   | 上次运行是否正常退出                                   |
| `secrets.bin`      | `safeStorage` 加密存储；当前版本不需要用户密钥         |
| `backup-<时间戳>/` | 导入备份前自动保存的 `settings/profile/state` 副本     |

规则：
1. 每个文件带整数 `schemaVersion`，迁移链 `migrations[version]` 顺序执行。
2. 写入使用原子写（临时文件 + rename），Windows 上对 EPERM 做重试。
3. 启动读取失败：备份坏文件为 `*.corrupt-时间戳`，回退默认值，不允许因此崩溃。
4. 导入/导出提供完整备份；共处记录与记忆不可丢失。
5. 密钥只经 `safeStorage.encryptString` / `decryptString`，仅在主进程使用。

## 6. 静态形象与占位

- `src/renderer/staticImages.ts` 用 `import.meta.glob('../../assets/characters/*/vivian_static_*.png')` 收集图片；按路径排序，id 为文件名。
- 官方安装版在 `assets/characters/<set>/` 放 7 张图；公开仓库只有 `README.md`，glob 为空。
- 没有可用图片或图片加载失败时，`PetStage` 清空画布并把命中面罩置零，宠物窗口保持空白且不拦截点击；不绘制任何占位角色。
- 有形象时按 320×320 等比缩放、底部对齐；返回 `topRatio/bottomRatio` 供气泡定位。
- 待机微动效由 CSS transform（呼吸 + 摇摆）实现，不逐帧重绘画布。

## 7. 数据流示例：点击 → 台词 → 共处记录

```text
用户单击宠物
  → Renderer 命中测试
  → IPC pet:click
  → Main 校验 → 更新共处记录（互动次数/最近互动）→ Store 原子写入 profile.json
  → Main 选取台词（时间段/情境/权重/冷却）
  → Main 定位 bubbleWindow → 发送 bubble:show { text, duration }
  → Renderer(bubble) 打字机展示 → 自动消失
```

## 8. 目录职责

```text
src/main/
  app/            生命周期、单实例、自启、协议注册
  windows/        petWindow / bubbleWindow / settingsWindow / panelWindow / windowManager
  services/       windowMotion / tray / routine / scheduler / secrets / logger / claudeCode / clickThrough
  modules/        功能模块（编译期注册）
  store/          settings / profile / memory / modulesFile / backup / migrations
src/preload/      唯一 contextBridge 出口（CJS）
src/renderer/
  pet/            画布、静态图、待机动效
  ui/             React 界面
  modules/        模块的渲染侧 UI
src/shared/       ipc 契约、类型、zod schema、常量
```

## 9. 错误处理与日志

- 主进程统一 `logger`，分级输出到控制台与 `app.getPath('userData')/logs/`。
- 主日志按本地日期滚动为 `main-YYYY-MM-DD.log`，保留 7 天；崩溃单独写 `crash-YYYY-MM-DD.log`，保留 14 天。日志写入采用同步 append，保证崩溃前最后一条落盘；写入失败只回退控制台，不影响运行。
- 日志不记录 API Key、完整 Claude Code 项目路径、对话内容、屏幕内容或用户输入文本。
- 渲染进程崩溃通过 `render-process-gone` 记录；宠物窗口自动重建，5 分钟内最多重建一次，超出后停止重建并给出简短提示。
- 主进程 `uncaughtException` 记录后 `app.exit(1)`；`unhandledRejection` 记录但不退出。`child-process-gone` 同样记录 GPU/Utility 异常，退出阶段忽略。
- `run-state.json` 记录 `startedAt` 与 `cleanExit`；启动时读取上一次状态，非正常退出只写日志并在设置页提示，不自动修改用户数据。
- 用户可见错误使用简短中性提示；技术细节只进日志。
- 网络请求必须设置超时、重试上限、降级路径；禁止无限重试。

## 10. 相关 ADR

| 编号                                     | 主题                                               | 状态   |
| ---------------------------------------- | -------------------------------------------------- | ------ |
| [001](adr/001-electron.md)               | 技术栈选择 Electron                                | 已接受 |
| [003](adr/003-claude-code.md)            | Claude Code 联动：只读元数据 + 定期扫描 + 功能面板 | 已接受 |
| [004](adr/004-ai-chat-deferred.md)       | AI 聊天暂缓                                        | 已接受 |
| [006](adr/006-non-commercial-release.md) | v1.0 非商业公开发布与安装包策略                    | 已接受 |
