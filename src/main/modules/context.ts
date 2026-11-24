import type { IpcMainInvokeEvent } from 'electron'
import { isNightInteractionSuppressed } from '../../shared/night'
import { logger } from '../services/logger'
import { getModuleState, setModuleState } from '../store/modules'
import { getSettings } from '../store/settings'
import { createModuleIpc, type ManagedModuleIpc } from './ipc'
import { createModuleScheduler } from './scheduler'
import type { ModuleContext, PetModule } from './types'

export interface ModuleContextFactoryOptions {
  isTrustedSender: (event: IpcMainInvokeEvent) => boolean
  notify: (text: string, durationMs?: number) => boolean
  isAmbientQuiet: (now: number) => boolean
  refreshMenus: () => void
}

export interface ManagedModuleContext extends ModuleContext {
  ipc: ManagedModuleIpc
}

/** 主进程侧的模块上下文：settings / modules.json / 定时器 / IPC / 气泡 */
export function createModuleContext(
  module: PetModule,
  options: ModuleContextFactoryOptions,
): ManagedModuleContext {
  return {
    id: module.id,
    getSettings<T>(): T {
      const settings = getSettings().modules as unknown as Record<string, unknown>
      return settings[module.id] as T
    },
    getState<T>(): T | null {
      return getModuleState<T>(module.id)
    },
    setState(state: unknown): void {
      setModuleState(module.id, state)
    },
    scheduler: createModuleScheduler(),
    ipc: createModuleIpc({ isTrustedSender: options.isTrustedSender }),
    notify: options.notify,
    isNightSuppressed(now = Date.now(), childEnabled = true): boolean {
      return isNightInteractionSuppressed(getSettings().nightInteraction, childEnabled, now)
    },
    isAmbientQuiet: options.isAmbientQuiet,
    refreshMenus: options.refreshMenus,
    logger,
  }
}
