import type { ZodTypeAny, z } from 'zod'

export interface ModuleLogger {
  info(message: string, ...args: unknown[]): void
  warn(message: string, ...args: unknown[]): void
  error(message: string, ...args: unknown[]): void
}

/** 模块内可清理的定时器；stop/dispose 时统一清空 */
export interface ModuleScheduler {
  setTimeout(callback: () => void, ms: number): ReturnType<typeof setTimeout>
  setInterval(callback: () => void, ms: number): ReturnType<typeof setInterval>
  clearTimeout(handle: ReturnType<typeof setTimeout>): void
  clearInterval(handle: ReturnType<typeof setInterval>): void
  clearAll(): void
}

/** 模块 IPC；注册时自动登记，便于 dispose 移除 */
export interface ModuleIpc {
  handle<S extends ZodTypeAny>(
    channel: string,
    schema: S,
    handler: (payload: z.output<S>) => unknown | Promise<unknown>,
  ): void
  /** 移除本模块注册的全部 handler */
  dispose(): void
}

export interface ModuleContext {
  id: string
  /** 该模块在 settings.modules 中的配置；形状由模块自己负责 */
  getSettings<T>(): T
  /** modules.json 中该模块的运行时数据 */
  getState<T>(): T | null
  setState(state: unknown): void
  scheduler: ModuleScheduler
  ipc: ModuleIpc
  /** 通过现有气泡窗口提示；返回是否成功展示 */
  notify(text: string, durationMs?: number): boolean
  /** 夜间总开关或子开关关闭，且当前处于 23:00–08:00 */
  isNightSuppressed(now?: number, childEnabled?: boolean): boolean
  /** 与作息提醒共用 10 分钟冷却；整点报时等环境提示使用 */
  isAmbientQuiet(now?: number): boolean
  /** 通知核心重建托盘菜单（模块状态变化时使用） */
  refreshMenus(): void
  logger: ModuleLogger
}

export interface PanelPageContribution {
  /** 功能面板页 id；渲染侧按此 id 注册组件 */
  id: string
  title: string
  description?: string
  /** 左侧列表排序，数值越小越靠前；默认 100 */
  order?: number
}

export interface PetModule {
  /** 全局唯一，kebab-case */
  id: string
  title: string
  description: string
  deps?: string[]
  /** 默认开关；实际值以 settings.modules 为准 */
  defaultEnabled: boolean
  /** 向功能面板贡献一页；模块启用时才会出现在面板左侧 */
  panelPage?: PanelPageContribution
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

export interface ModuleInfo {
  id: string
  title: string
  description: string
  enabled: boolean
  settings: unknown
}
