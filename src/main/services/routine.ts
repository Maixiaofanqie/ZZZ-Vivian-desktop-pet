import { localDayKey } from '../store/memory'

/** 连续活跃多久后提醒起身 */
export const IDLE_REMINDER_ACTIVE_MS = 60 * 60 * 1000
/** 空闲多久视为休息，并重置久坐计时 */
export const IDLE_BREAK_MS = 5 * 60 * 1000
/** 调度轮询间隔 */
export const ROUTINE_POLL_MS = 60 * 1000
/** 主动提醒之间的最小间隔 */
export const ROUTINE_GLOBAL_COOLDOWN_MS = 10 * 60 * 1000
/** 一晚最多催睡次数 */
export const SLEEP_REMINDER_MAX_PER_NIGHT = 2

export type RoutineAction = 'idle' | 'sleep'

export interface RoutineInput {
  now: number
  /** 系统空闲秒数；只读数值，不做键鼠监听 */
  idleSeconds: number
  idleEnabled: boolean
  sleepEnabled: boolean
  /** 宠物可见、未拖拽、无气泡时才允许弹提醒 */
  canShow: boolean
}

export interface RoutineState {
  continuousActiveSince: number | null
  nightKey: string
  sleepReminderCount: number
  lastReminderAt: number
}

export interface RoutineOptions {
  /** 开发期测试用：覆盖久坐阈值；打包版保持默认 */
  idleActiveMs?: number
}

export function createRoutineState(): RoutineState {
  return {
    continuousActiveSince: null,
    nightKey: '',
    sleepReminderCount: 0,
    lastReminderAt: 0,
  }
}

function minutesOfDay(timestamp: number): number {
  const date = new Date(timestamp)
  return date.getHours() * 60 + date.getMinutes()
}

/** 23:30–05:00 */
function inSleepWindow(timestamp: number): boolean {
  const minutes = minutesOfDay(timestamp)
  return minutes >= 23 * 60 + 30 || minutes < 5 * 60
}

/** 23:30–01:00 */
function inFirstSleepSlot(timestamp: number): boolean {
  const minutes = minutesOfDay(timestamp)
  return minutes >= 23 * 60 + 30 || minutes < 60
}

/** 02:00–05:00 */
function inSecondSleepSlot(timestamp: number): boolean {
  const minutes = minutesOfDay(timestamp)
  return minutes >= 2 * 60 && minutes < 5 * 60
}

/** 以夜晚窗口起点所在日期作为 key；05:00 前算前一天 */
function nightKeyFor(timestamp: number): string {
  const hour = new Date(timestamp).getHours()
  return hour < 5 ? localDayKey(timestamp - 24 * 60 * 60 * 1000) : localDayKey(timestamp)
}

/**
 * 作息提醒状态机。纯逻辑，不依赖 Electron，便于单元测试。
 * 只在 canShow 时消耗提醒次数，避免宠物隐藏或拖拽时白白触发。
 */
export class RoutineReminder {
  private state: RoutineState
  private idleActiveMs: number

  constructor(options: RoutineOptions = {}) {
    this.state = createRoutineState()
    this.idleActiveMs = options.idleActiveMs ?? IDLE_REMINDER_ACTIVE_MS
  }

  get lastReminderAt(): number {
    return this.state.lastReminderAt
  }

  evaluate(input: RoutineInput): RoutineAction | null {
    const active = input.idleSeconds * 1000 < IDLE_BREAK_MS

    if (!active) {
      this.state.continuousActiveSince = null
    } else if (this.state.continuousActiveSince === null) {
      this.state.continuousActiveSince = input.now
    }

    const key = nightKeyFor(input.now)
    if (key !== this.state.nightKey) {
      this.state.nightKey = key
      this.state.sleepReminderCount = 0
    }

    if (!input.canShow) return null
    if (input.now - this.state.lastReminderAt < ROUTINE_GLOBAL_COOLDOWN_MS) return null

    let action: RoutineAction | null = null

    if (
      input.idleEnabled &&
      active &&
      this.state.continuousActiveSince !== null &&
      input.now - this.state.continuousActiveSince >= this.idleActiveMs
    ) {
      action = 'idle'
    }

    if (!action && input.sleepEnabled && active && inSleepWindow(input.now)) {
      if (inFirstSleepSlot(input.now) && this.state.sleepReminderCount === 0) {
        action = 'sleep'
      } else if (
        inSecondSleepSlot(input.now) &&
        this.state.sleepReminderCount < SLEEP_REMINDER_MAX_PER_NIGHT
      ) {
        action = 'sleep'
      }
    }

    if (!action) return null

    this.state.lastReminderAt = input.now
    if (action === 'idle') {
      this.state.continuousActiveSince = input.now
    } else {
      this.state.sleepReminderCount += 1
    }

    return action
  }
}
