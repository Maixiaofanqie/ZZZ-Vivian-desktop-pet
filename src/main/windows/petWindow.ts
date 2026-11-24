import { join } from 'node:path'
import { BrowserWindow, screen } from 'electron'
import { APP_NAME, PET_WINDOW_HEIGHT, PET_WINDOW_WIDTH } from '../../shared/constants'
import type { WindowPosition } from '../../shared/ipc'
import { logger } from '../services/logger'

/**
 * 创建宠物窗口。
 * 关键约束：只包住精灵本体、透明无边框、置顶、不占任务栏、不抢焦点。
 */
export function createPetWindow(initialPosition: WindowPosition): BrowserWindow {
  const win = new BrowserWindow({
    width: PET_WINDOW_WIDTH,
    height: PET_WINDOW_HEIGHT,
    useContentSize: true,
    x: initialPosition.x,
    y: initialPosition.y,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    thickFrame: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    title: APP_NAME,
    type: 'toolbar',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  })

  win.setAlwaysOnTop(true, 'screen-saver')
  win.setFullScreenable(false)

  // 锁定外框尺寸：Windows 在部分 DPI 组合下会在移动窗口时改变无边框窗口尺寸
  const [initialWidth, initialHeight] = win.getSize()
  win.setMinimumSize(initialWidth, initialHeight)
  win.setMaximumSize(initialWidth, initialHeight)

  win.once('ready-to-show', () => {
    win.showInactive()
    const display = screen.getPrimaryDisplay()
    logger.info('宠物窗口已显示', {
      bounds: win.getBounds(),
      contentBounds: win.getContentBounds(),
      alwaysOnTop: win.isAlwaysOnTop(),
      visible: win.isVisible(),
      display: {
        bounds: display.bounds,
        workArea: display.workArea,
        scaleFactor: display.scaleFactor,
      },
    })
  })

  // 把渲染层的错误带回主进程日志，便于开发期定位
  win.webContents.on('console-message', (details) => {
    if (details.level === 'warning' || details.level === 'error') {
      logger.warn(`[renderer] ${details.message} (${details.sourceId}:${details.lineNumber})`)
    }
  })

  win.webContents.on('did-fail-load', (_event, code, description, url) => {
    logger.error(`渲染页面加载失败：${code} ${description} ${url}`)
  })

  const rendererUrl = process.env.ELECTRON_RENDERER_URL
  if (rendererUrl) {
    void win.loadURL(rendererUrl)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}
