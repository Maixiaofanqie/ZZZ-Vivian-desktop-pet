import { describe, expect, it } from 'vitest'
import {
  addReminder,
  createRemindersState,
  dueReminders,
  markReminderShown,
  normalizeRemindersState,
  pendingReminders,
  pruneReminders,
  REMINDER_MAX_ITEMS,
  REMINDER_RETENTION_MS,
  type ReminderItem,
  removeReminder,
  setReminderCompleted,
} from '../src/main/modules/reminders/state'

const NOW = new Date(2026, 9, 24, 10, 0).getTime()
const MINUTE = 60 * 1000

function item(overrides: Partial<ReminderItem> = {}): ReminderItem {
  return {
    id: 'r1',
    text: '交房租',
    dueAt: NOW + 60 * MINUTE,
    createdAt: NOW,
    done: false,
    shownAt: null,
    completed: false,
    completedAt: null,
    ...overrides,
  }
}

describe('预知式提醒状态', () => {
  it('初始为空', () => {
    expect(createRemindersState()).toEqual({ items: [] })
  })

  it('按 dueAt 排序，丢弃非法与重复条目', () => {
    const state = normalizeRemindersState({
      items: [
        item({ id: 'late', dueAt: NOW + 120 * MINUTE }),
        item({ id: 'early', dueAt: NOW + 10 * MINUTE }),
        item({ id: 'early', dueAt: NOW + 5 * MINUTE }),
        { id: '', text: '', dueAt: 0 },
        null,
      ],
    })

    expect(state.items.map((entry) => entry.id)).toEqual(['early', 'late'])
  })

  it('旧数据缺少 completed 时按未完成归一化', () => {
    const legacy = { ...item() } as Partial<ReminderItem>
    delete legacy.completed
    delete legacy.completedAt

    const state = normalizeRemindersState({ items: [legacy] })
    expect(state.items[0]?.completed).toBe(false)
    expect(state.items[0]?.completedAt).toBeNull()
    expect(state.items[0]?.done).toBe(false)
  })

  it('添加与删除提醒', () => {
    const added = addReminder(createRemindersState(), item())
    expect(added.items).toHaveLength(1)

    const removed = removeReminder(added, 'r1')
    expect(removed.items).toHaveLength(0)
  })

  it('只返回到点、未展示且未手动完成的提醒', () => {
    const state = {
      items: [
        item({ id: 'due', dueAt: NOW - MINUTE }),
        item({ id: 'future', dueAt: NOW + MINUTE }),
        item({ id: 'done', dueAt: NOW - MINUTE, done: true, shownAt: NOW - MINUTE }),
        item({
          id: 'completed',
          dueAt: NOW - MINUTE,
          completed: true,
          completedAt: NOW - MINUTE,
        }),
      ],
    }

    expect(dueReminders(state, NOW).map((entry) => entry.id)).toEqual(['due'])
    expect(pendingReminders(state).map((entry) => entry.id)).toEqual(['due', 'future'])
  })

  it('标记展示后不再触发，也不计入已完成', () => {
    const state = { items: [item({ id: 'due', dueAt: NOW - MINUTE })] }
    const marked = markReminderShown(state, 'due', NOW)

    expect(marked.items[0]?.done).toBe(true)
    expect(marked.items[0]?.shownAt).toBe(NOW)
    expect(marked.items[0]?.completed).toBe(false)
    expect(dueReminders(marked, NOW)).toHaveLength(0)
    expect(pendingReminders(marked)).toHaveLength(0)
  })

  it('手动勾选完成写入 completedAt，取消后可重新提醒', () => {
    const state = { items: [item({ id: 'due', dueAt: NOW - MINUTE })] }
    const completed = setReminderCompleted(state, 'due', true, NOW)

    expect(completed.items[0]?.completed).toBe(true)
    expect(completed.items[0]?.completedAt).toBe(NOW)
    expect(completed.items[0]?.done).toBe(false)
    expect(dueReminders(completed, NOW)).toHaveLength(0)
    expect(pendingReminders(completed)).toHaveLength(0)

    const undone = setReminderCompleted(completed, 'due', false, NOW)
    expect(undone.items[0]?.completed).toBe(false)
    expect(undone.items[0]?.completedAt).toBeNull()
    expect(dueReminders(undone, NOW).map((entry) => entry.id)).toEqual(['due'])
  })

  it('清理过期的已完成与已提醒记录，保留待展示提醒', () => {
    const old = NOW - REMINDER_RETENTION_MS - MINUTE
    const state = {
      items: [
        item({ id: 'pending', dueAt: old }),
        item({ id: 'old-done', dueAt: old, done: true, shownAt: old }),
        item({
          id: 'recent-done',
          dueAt: NOW - 2 * MINUTE,
          done: true,
          shownAt: NOW - 2 * MINUTE,
        }),
        item({
          id: 'old-completed',
          dueAt: old,
          completed: true,
          completedAt: old,
        }),
        item({
          id: 'recent-completed',
          dueAt: NOW - 3 * MINUTE,
          completed: true,
          completedAt: NOW - 3 * MINUTE,
        }),
      ],
    }

    const pruned = pruneReminders(state, NOW)
    expect(pruned.items.map((entry) => entry.id)).toEqual([
      'pending',
      'recent-completed',
      'recent-done',
    ])
  })

  it('总量上限：待展示优先，归档记录只保留最近部分', () => {
    const items = Array.from({ length: REMINDER_MAX_ITEMS + 10 }, (_, index) =>
      item({
        id: `r${index}`,
        dueAt: NOW + index * MINUTE,
        done: index % 2 === 0,
        shownAt: index % 2 === 0 ? NOW : null,
      }),
    )

    const pruned = pruneReminders({ items }, NOW)
    expect(pruned.items.length).toBeLessThanOrEqual(REMINDER_MAX_ITEMS)
    expect(pruned.items.filter((entry) => !entry.done && !entry.completed).length).toBeGreaterThan(
      0,
    )
  })

  it('文本超过 60 字视为非法', () => {
    const state = normalizeRemindersState({
      items: [item({ text: '长'.repeat(61) })],
    })
    expect(state.items).toHaveLength(0)
  })
})
