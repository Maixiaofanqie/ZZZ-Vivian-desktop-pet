import { type IpcMainInvokeEvent, ipcMain } from 'electron'
import type { ZodTypeAny, z } from 'zod'
import type { ModuleIpc } from './types'

export interface ModuleIpcOptions {
  isTrustedSender: (event: IpcMainInvokeEvent) => boolean
  onChannelRegistered?: (channel: string) => void
}

export interface ManagedModuleIpc extends ModuleIpc {
  dispose(): void
}

/** 模块 IPC 包装：统一 zod 校验、sender 校验与重复通道检查 */
export function createModuleIpc(options: ModuleIpcOptions): ManagedModuleIpc {
  const channels = new Set<string>()

  return {
    handle<S extends ZodTypeAny>(
      channel: string,
      schema: S,
      handler: (payload: z.output<S>) => unknown | Promise<unknown>,
    ) {
      if (channels.has(channel)) {
        throw new Error(`重复注册模块 IPC：${channel}`)
      }

      channels.add(channel)
      options.onChannelRegistered?.(channel)

      ipcMain.handle(channel, async (event, payload: unknown) => {
        if (!options.isTrustedSender(event)) {
          throw new Error('未授权的模块请求')
        }

        const parsed = schema.safeParse(payload)
        if (!parsed.success) {
          throw new Error(`无效的模块参数：${channel}`)
        }

        return handler(parsed.data)
      })
    },

    dispose() {
      for (const channel of channels) {
        ipcMain.removeHandler(channel)
      }
      channels.clear()
    },
  }
}
