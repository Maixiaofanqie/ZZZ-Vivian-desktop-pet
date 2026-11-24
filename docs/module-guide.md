# 模块开发指南

模块系统是 v1.0 的功能扩展方式。新功能应优先做成模块，而不是继续堆在核心层。

## 1. 什么该做成模块？

满足以下任一条件的功能做成模块：
- 有独立的开关（番茄钟、提醒、天气等）
- 有自己的定时器、网络请求、持久化数据
- 有独立的设置页、功能面板页或托盘菜单项
- 未来可能被替换或移除

**核心层只保留**：窗口管理、交互命中、气泡、存储、日志。其他一律模块化。

## 2. 模块契约

实际接口位于 `src/main/modules/types.ts`：

```ts
import type { ZodTypeAny } from 'zod'
import type { ModuleContext } from '../types'

export interface PetModule {
  /** 全局唯一，kebab-case，如 'pomodoro' */
  id: string
  title: string
  description: string
  /** 依赖的模块 id，按拓扑序初始化 */
  deps?: string[]
  /** 默认开关；实际值以 settings.modules 为准 */
  defaultEnabled: boolean
  /** 向功能面板贡献一页；渲染侧组件在 src/renderer/modules 注册 */
  panelPage?: { id: string; title: string; description?: string; order?: number }
  /** 设置项 schema，用于校验与自动生成设置 UI */
  settingsSchema?: ZodTypeAny
  /** 注册 IPC、托盘项、设置页；不启动业务 */
  setup(ctx: ModuleContext): Promise<void>
  /** 用户启用时调用 */
  start?(): Promise<void>
  /** 用户禁用时调用 */
  stop?(): Promise<void>
  /** 应用退出或热重载时调用，必须彻底清理 */
  dispose?(): Promise<void>
}
```

`ModuleContext` 提供（均为主进程能力）：
- `getSettings<T>()`：该模块在 `settings.modules` 中的配置
- `getState<T>()` / `setState(state)`：`modules.json` 中的运行时数据
- `scheduler`：可清理的定时器
- `ipc`：注册 handler（自动登记，便于 dispose 清理）
- `notify(text, durationMs?)`：通过现有气泡窗口提示
- `isNightSuppressed()` / `isAmbientQuiet()`：夜间与作息冷却判断
- `refreshMenus()`：通知核心重建托盘菜单
- `logger`

## 3. 注册方式

- 静态 `export const module: PetModule`，在 `src/main/modules/index.ts` 统一 import。
- 启动时按 `deps` 拓扑排序；循环依赖直接报错。
- 用户禁用的模块不调用 `start`；已启动的先 `stop` 再清理。
- 渲染侧 UI 在 `src/renderer/modules/index.ts` 注册，不硬编码进主界面。
- 功能面板页面通过模块 IPC 读取数据；模块 IPC 只接受设置窗口与功能面板的请求。
- 点击台词通过 `src/main/modules/lines.ts` 的 `registerModuleClickLine` 注册；核心在时段问候之后、普通台词之前询问，返回 `null` 表示不参与。频率、冷却与文本由模块自己负责。
- **不做运行时加载外部代码**；所有模块在编译期注册。

## 4. 必须遵守

1. **不直接创建窗口**，使用 `WindowManager`。
2. **不持有全局状态**；数据写 `store` 命名空间。
3. **所有定时器、监听器、IPC handler 必须能在 `dispose` 中移除**。
4. **IPC 命名**：`<moduleId>:<action>`，如 `pomodoro:start`。
5. **设置项**：新增字段必须进 `settingsSchema` 并写迁移，不允许裸写 JSON。
6. **不阻塞启动**：`setup` 只做注册，耗时初始化放 `start` 且异步。
7. **网络请求**必须设置超时、重试上限与降级路径。
8. **错误**记录日志，不把异常抛给用户界面。
9. **隐私**：不读取对话内容、项目完整路径或用户输入；只读必要的元数据。

## 5. 生命周期时序

```text
app ready
  → 读取设置，确定启用模块
  → 拓扑排序
  → 对每个启用模块：setup(ctx) → start()
用户禁用模块
  → stop() → 移除 IPC/托盘/定时器（由 ctx 自动或手动）
应用退出
  → 逆序 dispose() → 写盘 → quit
```

## 6. 新增模块检查清单

- [ ] `id` 唯一、kebab-case
- [ ] `title` / `description` / `defaultEnabled` 已定义
- [ ] `settingsSchema` 与默认值已定义
- [ ] `setup` 不阻塞、不创建窗口
- [ ] `start/stop` 成对且可重复调用
- [ ] `dispose` 清理所有资源
- [ ] IPC 有 zod 校验与 sender 校验
- [ ] 单元测试覆盖核心规则
- [ ] 设置页与功能面板文案已补齐
- [ ] 文档已更新
- [ ] 模块默认开关状态已确定
- [ ] 不引入未授权素材或密钥

## 7. 示例骨架

```ts
// src/main/modules/example/index.ts
import { z } from 'zod'
import type { ModuleContext, PetModule } from '../types'

const settingsSchema = z.object({
  enabled: z.boolean().default(false),
  intervalMinutes: z.number().int().min(1).max(240).default(25),
})

let timer: NodeJS.Timeout | undefined

export const exampleModule: PetModule = {
  id: 'example',
  title: '示例模块',
  description: '演示模块契约的最小实现',
  defaultEnabled: false,
  settingsSchema,
  panelPage: { id: 'example', title: '示例', description: '示例页面', order: 100 },

  async setup(ctx: ModuleContext) {
    ctx.ipc.handle('example:ping', z.object({}), async () => ({ pong: true }))
  },

  async start() {
    timer = setInterval(() => {
      // 业务逻辑
    }, 60_000)
  },

  async stop() {
    if (timer) clearInterval(timer)
    timer = undefined
  },

  async dispose() {
    await this.stop?.()
  },
}
```

渲染侧在 `src/renderer/modules/index.ts` 按 `panelPage.id` 注册对应 React 组件；组件只通过模块 IPC 取数据，不直接访问文件系统或网络。
