import { logger } from '../services/logger'

export interface ModuleClickLine {
  moduleId: string
  text: string
  lineId?: string
}

type LineProvider = () => { text: string; lineId?: string } | null

const providers = new Map<string, LineProvider>()

/** 模块注册点击台词来源；按注册顺序取第一条命中 */
export function registerModuleClickLine(moduleId: string, provider: LineProvider): void {
  providers.set(moduleId, provider)
}

export function unregisterModuleClickLine(moduleId: string): void {
  providers.delete(moduleId)
}

export function getModuleClickLine(): ModuleClickLine | null {
  for (const [moduleId, provider] of providers) {
    try {
      const line = provider()
      if (line?.text.trim()) {
        return { moduleId, text: line.text, lineId: line.lineId }
      }
    } catch (error) {
      logger.warn(`模块点击台词生成失败：${moduleId}`, error)
    }
  }

  return null
}
