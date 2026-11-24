import { describe, expect, it } from 'vitest'
import {
  createPomodoroState,
  normalizePomodoroState,
  pause,
  remainingMs,
  reset,
  restoreOnStartup,
  resume,
  startFocus,
  tick,
} from '../src/main/modules/pomodoro/state'

const MINUTE = 60 * 1000
const NOW = new Date(2026, 9, 24, 10, 0).getTime()

describe('番茄钟状态机', () => {
  it('初始为 idle', () => {
    expect(createPomodoroState()).toEqual({
      phase: 'idle',
      endAt: null,
      pausedRemainingMs: null,
      completedFocusCount: 0,
    })
  })

  it('开始专注后按分钟计算结束时间', () => {
    const state = startFocus(createPomodoroState(), NOW, 25 * MINUTE)
    expect(state.phase).toBe('focus')
    expect(state.endAt).toBe(NOW + 25 * MINUTE)
    expect(remainingMs(state, NOW)).toBe(25 * MINUTE)
  })

  it('暂停后保留剩余时间，继续后重新计时', () => {
    const running = startFocus(createPomodoroState(), NOW, 25 * MINUTE)
    const paused = pause(running, NOW + 10 * MINUTE)

    expect(paused.phase).toBe('focus')
    expect(paused.endAt).toBeNull()
    expect(paused.pausedRemainingMs).toBe(15 * MINUTE)

    const resumed = resume(paused, NOW + 30 * MINUTE)
    expect(resumed.endAt).toBe(NOW + 45 * MINUTE)
    expect(resumed.pausedRemainingMs).toBeNull()
  })

  it('暂停状态再次开始会继续剩余时间', () => {
    const running = startFocus(createPomodoroState(), NOW, 25 * MINUTE)
    const paused = pause(running, NOW + 5 * MINUTE)
    const restarted = startFocus(paused, NOW + 20 * MINUTE, 25 * MINUTE)

    expect(restarted.endAt).toBe(NOW + 40 * MINUTE)
    expect(restarted.phase).toBe('focus')
  })

  it('专注到点进入休息并累计完成次数', () => {
    const running = startFocus(createPomodoroState(), NOW, 25 * MINUTE)
    const result = tick(running, NOW + 25 * MINUTE, 5 * MINUTE)

    expect(result.event).toBe('focus-complete')
    expect(result.state.phase).toBe('break')
    expect(result.state.endAt).toBe(NOW + 30 * MINUTE)
    expect(result.state.completedFocusCount).toBe(1)
  })

  it('休息到点回到 idle', () => {
    const running = startFocus(createPomodoroState(), NOW, 25 * MINUTE)
    const afterFocus = tick(running, NOW + 25 * MINUTE, 5 * MINUTE).state
    const result = tick(afterFocus, NOW + 30 * MINUTE, 5 * MINUTE)

    expect(result.event).toBe('break-complete')
    expect(result.state.phase).toBe('idle')
    expect(result.state.endAt).toBeNull()
    expect(result.state.completedFocusCount).toBe(1)
  })

  it('未到点不触发', () => {
    const running = startFocus(createPomodoroState(), NOW, 25 * MINUTE)
    const result = tick(running, NOW + 10 * MINUTE, 5 * MINUTE)

    expect(result.event).toBeNull()
    expect(result.state).toBe(running)
  })

  it('重置回到 idle，保留完成次数', () => {
    const running = startFocus(createPomodoroState(), NOW, 25 * MINUTE)
    const afterFocus = tick(running, NOW + 25 * MINUTE, 5 * MINUTE).state
    const state = reset(afterFocus)

    expect(state.phase).toBe('idle')
    expect(state.completedFocusCount).toBe(1)
  })
})

describe('启动恢复', () => {
  it('未到点继续计时', () => {
    const running = startFocus(createPomodoroState(), NOW, 25 * MINUTE)
    const result = restoreOnStartup(running, NOW + 5 * MINUTE)

    expect(result.event).toBeNull()
    expect(result.state).toEqual(running)
  })

  it('专注已过点则回到 idle 并提示一次', () => {
    const running = startFocus(createPomodoroState(), NOW, 25 * MINUTE)
    const result = restoreOnStartup(running, NOW + 60 * MINUTE)

    expect(result.event).toBe('focus-overdue')
    expect(result.state.phase).toBe('idle')
    expect(result.state.endAt).toBeNull()
    expect(result.state.completedFocusCount).toBe(1)
  })

  it('休息已过点则回到 idle 并提示一次', () => {
    const running = startFocus(createPomodoroState(), NOW, 25 * MINUTE)
    const afterFocus = tick(running, NOW + 25 * MINUTE, 5 * MINUTE).state
    const result = restoreOnStartup(afterFocus, NOW + 40 * MINUTE)

    expect(result.event).toBe('break-overdue')
    expect(result.state.phase).toBe('idle')
  })
})

describe('状态归一化', () => {
  it('非法输入回退 idle', () => {
    expect(normalizePomodoroState(null)).toEqual(createPomodoroState())
    expect(normalizePomodoroState({ phase: 'focus' })).toEqual(createPomodoroState())
  })

  it('保留合法的运行与暂停状态', () => {
    expect(
      normalizePomodoroState({
        phase: 'focus',
        endAt: NOW + MINUTE,
        pausedRemainingMs: null,
        completedFocusCount: 2,
      }),
    ).toEqual({
      phase: 'focus',
      endAt: NOW + MINUTE,
      pausedRemainingMs: null,
      completedFocusCount: 2,
    })

    expect(
      normalizePomodoroState({
        phase: 'break',
        endAt: NOW + MINUTE,
        pausedRemainingMs: 30_000,
        completedFocusCount: 1,
      }),
    ).toEqual({
      phase: 'break',
      endAt: null,
      pausedRemainingMs: 30_000,
      completedFocusCount: 1,
    })
  })

  it('idle 状态清空计时字段', () => {
    expect(
      normalizePomodoroState({
        phase: 'idle',
        endAt: NOW,
        pausedRemainingMs: 1000,
        completedFocusCount: 3,
      }),
    ).toEqual({
      phase: 'idle',
      endAt: null,
      pausedRemainingMs: null,
      completedFocusCount: 3,
    })
  })
})
