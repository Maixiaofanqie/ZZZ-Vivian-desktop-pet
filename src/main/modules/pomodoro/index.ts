import { app, type MenuItemConstructorOptions } from 'electron'
import { z } from 'zod'
import {
  POMODORO_MAX_BREAK,
  POMODORO_MAX_FOCUS,
  POMODORO_MIN_BREAK,
  POMODORO_MIN_FOCUS,
  type PomodoroSettings,
} from '../../../shared/modules'
import { registerModuleMenus, unregisterModuleMenus } from '../menus'
import type { ModuleContext, PetModule } from '../types'
import {
  createPomodoroState,
  normalizePomodoroState,
  type PomodoroEvent,
  type PomodoroState,
  pause,
  remainingMs,
  reset,
  restoreOnStartup,
  startFocus,
  tick,
} from './state'

const MINUTE = 60 * 1000
const DEFAULT_SETTINGS: PomodoroSettings = {
  enabled: false,
  focusMinutes: 25,
  breakMinutes: 5,
}

const settingsSchema = z.object({
  enabled: z.boolean(),
  focusMinutes: z.number().int().min(POMODORO_MIN_FOCUS).max(POMODORO_MAX_FOCUS),
  breakMinutes: z.number().int().min(POMODORO_MIN_BREAK).max(POMODORO_MAX_BREAK),
})

let ctx: ModuleContext | null = null
let running = false
let state: PomodoroState = createPomodoroState()
let tickTimer: ReturnType<typeof setTimeout> | null = null
let autostartAttempted = false

function settings(): PomodoroSettings {
  return ctx?.getSettings<PomodoroSettings>() ?? DEFAULT_SETTINGS
}

/** 开发期短计时钩子；打包版忽略 */
function testDurationOverride(): number | null {
  if (app.isPackaged) return null
  const value = Number(process.env.VIVIAN_POMODORO_TEST_MS)
  return Number.isFinite(value) && value > 0 ? Math.max(1000, value) : null
}

function focusMs(): number {
  return testDurationOverride() ?? settings().focusMinutes * MINUTE
}

function breakMs(): number {
  return testDurationOverride() ?? settings().breakMinutes * MINUTE
}

function persist(): void {
  ctx?.setState(state)
}

function cancelTick(): void {
  if (tickTimer && ctx) {
    ctx.scheduler.clearTimeout(tickTimer)
    tickTimer = null
  }
}

function refreshMenus(): void {
  ctx?.refreshMenus()
}

function notify(text: string, retries = 2): void {
  if (!running || !ctx) return
  if (ctx.notify(text)) return

  if (retries > 0) {
    ctx.scheduler.setTimeout(() => {
      if (running) notify(text, retries - 1)
    }, 30_000)
  }
}

function notifyEvent(event: PomodoroEvent): void {
  ctx?.logger.info('番茄钟事件', { event })

  switch (event) {
    case 'focus-complete':
      notify(`专注时间结束了，法厄同大人。休息 ${settings().breakMinutes} 分钟吧。`)
      break
    case 'break-complete':
      notify('休息结束。法厄同大人要再来一轮吗？')
      break
    case 'focus-overdue':
      notify('专注已经结束了，法厄同大人。……您回来啦。')
      break
    case 'break-overdue':
      notify('休息已经结束了，法厄同大人。')
      break
  }
}

function scheduleTick(): void {
  cancelTick()
  if (!running || !ctx || state.pausedRemainingMs !== null) return

  const remaining = remainingMs(state, Date.now())
  if (remaining === null) return

  tickTimer = ctx.scheduler.setTimeout(() => {
    tickTimer = null
    handleTick()
  }, Math.max(0, remaining) + 50)
}

function handleTick(): void {
  if (!running) return

  const result = tick(state, Date.now(), breakMs())
  if (!result.event) {
    scheduleTick()
    return
  }

  state = result.state
  persist()
  notifyEvent(result.event)
  scheduleTick()
  refreshMenus()
}

function startOrResume(): void {
  if (!running || !ctx) return

  const wasPaused = state.pausedRemainingMs !== null
  const previousPhase = state.phase
  state = startFocus(state, Date.now(), focusMs())
  persist()
  scheduleTick()
  ctx.logger.info('番茄钟开始', { phase: state.phase, resumed: wasPaused })

  if (wasPaused) {
    const remaining = remainingMs(state, Date.now())
    const minutes = remaining === null ? 0 : Math.max(1, Math.ceil(remaining / MINUTE))
    notify(`法厄同大人要继续专注，还剩 ${minutes} 分钟。`)
  } else if (previousPhase !== 'focus') {
    notify(`专注开始，${settings().focusMinutes} 分钟。法厄同大人，加油！`)
  }

  refreshMenus()
}

function pauseTimer(): void {
  if (!running || !ctx) return

  const before = state
  state = pause(state, Date.now())
  if (state === before) return

  persist()
  cancelTick()
  const remaining = remainingMs(state, Date.now())
  const minutes = remaining === null ? 0 : Math.max(1, Math.ceil(remaining / MINUTE))
  notify(`已暂停，还剩 ${minutes} 分钟。`)
  refreshMenus()
}

function resetTimer(): void {
  if (!running || !ctx) return

  const wasActive = state.phase !== 'idle'
  state = reset(state)
  persist()
  cancelTick()
  if (wasActive) notify('计时已重置。')
  refreshMenus()
}

function menuItems(): MenuItemConstructorOptions[] {
  if (!running || !ctx) return []

  const current = settings()
  const remaining = remainingMs(state, Date.now())
  const minutes = remaining === null ? 0 : Math.max(1, Math.ceil(remaining / MINUTE))
  const submenu: MenuItemConstructorOptions[] = []

  if (state.phase === 'idle') {
    submenu.push({
      label: `开始专注（${current.focusMinutes} 分钟）`,
      click: () => startOrResume(),
    })
  } else if (state.pausedRemainingMs !== null) {
    submenu.push({
      label: `继续专注（剩 ${minutes} 分钟）`,
      click: () => startOrResume(),
    })
    submenu.push({ label: '重置', click: () => resetTimer() })
  } else {
    submenu.push({
      label:
        state.phase === 'focus' ? `专注中 · 剩 ${minutes} 分钟` : `休息中 · 剩 ${minutes} 分钟`,
      enabled: false,
    })
    submenu.push({ label: '暂停', click: () => pauseTimer() })
    if (state.phase === 'break') {
      submenu.push({ label: '开始下一轮', click: () => startOrResume() })
    }
    submenu.push({ type: 'separator' }, { label: '重置', click: () => resetTimer() })
  }

  return [{ label: '番茄钟', submenu }]
}

function snapshot(): Record<string, unknown> {
  const current = settings()
  return {
    enabled: running,
    phase: state.phase,
    paused: state.pausedRemainingMs !== null,
    remainingMs: remainingMs(state, Date.now()),
    completedFocusCount: state.completedFocusCount,
    focusMinutes: current.focusMinutes,
    breakMinutes: current.breakMinutes,
  }
}

async function setup(context: ModuleContext): Promise<void> {
  ctx = context

  context.ipc.handle('pomodoro:get-state', z.object({}), () => snapshot())
  context.ipc.handle('pomodoro:start', z.object({}), () => {
    startOrResume()
    return snapshot()
  })
  context.ipc.handle('pomodoro:pause', z.object({}), () => {
    pauseTimer()
    return snapshot()
  })
  context.ipc.handle('pomodoro:reset', z.object({}), () => {
    resetTimer()
    return snapshot()
  })

  registerModuleMenus('pomodoro', { pet: menuItems, tray: menuItems })
}

async function startModule(): Promise<void> {
  if (running) return
  running = true

  state = normalizePomodoroState(ctx?.getState<PomodoroState>())
  const restored = restoreOnStartup(state, Date.now())
  state = restored.state

  if (restored.event) {
    persist()
    notifyEvent(restored.event)
  }

  scheduleTick()
  refreshMenus()

  // 开发期自动开始，便于验证完成/休息提示；每个进程只触发一次，打包版不生效
  if (!autostartAttempted && !app.isPackaged && process.env.VIVIAN_POMODORO_AUTOSTART === '1') {
    autostartAttempted = true
    startOrResume()
  }
}

async function stopModule(): Promise<void> {
  if (!running) return

  running = false
  cancelTick()
  // 用户主动禁用：重置计时；应用退出走 dispose，不经过这里，保留跨重启进度
  state = reset(state)
  persist()
  refreshMenus()
}

async function dispose(): Promise<void> {
  running = false
  cancelTick()
  unregisterModuleMenus('pomodoro')
  ctx = null
}

export const pomodoroModule: PetModule = {
  id: 'pomodoro',
  title: '番茄钟',
  description: '专注与休息的计时器；通过托盘或右键菜单操作',
  defaultEnabled: false,
  settingsSchema,
  setup,
  start: startModule,
  stop: stopModule,
  dispose,
}
