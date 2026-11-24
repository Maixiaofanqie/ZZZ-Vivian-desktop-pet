import type { CoWorkRecord } from './ipc'

const DAY_MS = 24 * 60 * 60 * 1000

export function createCoWorkRecord(now: number): CoWorkRecord {
  return {
    firstMetAt: now,
    interactionCount: 0,
    lastInteractionAt: null,
  }
}

export function recordInteraction(record: CoWorkRecord, now: number): CoWorkRecord {
  return {
    firstMetAt: record.firstMetAt > 0 ? record.firstMetAt : now,
    interactionCount: Math.max(0, Math.floor(record.interactionCount)) + 1,
    lastInteractionAt: now,
  }
}

export function resetCoWork(now: number): CoWorkRecord {
  return createCoWorkRecord(now)
}

function startOfLocalDay(timestamp: number): number {
  const date = new Date(timestamp)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

/** 「一起度过的第 N 天」：按本地自然日计算，首次见面当天为第 1 天 */
export function daysTogether(record: CoWorkRecord, now: number): number {
  const firstDay = startOfLocalDay(record.firstMetAt)
  const currentDay = startOfLocalDay(now)
  if (!Number.isFinite(firstDay) || !Number.isFinite(currentDay)) return 1
  return Math.max(1, Math.floor((currentDay - firstDay) / DAY_MS) + 1)
}

export function isValidCoWork(value: unknown): value is CoWorkRecord {
  if (!value || typeof value !== 'object') return false
  const record = value as Partial<CoWorkRecord>
  return (
    typeof record.firstMetAt === 'number' &&
    Number.isFinite(record.firstMetAt) &&
    record.firstMetAt > 0 &&
    typeof record.interactionCount === 'number' &&
    Number.isFinite(record.interactionCount) &&
    record.interactionCount >= 0 &&
    (record.lastInteractionAt === null ||
      (typeof record.lastInteractionAt === 'number' && Number.isFinite(record.lastInteractionAt)))
  )
}
