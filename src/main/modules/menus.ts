import type { MenuItemConstructorOptions } from 'electron'
import { logger } from '../services/logger'

type MenuProvider = () => MenuItemConstructorOptions[]

const petProviders = new Map<string, MenuProvider>()
const trayProviders = new Map<string, MenuProvider>()

/** 模块注册右键 / 托盘菜单贡献；返回的条目由核心插入现有菜单 */
export function registerModuleMenus(
  id: string,
  providers: { pet?: MenuProvider; tray?: MenuProvider },
): void {
  if (providers.pet) petProviders.set(id, providers.pet)
  if (providers.tray) trayProviders.set(id, providers.tray)
}

export function unregisterModuleMenus(id: string): void {
  petProviders.delete(id)
  trayProviders.delete(id)
}

function collect(
  providers: Map<string, MenuProvider>,
  scope: string,
): MenuItemConstructorOptions[] {
  const items: MenuItemConstructorOptions[] = []

  for (const [id, provider] of providers) {
    try {
      items.push(...provider())
    } catch (error) {
      logger.warn(`模块菜单生成失败：${id}（${scope}）`, error)
    }
  }

  return items
}

export function getModulePetMenuItems(): MenuItemConstructorOptions[] {
  return collect(petProviders, 'pet')
}

export function getModuleTrayMenuItems(): MenuItemConstructorOptions[] {
  return collect(trayProviders, 'tray')
}
