export type PomodoroPhase = 'idle' | 'focus' | 'break'

export type PomodoroEvent = 'focus-complete' | 'break-complete' | 'focus-overdue' | 'break-overdue'

export interface PomodoroState {
  phase: PomodoroPhase
  /** 运行中：结束时间戳 */
  endAt: number | null
  /** 暂停中：剩余毫秒 */
  pausedRemainingMs: number | null
  completedFocusCount: number
}

export function createPomodoroState(): PomodoroState {
  return {
    phase: 'idle',
    endAt: null,
    pausedRemainingMs: null,
    completedFocusCount: 0,
  }
}

function finitePositive(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
}

function finiteNonNegative(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
}

/** 容错归一化：非法或自相矛盾的状态回退为 idle，不因坏数据崩溃 */
export function normalizePomodoroState(value: unknown): PomodoroState {
  if (!value || typeof value !== 'object') return createPomodoroState()

  const candidate = value as Partial<PomodoroState>
  const completedFocusCount = Math.max(0, Math.floor(Number(candidate.completedFocusCount) || 0))
  const phase: PomodoroPhase =
    candidate.phase === 'focus' || candidate.phase === 'break' ? candidate.phase : 'idle'
  const endAt = finitePositive(candidate.endAt)
  const pausedRemainingMs = finiteNonNegative(candidate.pausedRemainingMs)

  if (phase === 'idle') {
    return { phase, endAt: null, pausedRemainingMs: null, completedFocusCount }
  }

  if (pausedRemainingMs !== null) {
    return { phase, endAt: null, pausedRemainingMs, completedFocusCount }
  }

  if (endAt === null) {
    return { phase: 'idle', endAt: null, pausedRemainingMs: null, completedFocusCount }
  }

  return { phase, endAt, pausedRemainingMs: null, completedFocusCount }
}

/** 开始专注；若当前是暂停状态则按剩余时间继续 */
export function startFocus(state: PomodoroState, now: number, focusMs: number): PomodoroState {
  if (state.phase !== 'idle' && state.pausedRemainingMs !== null) {
    return { ...state, endAt: now + state.pausedRemainingMs, pausedRemainingMs: null }
  }

  return {
    phase: 'focus',
    endAt: now + focusMs,
    pausedRemainingMs: null,
    completedFocusCount: state.completedFocusCount,
  }
}

export function pause(state: PomodoroState, now: number): PomodoroState {
  if (state.phase === 'idle' || state.endAt === null) return state

  return {
    ...state,
    endAt: null,
    pausedRemainingMs: Math.max(0, state.endAt - now),
  }
}

export function resume(state: PomodoroState, now: number): PomodoroState {
  if (state.phase === 'idle' || state.pausedRemainingMs === null) return state

  return {
    ...state,
    endAt: now + state.pausedRemainingMs,
    pausedRemainingMs: null,
  }
}

export function reset(state: PomodoroState): PomodoroState {
  return {
    ...state,
    phase: 'idle',
    endAt: null,
    pausedRemainingMs: null,
  }
}

/** 运行中到点：专注结束进入休息，休息结束回到 idle */
export function tick(
  state: PomodoroState,
  now: number,
  breakMs: number,
): { state: PomodoroState; event: PomodoroEvent | null } {
  if (state.endAt === null || now < state.endAt) return { state, event: null }

  if (state.phase === 'focus') {
    return {
      state: {
        phase: 'break',
        endAt: now + breakMs,
        pausedRemainingMs: null,
        completedFocusCount: state.completedFocusCount + 1,
      },
      event: 'focus-complete',
    }
  }

  if (state.phase === 'break') {
    return {
      state: {
        ...state,
        phase: 'idle',
        endAt: null,
        pausedRemainingMs: null,
      },
      event: 'break-complete',
    }
  }

  return { state, event: null }
}

/**
 * 启动时恢复：未到点则继续计时；已到点则回到 idle 并补一次完成提示。
 * 不在启动时自动续上休息，避免关闭很久后一开机就进入休息倒计时。
 */
export function restoreOnStartup(
  state: PomodoroState,
  now: number,
): { state: PomodoroState; event: PomodoroEvent | null } {
  if (state.endAt === null || now < state.endAt) return { state, event: null }

  if (state.phase === 'focus') {
    return {
      state: { ...reset(state), completedFocusCount: state.completedFocusCount + 1 },
      event: 'focus-overdue',
    }
  }

  if (state.phase === 'break') {
    return { state: reset(state), event: 'break-overdue' }
  }

  return { state, event: null }
}

export function remainingMs(state: PomodoroState, now: number): number | null {
  if (state.phase === 'idle') return null
  if (state.pausedRemainingMs !== null) return state.pausedRemainingMs
  if (state.endAt === null) return null
  return Math.max(0, state.endAt - now)
}
