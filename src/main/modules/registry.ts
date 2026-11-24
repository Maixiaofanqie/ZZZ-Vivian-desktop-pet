import type { PanelPageSnapshot } from '../../shared/ipc'
import type { ModuleContext, ModuleInfo, PetModule } from './types'

export interface ModuleRegistryOptions {
  modules: PetModule[]
  createContext: (module: PetModule) => ModuleContext
  isEnabled: (id: string) => boolean
}

/**
 * 拓扑排序：依赖先于被依赖者。
 * 重复 id、缺少依赖、循环依赖都直接报错，避免静默启动半个模块系统。
 */
export function sortModules(modules: PetModule[]): PetModule[] {
  const byId = new Map<string, PetModule>()

  for (const module of modules) {
    if (byId.has(module.id)) {
      throw new Error(`重复的模块 id：${module.id}`)
    }
    byId.set(module.id, module)
  }

  const state = new Map<string, 'visiting' | 'done'>()
  const result: PetModule[] = []

  const visit = (module: PetModule, path: string[]): void => {
    const current = state.get(module.id)
    if (current === 'done') return
    if (current === 'visiting') {
      throw new Error(`模块循环依赖：${[...path, module.id].join(' → ')}`)
    }

    state.set(module.id, 'visiting')
    for (const depId of module.deps ?? []) {
      const dependency = byId.get(depId)
      if (!dependency) {
        throw new Error(`模块 ${module.id} 缺少依赖：${depId}`)
      }
      visit(dependency, [...path, module.id])
    }
    state.set(module.id, 'done')
    result.push(module)
  }

  for (const module of modules) {
    visit(module, [])
  }

  return result
}

export class ModuleRegistry {
  private readonly options: ModuleRegistryOptions
  private sorted: PetModule[] = []
  private contexts = new Map<string, ModuleContext>()
  private running = new Set<string>()
  private isSetup = false

  constructor(options: ModuleRegistryOptions) {
    this.options = options
  }

  get order(): string[] {
    return this.sorted.map((module) => module.id)
  }

  getContext(id: string): ModuleContext | undefined {
    return this.contexts.get(id)
  }

  async setup(): Promise<void> {
    if (this.isSetup) return

    this.sorted = sortModules(this.options.modules)

    try {
      for (const module of this.sorted) {
        const context = this.options.createContext(module)
        this.contexts.set(module.id, context)
        await module.setup(context)
      }
      this.isSetup = true
    } catch (error) {
      await this.dispose()
      throw error
    }
  }

  /** 按当前设置启动/停止模块；可重复调用 */
  async applyEnabledStates(): Promise<void> {
    if (!this.isSetup) await this.setup()

    for (const module of this.sorted) {
      const enabled = this.options.isEnabled(module.id)
      const running = this.running.has(module.id)

      if (enabled && !running) {
        await this.startModule(module)
      } else if (!enabled && running) {
        await this.stopModule(module)
      }
    }
  }

  list(): ModuleInfo[] {
    const modules = this.sorted.length > 0 ? this.sorted : this.options.modules

    return modules.map((module) => ({
      id: module.id,
      title: module.title,
      description: module.description,
      enabled: this.options.isEnabled(module.id),
      settings: this.contexts.get(module.id)?.getSettings() ?? null,
    }))
  }

  /** 功能面板页只由已启用模块贡献；按 order 稳定排序 */
  listPanelPages(): PanelPageSnapshot[] {
    const modules = this.sorted.length > 0 ? this.sorted : this.options.modules
    const pages: Array<PanelPageSnapshot & { order: number }> = modules.flatMap((module) => {
      if (!module.panelPage || !this.options.isEnabled(module.id)) return []

      return [
        {
          id: module.panelPage.id,
          moduleId: module.id,
          title: module.panelPage.title,
          description: module.panelPage.description ?? '',
          order: module.panelPage.order ?? 100,
        },
      ]
    })

    return pages
      .sort((a, b) => a.order - b.order)
      .map(({ id, moduleId, title, description }) => ({ id, moduleId, title, description }))
  }

  async dispose(): Promise<void> {
    for (const module of [...this.sorted].reverse()) {
      const context = this.contexts.get(module.id)

      try {
        if (this.running.has(module.id)) {
          await module.stop?.()
        }
        await module.dispose?.()
      } catch (error) {
        context?.logger.error(`模块清理失败：${module.id}`, error)
      }

      context?.scheduler.clearAll()
      context?.ipc.dispose()
      this.running.delete(module.id)
    }

    this.contexts.clear()
    this.sorted = []
    this.isSetup = false
  }

  private async startModule(module: PetModule): Promise<void> {
    const context = this.contexts.get(module.id)

    try {
      await module.start?.()
      this.running.add(module.id)
      context?.logger.info(`模块已启动：${module.id}`)
    } catch (error) {
      context?.logger.error(`模块启动失败：${module.id}`, error)
    }
  }

  private async stopModule(module: PetModule): Promise<void> {
    const context = this.contexts.get(module.id)

    try {
      await module.stop?.()
      context?.logger.info(`模块已停止：${module.id}`)
    } catch (error) {
      context?.logger.error(`模块停止失败：${module.id}`, error)
    }

    context?.scheduler.clearAll()
    this.running.delete(module.id)
  }
}
