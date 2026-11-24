import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { ModuleContext, PetModule } from '../types'
import {
  addReminder,
  createRemindersState,
  dueReminders,
  markReminderShown,
  normalizeRemindersState,
  pruneReminders,
  REMINDER_TEXT_MAX,
  type RemindersState,
  removeReminder,
  setReminderCompleted,
} from './state'

const CHECK_INTERVAL_MS = 10_000
const OVERDUE_THRESHOLD_MS = 60_000

const settingsSchema = z.object({ enabled: z.boolean() })
const addSchema = z.object({
  text: z.string().trim().min(1).max(REMINDER_TEXT_MAX),
  dueAt: z.number().int().positive(),
})
const removeSchema = z.object({ id: z.string().min(1) })
const setCompletedSchema = z.object({ id: z.string().min(1), completed: z.boolean() })

let ctx: ModuleContext | null = null
let running = false
let state: RemindersState = createRemindersState()
let checkTimer: ReturnType<typeof setInterval> | null = null

function persist(): void {
  ctx?.setState(state)
}

function snapshot(): Record<string, unknown> {
  return {
    enabled: running,
    items: state.items.map((item) => ({
      id: item.id,
      text: item.text,
      dueAt: item.dueAt,
      done: item.done,
      shownAt: item.shownAt,
      completed: item.completed,
      completedAt: item.completedAt,
    })),
  }
}

function checkDue(): void {
  if (!running || !ctx) return

  const now = Date.now()
  const due = dueReminders(state, now)
  const next = due[0]
  if (!next) return

  const overdue = now - next.dueAt > OVERDUE_THRESHOLD_MS
  const text = overdue
    ? `法厄同大人，之前有件事想提醒您：${next.text}`
    : `法厄同大人，提醒您：${next.text}`

  if (!ctx.notify(text)) return

  state = markReminderShown(state, next.id, now)
  persist()
  ctx.logger.info('预知式提醒已展示', { id: next.id, overdue })
}

function startCheckTimer(): void {
  if (!ctx || checkTimer) return
  checkTimer = ctx.scheduler.setInterval(checkDue, CHECK_INTERVAL_MS)
}

function stopCheckTimer(): void {
  if (checkTimer && ctx) {
    ctx.scheduler.clearInterval(checkTimer)
    checkTimer = null
  }
}

function add(payload: { text: string; dueAt: number }): void {
  if (!ctx) return

  const now = Date.now()
  state = addReminder(state, {
    id: randomUUID(),
    text: payload.text.trim(),
    dueAt: payload.dueAt,
    createdAt: now,
    done: false,
    shownAt: null,
    completed: false,
    completedAt: null,
  })
  persist()
  ctx.logger.info('预知式提醒已添加', { dueAt: payload.dueAt })
  checkDue()
}

function remove(payload: { id: string }): void {
  state = removeReminder(state, payload.id)
  persist()
}

function setCompleted(payload: { id: string; completed: boolean }): void {
  state = setReminderCompleted(state, payload.id, payload.completed, Date.now())
  persist()
}

async function setup(context: ModuleContext): Promise<void> {
  ctx = context

  context.ipc.handle('reminders:list', z.object({}), () => snapshot())
  context.ipc.handle('reminders:add', addSchema, (payload) => {
    add(payload)
    return snapshot()
  })
  context.ipc.handle('reminders:remove', removeSchema, (payload) => {
    remove(payload)
    return snapshot()
  })
  context.ipc.handle('reminders:set-completed', setCompletedSchema, (payload) => {
    setCompleted(payload)
    return snapshot()
  })
}

async function startModule(): Promise<void> {
  if (running) return
  running = true

  state = normalizeRemindersState(ctx?.getState<RemindersState>())
  state = pruneReminders(state, Date.now())
  persist()
  startCheckTimer()
  checkDue()
}

async function stopModule(): Promise<void> {
  if (!running) return

  running = false
  stopCheckTimer()
  persist()
}

async function dispose(): Promise<void> {
  await stopModule()
  ctx = null
}

export const remindersModule: PetModule = {
  id: 'reminders',
  title: '预知式提醒',
  description: '到点由薇薇安提醒您；关闭期间错过的提醒会在下次启动补发',
  defaultEnabled: true,
  panelPage: {
    id: 'reminders',
    title: '日程 · 待办',
    description: '未完成与已完成的提醒、待办；与提醒模块共用数据',
    order: 40,
  },
  settingsSchema,
  setup,
  start: startModule,
  stop: stopModule,
  dispose,
}
