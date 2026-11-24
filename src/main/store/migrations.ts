import { PROFILE_SCHEMA_VERSION } from '../../shared/constants'
import { isValidCoWork } from '../../shared/coWork'
import type { CoWorkRecord } from '../../shared/ipc'
import { createMemoryRecord, type MemoryRecord, normalizeMemory } from './memory'

export interface ProfileFile {
  schemaVersion: number
  coWork: CoWorkRecord
  memory: MemoryRecord
}

/**
 * 顺序迁移 profile 文件；无法识别时返回 null，由调用方备份并回退默认值。
 *
 * v1 → v2：新增 memory（活跃日 + 里程碑），共处记录原样保留。
 * v2 → v3：memory 新增 work 聚合；旧记忆原样保留，缺失字段回退默认值。
 */
export function migrateProfile(raw: unknown): ProfileFile | null {
  if (!raw || typeof raw !== 'object') return null

  const value = raw as { schemaVersion?: unknown; coWork?: unknown; memory?: unknown }
  const version = value.schemaVersion

  if (typeof version !== 'number' || !Number.isInteger(version)) return null
  if (version < 1 || version > PROFILE_SCHEMA_VERSION) return null
  if (!isValidCoWork(value.coWork)) return null

  return {
    schemaVersion: PROFILE_SCHEMA_VERSION,
    coWork: value.coWork,
    memory: version >= 2 ? normalizeMemory(value.memory) : createMemoryRecord(),
  }
}
