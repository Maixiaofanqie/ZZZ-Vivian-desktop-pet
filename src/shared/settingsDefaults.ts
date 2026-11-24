import { DEFAULT_IMAGE_ID, DEFAULT_IMAGE_MODE } from './imageSelection'
import type { ImageMode } from './ipc'
import { DEFAULT_MODULE_SETTINGS, type ModuleSettings, normalizeModuleSettings } from './modules'

export interface AppSettings {
  autoLaunch: boolean
  imageMode: ImageMode
  selectedImageId: string
  idleAnimation: boolean
  proactiveLines: boolean
  idleReminder: boolean
  sleepReminder: boolean
  easterEggs: boolean
  /** 夜间互动总开关：关闭后隐藏并压制全部夜间子项 */
  nightInteraction: boolean
  /** 夜间子开关：23:00–08:00 是否允许定时主动问候 */
  nightProactive: boolean
  modules: ModuleSettings
}

export const DEFAULT_SETTINGS: AppSettings = {
  autoLaunch: false,
  imageMode: DEFAULT_IMAGE_MODE,
  selectedImageId: DEFAULT_IMAGE_ID,
  idleAnimation: true,
  proactiveLines: false,
  idleReminder: true,
  sleepReminder: true,
  easterEggs: true,
  nightInteraction: true,
  nightProactive: true,
  modules: DEFAULT_MODULE_SETTINGS,
}

function isValidImageMode(value: unknown): value is ImageMode {
  return value === 'cycle' || value === 'fixed'
}

/** 容错归一化：缺失或非法的字段回退默认值 */
export function normalizeSettings(value: unknown): AppSettings {
  const candidate = value && typeof value === 'object' ? (value as Partial<AppSettings>) : {}

  return {
    autoLaunch:
      typeof candidate.autoLaunch === 'boolean'
        ? candidate.autoLaunch
        : DEFAULT_SETTINGS.autoLaunch,
    imageMode: isValidImageMode(candidate.imageMode)
      ? candidate.imageMode
      : DEFAULT_SETTINGS.imageMode,
    selectedImageId:
      typeof candidate.selectedImageId === 'string' &&
      /^vivian_static_\d{2}$/.test(candidate.selectedImageId)
        ? candidate.selectedImageId
        : DEFAULT_SETTINGS.selectedImageId,
    idleAnimation:
      typeof candidate.idleAnimation === 'boolean'
        ? candidate.idleAnimation
        : DEFAULT_SETTINGS.idleAnimation,
    proactiveLines:
      typeof candidate.proactiveLines === 'boolean'
        ? candidate.proactiveLines
        : DEFAULT_SETTINGS.proactiveLines,
    idleReminder:
      typeof candidate.idleReminder === 'boolean'
        ? candidate.idleReminder
        : DEFAULT_SETTINGS.idleReminder,
    sleepReminder:
      typeof candidate.sleepReminder === 'boolean'
        ? candidate.sleepReminder
        : DEFAULT_SETTINGS.sleepReminder,
    easterEggs:
      typeof candidate.easterEggs === 'boolean'
        ? candidate.easterEggs
        : DEFAULT_SETTINGS.easterEggs,
    nightInteraction:
      typeof candidate.nightInteraction === 'boolean'
        ? candidate.nightInteraction
        : DEFAULT_SETTINGS.nightInteraction,
    nightProactive:
      typeof candidate.nightProactive === 'boolean'
        ? candidate.nightProactive
        : DEFAULT_SETTINGS.nightProactive,
    modules: normalizeModuleSettings(candidate.modules),
  }
}

/** 兼容 `{ settings: ... }` 包装与直接对象两种输入 */
export function parseSettings(value: unknown): AppSettings {
  const candidate =
    value && typeof value === 'object' && 'settings' in value
      ? (value as { settings?: unknown }).settings
      : value

  return normalizeSettings(candidate)
}
