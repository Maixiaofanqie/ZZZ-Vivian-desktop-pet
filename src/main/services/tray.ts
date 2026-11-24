import { join } from 'node:path'
import { type BrowserWindow, Menu, nativeImage, Tray } from 'electron'
import { getModuleTrayMenuItems } from '../modules/menus'
import { logger } from './logger'

let activeRebuild: (() => void) | null = null

/** 模块状态变化后主动重建托盘菜单 */
export function refreshTrayMenu(): void {
  activeRebuild?.()
}

/**
 * 退出时先注销重建回调，再销毁托盘。
 * 模块清理是异步的，可能在托盘销毁之后才调用 refreshTrayMenu，
 * 这里把回调置空，避免访问已销毁的 Tray。
 */
export function destroyTray(tray: Tray | null): void {
  activeRebuild = null
  tray?.destroy()
}

export interface TrayOptions {
  getWindow: () => BrowserWindow | null
  onResetPosition: () => void
  onOpenSettings: () => void
  onHide?: () => void
  onQuit: () => void
}

/**
 * 托盘服务。Tray 实例必须由调用方长期持有，否则会被 GC 导致图标消失。
 */
export function createTray(options: TrayOptions): Tray {
  const iconPath = join(__dirname, '../../assets/icons/tray.png')
  const image = nativeImage.createFromPath(iconPath)
  if (image.isEmpty()) {
    logger.warn(`托盘图标加载失败：${iconPath}`)
  }

  const tray = new Tray(image)
  tray.setToolTip('薇薇安桌宠')

  const hideWindow = (): void => {
    const win = options.getWindow()
    if (!win) return
    win.hide()
    options.onHide?.()
  }

  const showWindow = (): void => {
    const win = options.getWindow()
    win?.showInactive()
  }

  const rebuild = (): void => {
    const win = options.getWindow()
    const visible = win?.isVisible() ?? false
    const moduleItems = getModuleTrayMenuItems()

    const menu = Menu.buildFromTemplate([
      {
        label: visible ? '隐藏薇薇安' : '显示薇薇安',
        click: () => {
          if (visible) {
            hideWindow()
          } else {
            showWindow()
          }
          rebuild()
        },
      },
      { label: '重置位置', click: options.onResetPosition },
      { label: '设置', click: options.onOpenSettings },
      ...(moduleItems.length > 0 ? [{ type: 'separator' as const }, ...moduleItems] : []),
      { type: 'separator' },
      { label: '退出', click: options.onQuit },
    ])

    tray.setContextMenu(menu)
  }

  activeRebuild = rebuild

  tray.on('click', () => {
    const win = options.getWindow()
    if (!win) return
    if (win.isVisible()) {
      hideWindow()
    } else {
      showWindow()
    }
    rebuild()
  })

  rebuild()
  return tray
}
