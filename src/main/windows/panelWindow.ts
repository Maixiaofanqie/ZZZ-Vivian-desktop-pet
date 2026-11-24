import { join } from 'node:path'
import { BrowserWindow } from 'electron'
import { APP_NAME } from '../../shared/constants'

/** 功能面板：普通窗口，单例复用，左侧模块页面列表 + 右侧内容 */
export function createPanelWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 880,
    height: 620,
    minWidth: 720,
    minHeight: 500,
    show: false,
    autoHideMenuBar: true,
    title: `${APP_NAME} · 功能面板`,
    backgroundColor: '#f3eef8',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  // 页面里的 <title> 会覆盖 BrowserWindow 标题；面板需要固定标题便于识别
  win.on('page-title-updated', (event) => {
    event.preventDefault()
  })

  win.once('ready-to-show', () => {
    win.show()
    win.focus()
  })

  const rendererUrl = process.env.ELECTRON_RENDERER_URL
  if (rendererUrl) {
    void win.loadURL(`${rendererUrl}?view=panel`)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'), {
      query: { view: 'panel' },
    })
  }

  return win
}
