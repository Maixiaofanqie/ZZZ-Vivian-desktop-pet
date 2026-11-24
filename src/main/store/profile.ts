import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import { PROFILE_SCHEMA_VERSION } from '../../shared/constants'
import {
  createCoWorkRecord,
  resetCoWork as createResetRecord,
  recordInteraction as recordCoWorkInteraction,
} from '../../shared/coWork'
import type { CoWorkRecord } from '../../shared/ipc'
import { logger } from '../services/logger'
import { createMemoryRecord, evaluateMemory, type MemoryRecord } from './memory'
import { migrateProfile, type ProfileFile } from './migrations'

type ProfileState = ProfileFile

let cached: ProfileState | null = null

function profileFilePath(): string {
  return join(app.getPath('userData'), 'profile.json')
}

function defaultProfile(now = Date.now()): ProfileState {
  return {
    schemaVersion: PROFILE_SCHEMA_VERSION,
    coWork: createCoWorkRecord(now),
    memory: createMemoryRecord(),
  }
}

function writeProfile(profile: ProfileState): void {
  const path = profileFilePath()
  const tempPath = `${path}.tmp`

  mkdirSync(app.getPath('userData'), { recursive: true })
  writeFileSync(tempPath, JSON.stringify(profile, null, 2), { encoding: 'utf8' })

  try {
    renameSync(tempPath, path)
  } catch {
    rmSync(path, { force: true })
    renameSync(tempPath, path)
  }

  cached = profile
}

function backupCorruptProfile(path: string): void {
  try {
    const backupPath = `${path}.corrupt-${Date.now()}`
    copyFileSync(path, backupPath)
    logger.warn(`共处记录损坏，已备份到 ${backupPath}`)
  } catch (error) {
    logger.warn('共处记录损坏，备份失败', error)
  }
}

function readProfile(): ProfileState {
  if (cached) return cached

  const path = profileFilePath()
  if (!existsSync(path)) {
    const profile = defaultProfile()
    writeProfile(profile)
    return profile
  }

  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'))
    const migrated = migrateProfile(parsed)

    if (!migrated) {
      backupCorruptProfile(path)
      const profile = defaultProfile()
      writeProfile(profile)
      return profile
    }

    cached = migrated

    // 旧版本读取后立即写回新结构，避免每次启动重复迁移
    const sourceVersion =
      parsed && typeof parsed === 'object'
        ? (parsed as { schemaVersion?: unknown }).schemaVersion
        : undefined
    if (sourceVersion !== PROFILE_SCHEMA_VERSION) {
      writeProfile(migrated)
      logger.info(`共处记录已迁移：v${String(sourceVersion)} → v${PROFILE_SCHEMA_VERSION}`)
    }

    return cached
  } catch (error) {
    backupCorruptProfile(path)
    logger.warn('读取共处记录失败，已回退默认值', error)
    const profile = defaultProfile()
    writeProfile(profile)
    return profile
  }
}

/** 记录今天的活跃日并评估里程碑；没有变化时不写盘 */
function touchMemory(now: number): MemoryRecord {
  const profile = readProfile()
  const { memory } = evaluateMemory(profile.coWork, profile.memory, now)
  if (memory !== profile.memory) {
    writeProfile({ ...profile, memory })
  }
  return memory
}

export function loadProfile(): CoWorkRecord {
  touchMemory(Date.now())
  return getCoWork()
}

export function getCoWork(): CoWorkRecord {
  return readProfile().coWork
}

export function getMemory(): MemoryRecord {
  return readProfile().memory
}

export function updateMemory(mutator: (memory: MemoryRecord) => MemoryRecord): MemoryRecord {
  const profile = readProfile()
  const memory = mutator(profile.memory)
  if (memory !== profile.memory) {
    writeProfile({ ...profile, memory })
  }
  return memory
}

export function recordInteraction(now = Date.now()): CoWorkRecord {
  const profile = readProfile()
  const coWork = recordCoWorkInteraction(profile.coWork, now)
  const { memory } = evaluateMemory(coWork, profile.memory, now)
  writeProfile({ ...profile, coWork, memory })
  return coWork
}

export function resetCoWork(now = Date.now()): CoWorkRecord {
  const profile = readProfile()
  const coWork = createResetRecord(now)
  writeProfile({ ...profile, coWork, memory: createMemoryRecord() })
  return coWork
}

/** 导出用：返回当前完整 profile（含记忆） */
export function getProfileFile(): ProfileFile {
  return readProfile()
}

/** 导入用：校验并整体替换；无法识别时返回 null，不修改现有数据 */
export function replaceProfileFile(value: unknown): ProfileFile | null {
  const profile = migrateProfile(value)
  if (!profile) return null
  writeProfile(profile)
  return profile
}
