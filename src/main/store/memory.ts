import { daysTogether } from '../../shared/coWork'
import type { ClaudeCodeSnapshot, CoWorkRecord } from '../../shared/ipc'

/** 一次性里程碑事件；只记录节点事实与展示状态 */
export interface MilestoneRecord {
  id: string
  reachedAt: number
  /** 是否已经向用户展示过；彩蛋据此保证只触发一次 */
  seen: boolean
}

/** Claude Code 工作聚合；只存项目名、时间与计数，不存路径或对话内容 */
export interface WorkMemory {
  lastProjectName: string | null
  lastActiveAt: number | null
  sessionCount: number
  /** 最近项目数（面板上限 5） */
  projectCount: number
  updatedAt: number | null
}

export interface MemoryRecord {
  /** 最近 90 天的本地自然日，格式 YYYY-MM-DD，升序 */
  activeDays: string[]
  /** 里程碑事件，最多 100 条，按解锁时间升序 */
  milestones: MilestoneRecord[]
  /** Claude Code 工作聚合 */
  work: WorkMemory
}

export const ACTIVE_DAYS_LIMIT = 90
export const MILESTONES_LIMIT = 100

const DAY_MILESTONE_THRESHOLDS = [7, 30, 100, 365] as const
const INTERACTION_THRESHOLDS = [100, 1000] as const

export function createWorkMemory(): WorkMemory {
  return {
    lastProjectName: null,
    lastActiveAt: null,
    sessionCount: 0,
    projectCount: 0,
    updatedAt: null,
  }
}

export function createMemoryRecord(): MemoryRecord {
  return { activeDays: [], milestones: [], work: createWorkMemory() }
}

/** 本地自然日键；用于统计活跃日，不做时区换算 */
export function localDayKey(timestamp: number): string {
  const date = new Date(timestamp)
  if (!Number.isFinite(date.getTime())) return ''

  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function isDayKey(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function isMilestoneRecord(value: unknown): value is MilestoneRecord {
  if (!value || typeof value !== 'object') return false

  const record = value as Partial<MilestoneRecord>
  return (
    typeof record.id === 'string' &&
    record.id.length > 0 &&
    typeof record.reachedAt === 'number' &&
    Number.isFinite(record.reachedAt) &&
    record.reachedAt > 0 &&
    typeof record.seen === 'boolean'
  )
}

function finitePositive(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.round(value) : null
}

function nonNegativeInt(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.max(0, Math.floor(value))
    : 0
}

function normalizeWorkMemory(value: unknown): WorkMemory {
  if (!value || typeof value !== 'object') return createWorkMemory()

  const candidate = value as Partial<WorkMemory>
  const lastProjectName =
    typeof candidate.lastProjectName === 'string' && candidate.lastProjectName.trim()
      ? candidate.lastProjectName.trim().slice(0, 120)
      : null

  if (!lastProjectName) return createWorkMemory()

  return {
    lastProjectName,
    lastActiveAt: finitePositive(candidate.lastActiveAt),
    sessionCount: nonNegativeInt(candidate.sessionCount),
    projectCount: nonNegativeInt(candidate.projectCount),
    updatedAt: finitePositive(candidate.updatedAt),
  }
}

/**
 * 容错归一化：丢弃非法条目、去重、排序并裁剪到上限。
 * 用于读取旧文件或手工编辑过的文件，不因此让应用崩溃。
 */
export function normalizeMemory(value: unknown): MemoryRecord {
  if (!value || typeof value !== 'object') return createMemoryRecord()

  const candidate = value as Partial<MemoryRecord>
  const activeDays = Array.isArray(candidate.activeDays)
    ? [...new Set(candidate.activeDays.filter(isDayKey))].sort().slice(-ACTIVE_DAYS_LIMIT)
    : []

  const milestoneMap = new Map<string, MilestoneRecord>()
  if (Array.isArray(candidate.milestones)) {
    for (const item of candidate.milestones) {
      if (isMilestoneRecord(item) && !milestoneMap.has(item.id)) {
        milestoneMap.set(item.id, item)
      }
    }
  }

  const milestones = [...milestoneMap.values()]
    .sort((a, b) => a.reachedAt - b.reachedAt)
    .slice(-MILESTONES_LIMIT)

  return { activeDays, milestones, work: normalizeWorkMemory(candidate.work) }
}

/**
 * 把最近的 Claude Code 扫描结果并入记忆。
 * 没有项目时保持原记忆；只有聚合字段变化时才返回新对象，避免每次扫描都写盘。
 */
export function recordWorkSnapshot(
  memory: MemoryRecord,
  snapshot: ClaudeCodeSnapshot,
  now = Date.now(),
): MemoryRecord {
  const project = snapshot.projects[0]
  if (!project) return memory

  const next: WorkMemory = {
    lastProjectName: project.displayName,
    lastActiveAt: project.lastActiveAt,
    sessionCount: project.sessionCount,
    projectCount: snapshot.projects.length,
    updatedAt: snapshot.scannedAt || now,
  }
  const current = memory.work

  if (
    current.lastProjectName === next.lastProjectName &&
    current.lastActiveAt === next.lastActiveAt &&
    current.sessionCount === next.sessionCount &&
    current.projectCount === next.projectCount
  ) {
    return memory
  }

  return { ...memory, work: next }
}

export interface MemoryEvaluation {
  memory: MemoryRecord
  /** 本次新解锁的里程碑 */
  unlocked: MilestoneRecord[]
}

/**
 * 记录今天的活跃日并评估里程碑。
 * 没有变化时返回原对象，便于调用方跳过写盘。
 */
export function evaluateMemory(
  coWork: CoWorkRecord,
  memory: MemoryRecord,
  now: number,
): MemoryEvaluation {
  const existing = new Set(memory.milestones.map((milestone) => milestone.id))
  const unlocked: MilestoneRecord[] = []
  const days = daysTogether(coWork, now)
  const interactions = Math.max(0, Math.floor(coWork.interactionCount))

  const unlock = (id: string): void => {
    if (existing.has(id)) return
    existing.add(id)
    unlocked.push({ id, reachedAt: now, seen: false })
  }

  for (const threshold of DAY_MILESTONE_THRESHOLDS) {
    if (days >= threshold) unlock(`days-${threshold}`)
  }

  for (const threshold of INTERACTION_THRESHOLDS) {
    if (interactions >= threshold) unlock(`interactions-${threshold}`)
  }

  // 纪念日按年记录，次年同一月日可再次触发
  const firstMet = new Date(coWork.firstMetAt)
  const current = new Date(now)
  if (
    Number.isFinite(firstMet.getTime()) &&
    current.getFullYear() > firstMet.getFullYear() &&
    current.getMonth() === firstMet.getMonth() &&
    current.getDate() === firstMet.getDate()
  ) {
    unlock(`anniversary-${current.getFullYear()}`)
  }

  const today = localDayKey(now)
  const activeDays =
    today && !memory.activeDays.includes(today)
      ? [...memory.activeDays, today].sort().slice(-ACTIVE_DAYS_LIMIT)
      : memory.activeDays

  if (unlocked.length === 0 && activeDays === memory.activeDays) {
    return { memory, unlocked: [] }
  }

  return {
    memory: {
      activeDays,
      milestones: [...memory.milestones, ...unlocked].slice(-MILESTONES_LIMIT),
      work: memory.work,
    },
    unlocked,
  }
}

/** 标记里程碑已展示；没有命中时返回原对象 */
export function markMilestonesSeen(memory: MemoryRecord, ids: readonly string[]): MemoryRecord {
  const target = new Set(ids)
  if (!memory.milestones.some((milestone) => target.has(milestone.id) && !milestone.seen)) {
    return memory
  }

  return {
    ...memory,
    milestones: memory.milestones.map((milestone) =>
      target.has(milestone.id) ? { ...milestone, seen: true } : milestone,
    ),
  }
}
