import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import { SETTINGS_SCHEMA_VERSION } from '../../shared/constants'
import type { ImageMode } from '../../shared/ipc'
import { type ModuleId, type ModuleSettings, normalizeModuleSettings } from '../../shared/modules'
import {
  type AppSettings,
  DEFAULT_SETTINGS,
  normalizeSettings,
  parseSettings,
} from '../../shared/settingsDefaults'
import { logger } from '../services/logger'

interface SettingsFile {
  schemaVersion: number
  settings: AppSettings
}

let cached: SettingsFile | null = null

function settingsFilePath(): string {
  return join(app.getPath('userData'), 'settings.json')
}

function writeSettings(file: SettingsFile): void {
  const path = settingsFilePath()
  const tempPath = `${path}.tmp`

  mkdirSync(app.getPath('userData'), { recursive: true })
  writeFileSync(tempPath, JSON.stringify(file, null, 2), { encoding: 'utf8' })

  try {
    renameSync(tempPath, path)
  } catch {
    rmSync(path, { force: true })
    renameSync(tempPath, path)
  }

  cached = file
}

function readSettings(): SettingsFile {
  if (cached) return cached

  const path = settingsFilePath()
  if (!existsSync(path)) {
    cached = {
      schemaVersion: SETTINGS_SCHEMA_VERSION,
      settings: { ...DEFAULT_SETTINGS },
    }
    return cached
  }

  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<SettingsFile>
    if (parsed.schemaVersion !== SETTINGS_SCHEMA_VERSION) {
      cached = {
        schemaVersion: SETTINGS_SCHEMA_VERSION,
        settings: { ...DEFAULT_SETTINGS },
      }
    } else {
      cached = {
        schemaVersion: SETTINGS_SCHEMA_VERSION,
        settings: normalizeSettings(parsed.settings),
      }
    }
  } catch (error) {
    logger.warn('读取设置失败，已回退默认值', error)
    cached = {
      schemaVersion: SETTINGS_SCHEMA_VERSION,
      settings: { ...DEFAULT_SETTINGS },
    }
  }

  return cached
}

export function getSettings(): AppSettings {
  return { ...readSettings().settings }
}

export function setAutoLaunch(enabled: boolean): AppSettings {
  const file = readSettings()
  const settings = { ...file.settings, autoLaunch: enabled }
  writeSettings({ ...file, settings })
  applyAutoLaunch(enabled)
  return settings
}

export function setImageMode(mode: ImageMode): AppSettings {
  const file = readSettings()
  const settings = { ...file.settings, imageMode: mode }
  writeSettings({ ...file, settings })
  return settings
}

export function setSelectedImage(imageId: string): AppSettings {
  const file = readSettings()
  const settings = { ...file.settings, selectedImageId: imageId }
  writeSettings({ ...file, settings })
  return settings
}

export function setIdleAnimation(enabled: boolean): AppSettings {
  const file = readSettings()
  const settings = { ...file.settings, idleAnimation: enabled }
  writeSettings({ ...file, settings })
  return settings
}

export function setProactiveLines(enabled: boolean): AppSettings {
  const file = readSettings()
  const settings = { ...file.settings, proactiveLines: enabled }
  writeSettings({ ...file, settings })
  return settings
}

export function setIdleReminder(enabled: boolean): AppSettings {
  const file = readSettings()
  const settings = { ...file.settings, idleReminder: enabled }
  writeSettings({ ...file, settings })
  return settings
}

export function setSleepReminder(enabled: boolean): AppSettings {
  const file = readSettings()
  const settings = { ...file.settings, sleepReminder: enabled }
  writeSettings({ ...file, settings })
  return settings
}

export function setEasterEggs(enabled: boolean): AppSettings {
  const file = readSettings()
  const settings = { ...file.settings, easterEggs: enabled }
  writeSettings({ ...file, settings })
  return settings
}

export function setNightInteraction(enabled: boolean): AppSettings {
  const file = readSettings()
  const settings = { ...file.settings, nightInteraction: enabled }
  writeSettings({ ...file, settings })
  return settings
}

export function setNightProactive(enabled: boolean): AppSettings {
  const file = readSettings()
  const settings = { ...file.settings, nightProactive: enabled }
  writeSettings({ ...file, settings })
  return settings
}

export function setModuleEnabled(id: ModuleId, enabled: boolean): AppSettings {
  return updateModuleSettings(id, { enabled })
}

export function updateModuleSettings<K extends ModuleId>(
  id: K,
  patch: Partial<ModuleSettings[K]>,
): AppSettings {
  return updateModuleSettingsById(id, patch as Record<string, unknown>)
}

/** IPC 入口使用：patch 来自渲染层，先合并再经 normalizeModuleSettings 校验 */
export function updateModuleSettingsById(
  id: ModuleId,
  patch: Record<string, unknown>,
): AppSettings {
  const file = readSettings()
  const modules = normalizeModuleSettings({
    ...file.settings.modules,
    [id]: { ...file.settings.modules[id], ...patch },
  })
  const settings = { ...file.settings, modules }
  writeSettings({ ...file, settings })
  return settings
}

/** 导入备份时整体替换设置；非法字段回退默认值 */
export function replaceSettings(value: unknown): AppSettings {
  const settings = parseSettings(value)
  const file = readSettings()
  writeSettings({ ...file, settings })
  applyAutoLaunch(settings.autoLaunch)
  return settings
}

/** 仅打包版写入注册表；开发环境不触碰系统自启项 */
export function applyAutoLaunch(enabled: boolean): void {
  if (!app.isPackaged) return

  try {
    app.setLoginItemSettings({
      openAtLogin: enabled,
      path: process.execPath,
    })
  } catch (error) {
    logger.warn('设置开机自启失败', error)
  }
}
