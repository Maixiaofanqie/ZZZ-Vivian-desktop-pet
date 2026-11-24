import { APP_ID, BACKUP_FORMAT_VERSION } from '../../shared/constants'
import { type AppSettings, parseSettings } from '../../shared/settingsDefaults'
import { migrateProfile, type ProfileFile } from './migrations'
import { createEmptyModulesFile, type ModulesFile, normalizeModulesFile } from './modulesFile'

export interface BackupPayload {
  app: string
  kind: 'vivian-backup'
  formatVersion: number
  exportedAt: number
  settings: AppSettings
  profile: ProfileFile
  modules: ModulesFile
  state: { pet: { x: number; y: number } | null }
}

export interface BackupInput {
  settings: AppSettings
  profile: ProfileFile
  modules: ModulesFile
  position: { x: number; y: number } | null
  now?: number
}

export function createBackupPayload(input: BackupInput): BackupPayload {
  return {
    app: APP_ID,
    kind: 'vivian-backup',
    formatVersion: BACKUP_FORMAT_VERSION,
    exportedAt: input.now ?? Date.now(),
    settings: input.settings,
    profile: input.profile,
    modules: input.modules,
    state: { pet: input.position },
  }
}

function isFinitePosition(value: unknown): value is { x: number; y: number } {
  if (!value || typeof value !== 'object') return false

  const position = value as { x?: unknown; y?: unknown }
  return (
    typeof position.x === 'number' &&
    typeof position.y === 'number' &&
    Number.isFinite(position.x) &&
    Number.isFinite(position.y)
  )
}

/**
 * 校验备份文件；任一项不可识别即整体拒绝，不做部分导入。
 * profile 走迁移链，因此旧版本备份也能导入。
 * app 只作为导出应用记录：安装标识变更后，旧备份仍应可导入。
 */
export function parseBackupPayload(raw: unknown): BackupPayload | null {
  if (!raw || typeof raw !== 'object') return null

  const value = raw as Record<string, unknown>
  if (value.kind !== 'vivian-backup') return null
  if (typeof value.app !== 'string' || value.app.length === 0) return null
  if (value.formatVersion !== BACKUP_FORMAT_VERSION) return null
  if (!value.settings || typeof value.settings !== 'object' || Array.isArray(value.settings)) {
    return null
  }

  const profile = migrateProfile(value.profile)
  if (!profile) return null

  // 旧备份没有 modules 字段：按空模块数据导入，不阻断迁移
  const modules =
    value.modules === undefined ? createEmptyModulesFile() : normalizeModulesFile(value.modules)
  if (!modules) return null

  const state =
    value.state && typeof value.state === 'object' ? (value.state as { pet?: unknown }) : {}
  const pet = isFinitePosition(state.pet)
    ? { x: Math.round(state.pet.x), y: Math.round(state.pet.y) }
    : null

  return {
    app: APP_ID,
    kind: 'vivian-backup',
    formatVersion: BACKUP_FORMAT_VERSION,
    exportedAt:
      typeof value.exportedAt === 'number' && Number.isFinite(value.exportedAt)
        ? value.exportedAt
        : 0,
    settings: parseSettings(value.settings),
    profile,
    modules,
    state: { pet },
  }
}

/** 备份文件名使用本地时间：YYYYMMDD-HHmmss */
export function formatBackupTimestamp(timestamp: number): string {
  const date = new Date(timestamp)
  const pad = (value: number): string => String(value).padStart(2, '0')

  return [
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`,
    `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`,
  ].join('-')
}
