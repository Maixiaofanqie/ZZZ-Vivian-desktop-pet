export interface ReminderItem {
  id: string
  text: string
  /** 计划提醒时间 */
  dueAt: number
  createdAt: number
  /** 已到点展示过一次（归档，不计入“已完成”） */
  done: boolean
  shownAt: number | null
  /** 用户手动勾选完成 */
  completed: boolean
  completedAt: number | null
}

export interface RemindersState {
  items: ReminderItem[]
}

export const REMINDER_TEXT_MAX = 60
export const REMINDER_MAX_ITEMS = 100
export const REMINDER_RETENTION_MS = 30 * 24 * 60 * 60 * 1000

export function createRemindersState(): RemindersState {
  return { items: [] }
}

function isValidItem(value: unknown): value is ReminderItem {
  if (!value || typeof value !== 'object') return false

  const item = value as Partial<ReminderItem>
  return (
    typeof item.id === 'string' &&
    item.id.length > 0 &&
    typeof item.text === 'string' &&
    item.text.trim().length > 0 &&
    item.text.length <= REMINDER_TEXT_MAX &&
    typeof item.dueAt === 'number' &&
    Number.isFinite(item.dueAt) &&
    item.dueAt > 0 &&
    typeof item.createdAt === 'number' &&
    Number.isFinite(item.createdAt) &&
    item.createdAt > 0 &&
    typeof item.done === 'boolean' &&
    (item.shownAt === null ||
      (typeof item.shownAt === 'number' && Number.isFinite(item.shownAt))) &&
    (item.completed === undefined || typeof item.completed === 'boolean') &&
    (item.completedAt === undefined ||
      item.completedAt === null ||
      (typeof item.completedAt === 'number' && Number.isFinite(item.completedAt)))
  )
}

function sortItems(items: ReminderItem[]): ReminderItem[] {
  return [...items].sort((a, b) => a.dueAt - b.dueAt || a.createdAt - b.createdAt)
}

/** 容错归一化：丢弃非法条目、按 id 去重、按时间排序 */
export function normalizeRemindersState(value: unknown): RemindersState {
  if (!value || typeof value !== 'object') return createRemindersState()

  const candidate = value as { items?: unknown }
  if (!Array.isArray(candidate.items)) return createRemindersState()

  const seen = new Set<string>()
  const items: ReminderItem[] = []

  for (const raw of candidate.items) {
    if (!isValidItem(raw) || seen.has(raw.id)) continue
    seen.add(raw.id)

    // 旧数据没有 completed/completedAt：默认未完成，已提醒过的条目仍按 done 归档
    const completed = raw.completed === true
    const completedAt =
      completed && typeof raw.completedAt === 'number' && Number.isFinite(raw.completedAt)
        ? raw.completedAt
        : null
    items.push({ ...raw, text: raw.text.trim(), completed, completedAt })
  }

  return { items: sortItems(items) }
}

/** 删除过期的已完成/已提醒记录，并限制总量；待展示提醒不因时间久而丢弃 */
export function pruneReminders(
  state: RemindersState,
  now: number,
  retentionMs = REMINDER_RETENTION_MS,
): RemindersState {
  const kept = state.items.filter((item) => {
    if (!item.done && !item.completed) return true
    const archivedAt = item.completed
      ? (item.completedAt ?? item.dueAt)
      : (item.shownAt ?? item.dueAt)
    return now - archivedAt <= retentionMs
  })

  const pending = kept.filter((item) => !item.done && !item.completed).slice(0, REMINDER_MAX_ITEMS)
  const archived = kept.filter((item) => item.done || item.completed)
  const allowedArchived = Math.max(0, REMINDER_MAX_ITEMS - pending.length)
  const keptArchived = allowedArchived === 0 ? [] : archived.slice(-allowedArchived)

  return {
    items: sortItems([...pending, ...keptArchived]),
  }
}

export function addReminder(state: RemindersState, item: ReminderItem): RemindersState {
  return pruneReminders(
    {
      items: sortItems([...state.items, item]),
    },
    item.createdAt,
  )
}

export function removeReminder(state: RemindersState, id: string): RemindersState {
  return { items: state.items.filter((item) => item.id !== id) }
}

/** 到点且未展示、未手动完成的提醒，按时间升序 */
export function dueReminders(state: RemindersState, now: number): ReminderItem[] {
  return state.items.filter((item) => !item.done && !item.completed && item.dueAt <= now)
}

export function markReminderShown(state: RemindersState, id: string, now: number): RemindersState {
  return {
    items: state.items.map((item) =>
      item.id === id ? { ...item, done: true, shownAt: now } : item,
    ),
  }
}

/**
 * 手动勾选/取消完成。
 * 只改变 completed / completedAt，不触碰 done / shownAt；
 * 若取消的是已过时间的事项，它会重新进入待提醒队列。
 */
export function setReminderCompleted(
  state: RemindersState,
  id: string,
  completed: boolean,
  now: number,
): RemindersState {
  return {
    items: state.items.map((item) =>
      item.id === id
        ? {
            ...item,
            completed,
            completedAt: completed ? (item.completedAt ?? now) : null,
          }
        : item,
    ),
  }
}

export function pendingReminders(state: RemindersState): ReminderItem[] {
  return state.items.filter((item) => !item.done && !item.completed)
}
