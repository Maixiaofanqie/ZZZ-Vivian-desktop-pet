export const MODULES_SCHEMA_VERSION = 1

export interface ModulesFile {
  schemaVersion: number
  modules: Record<string, unknown>
}

export function createEmptyModulesFile(): ModulesFile {
  return { schemaVersion: MODULES_SCHEMA_VERSION, modules: {} }
}

/** 校验 modules.json 外层结构；单模块数据由各模块自行归一化 */
export function normalizeModulesFile(value: unknown): ModulesFile | null {
  if (!value || typeof value !== 'object') return null

  const candidate = value as { schemaVersion?: unknown; modules?: unknown }
  if (candidate.schemaVersion !== MODULES_SCHEMA_VERSION) return null
  if (
    !candidate.modules ||
    typeof candidate.modules !== 'object' ||
    Array.isArray(candidate.modules)
  ) {
    return null
  }

  return {
    schemaVersion: MODULES_SCHEMA_VERSION,
    modules: { ...(candidate.modules as Record<string, unknown>) },
  }
}
