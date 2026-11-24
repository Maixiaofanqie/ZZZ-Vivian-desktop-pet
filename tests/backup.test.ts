import { describe, expect, it } from 'vitest'
import {
  type BackupPayload,
  createBackupPayload,
  formatBackupTimestamp,
  parseBackupPayload,
} from '../src/main/store/backupPayload'
import { createWorkMemory } from '../src/main/store/memory'
import type { ProfileFile } from '../src/main/store/migrations'
import { APP_ID, BACKUP_FORMAT_VERSION, PROFILE_SCHEMA_VERSION } from '../src/shared/constants'
import { DEFAULT_SETTINGS } from '../src/shared/settingsDefaults'

const profile: ProfileFile = {
  schemaVersion: PROFILE_SCHEMA_VERSION,
  coWork: {
    firstMetAt: 1_760_000_000_000,
    interactionCount: 12,
    lastInteractionAt: 1_760_000_100_000,
  },
  memory: {
    activeDays: ['2026-10-22', '2026-10-23'],
    milestones: [{ id: 'days-7', reachedAt: 1_760_000_000_000, seen: true }],
    work: {
      lastProjectName: 'demo-project',
      lastActiveAt: 1_760_000_000_000,
      sessionCount: 5,
      projectCount: 2,
      updatedAt: 1_760_000_100_000,
    },
  },
}

const modules = {
  schemaVersion: 1,
  modules: { pomodoro: { phase: 'idle' } },
}

function payload(overrides: Partial<BackupPayload> = {}): BackupPayload {
  return {
    ...createBackupPayload({
      settings: { ...DEFAULT_SETTINGS, idleAnimation: false, proactiveLines: true },
      profile,
      modules,
      position: { x: 120, y: 340 },
      now: 1_760_000_000_000,
    }),
    ...overrides,
  }
}

describe('备份文件', () => {
  it('导出后可以原样解析回来', () => {
    const source = payload()
    const parsed = parseBackupPayload(JSON.parse(JSON.stringify(source)))

    expect(parsed).not.toBeNull()
    expect(parsed?.settings).toEqual(source.settings)
    expect(parsed?.profile).toEqual(source.profile)
    expect(parsed?.modules).toEqual(source.modules)
    expect(parsed?.state.pet).toEqual({ x: 120, y: 340 })
    expect(parsed?.formatVersion).toBe(BACKUP_FORMAT_VERSION)
  })

  it('旧备份没有 modules 字段时按空模块数据导入', () => {
    const source = payload()
    const parsed = parseBackupPayload({
      ...source,
      modules: undefined,
    })

    expect(parsed?.modules).toEqual({ schemaVersion: 1, modules: {} })
  })

  it('旧版本 profile 在导入时自动迁移', () => {
    const source = payload()
    const parsed = parseBackupPayload({
      ...source,
      profile: { schemaVersion: 1, coWork: source.profile.coWork },
    })

    expect(parsed?.profile.schemaVersion).toBe(PROFILE_SCHEMA_VERSION)
    expect(parsed?.profile.memory).toEqual({
      activeDays: [],
      milestones: [],
      work: createWorkMemory(),
    })
  })

  it('非法设置字段回退默认值', () => {
    const source = payload()
    const parsed = parseBackupPayload({
      ...source,
      settings: { ...source.settings, imageMode: 'unknown', idleAnimation: 'yes' },
    })

    expect(parsed?.settings.imageMode).toBe(DEFAULT_SETTINGS.imageMode)
    expect(parsed?.settings.idleAnimation).toBe(DEFAULT_SETTINGS.idleAnimation)
  })

  it('缺少设置、类型或版本不符时整体拒绝', () => {
    const source = payload()

    expect(parseBackupPayload({ ...source, app: undefined })).toBeNull()
    expect(parseBackupPayload({ ...source, kind: 'other' })).toBeNull()
    expect(parseBackupPayload({ ...source, formatVersion: 99 })).toBeNull()
    expect(parseBackupPayload({ ...source, settings: null })).toBeNull()
    expect(parseBackupPayload({ ...source, profile: { schemaVersion: 2 } })).toBeNull()
    expect(parseBackupPayload(null)).toBeNull()
  })

  it('应用标识不同的备份仍可导入，并归一化为当前标识', () => {
    const parsed = parseBackupPayload({ ...payload(), app: 'legacy-app' })

    expect(parsed?.app).toBe(APP_ID)
  })

  it('窗口位置非法时置空，不阻断导入', () => {
    const source = payload()

    expect(
      parseBackupPayload({ ...source, state: { pet: { x: 'a', y: 2 } } })?.state.pet,
    ).toBeNull()
    expect(parseBackupPayload({ ...source, state: undefined })?.state.pet).toBeNull()
  })

  it('导出内容带应用标识与备份类型', () => {
    const source = payload()
    expect(source.app).toBe(APP_ID)
    expect(source.kind).toBe('vivian-backup')
  })
})

describe('备份文件名', () => {
  it('使用本地时间 YYYYMMDD-HHmmss', () => {
    const stamp = formatBackupTimestamp(new Date(2026, 9, 23, 9, 5, 7).getTime())
    expect(stamp).toBe('20261023-090507')
  })
})
