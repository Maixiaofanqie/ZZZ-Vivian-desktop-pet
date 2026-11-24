import { join } from 'node:path'
import { BrowserWindow } from 'electron'
import { APP_NAME, BUBBLE_HEIGHT, BUBBLE_WIDTH } from '../../shared/constants'
import { logger } from '../services/logger'

/**
 * 独立气泡窗口：透明、无焦点、默认忽略鼠标。
 * 生命周期与定位由主进程管理；P4 再扩展打字机、队列与贴边翻转。
 */
export function createBubbleWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: BUBBLE_WIDTH,
    height: BUBBLE_HEIGHT,
    useContentSize: true,
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
    focusable: false,
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
  win.setIgnoreMouseEvents(true)

  win.webContents.on('did-fail-load', (_event, code, description, url) => {
    logger.error(`气泡页面加载失败：${code} ${description} ${url}`)
  })

  const rendererUrl = process.env.ELECTRON_RENDERER_URL
  if (rendererUrl) {
    void win.loadURL(`${rendererUrl}?view=bubble`)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'), {
      query: { view: 'bubble' },
    })
  }

  return win
}
