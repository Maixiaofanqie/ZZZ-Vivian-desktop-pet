import { join } from 'node:path'
import { BrowserWindow } from 'electron'
import { APP_NAME } from '../../shared/constants'

/** 设置窗口：普通窗口，单例复用，展示共处记录与自启开关 */
export function createSettingsWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 520,
    height: 620,
    minWidth: 480,
    minHeight: 540,
    show: false,
    autoHideMenuBar: true,
    title: `${APP_NAME} · 设置`,
    backgroundColor: '#f3eef8',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  win.once('ready-to-show', () => {
    win.show()
    win.focus()
  })

  const rendererUrl = process.env.ELECTRON_RENDERER_URL
  if (rendererUrl) {
    void win.loadURL(`${rendererUrl}?view=settings`)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'), {
      query: { view: 'settings' },
    })
  }

  return win
}
