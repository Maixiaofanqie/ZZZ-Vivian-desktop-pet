import { describe, expect, it } from 'vitest'
import { REMINDER_LINES } from '../src/main/dialogue/reminders'
import { RoutineReminder } from '../src/main/services/routine'
import { PERSONA } from '../src/shared/persona'

const MINUTE = 60 * 1000

function at(day: number, hour: number, minute = 0): number {
  return new Date(2026, 9, day, hour, minute).getTime()
}

function input(now: number, overrides: Partial<Parameters<RoutineReminder['evaluate']>[0]> = {}) {
  return {
    now,
    idleSeconds: 10,
    idleEnabled: true,
    sleepEnabled: true,
    canShow: true,
    ...overrides,
  }
}

describe('久坐提醒', () => {
  it('连续活跃满 60 分钟时提醒一次', () => {
    const routine = new RoutineReminder()
    const start = at(23, 9)

    expect(routine.evaluate(input(start))).toBeNull()
    expect(routine.evaluate(input(start + 59 * MINUTE))).toBeNull()
    expect(routine.evaluate(input(start + 60 * MINUTE))).toBe('idle')
  })

  it('休息满 5 分钟会重置计时', () => {
    const routine = new RoutineReminder()
    const start = at(23, 9)

    routine.evaluate(input(start))
    expect(routine.evaluate(input(start + 30 * MINUTE, { idleSeconds: 300 }))).toBeNull()
    expect(routine.evaluate(input(start + 60 * MINUTE))).toBeNull()
    expect(routine.evaluate(input(start + 120 * MINUTE))).toBe('idle')
  })

  it('不可展示时不消耗提醒，等窗口就绪后再触发', () => {
    const routine = new RoutineReminder()
    const start = at(23, 9)

    routine.evaluate(input(start))
    expect(routine.evaluate(input(start + 60 * MINUTE, { canShow: false }))).toBeNull()
    expect(routine.evaluate(input(start + 61 * MINUTE))).toBe('idle')
  })

  it('关闭开关后不再提醒', () => {
    const routine = new RoutineReminder()
    const start = at(23, 9)

    routine.evaluate(input(start, { idleEnabled: false }))
    expect(routine.evaluate(input(start + 120 * MINUTE, { idleEnabled: false }))).toBeNull()
  })
})

describe('深夜催睡', () => {
  it('23:30–01:00 触发第一次，02:00 后触发第二次，一晚最多两次', () => {
    const routine = new RoutineReminder()
    const base = at(23, 23, 45)

    expect(routine.evaluate(input(base, { idleEnabled: false }))).toBe('sleep')
    expect(routine.evaluate(input(base + 5 * MINUTE, { idleEnabled: false }))).toBeNull()

    const afterMidnight = at(24, 0, 10)
    expect(routine.evaluate(input(afterMidnight, { idleEnabled: false }))).toBeNull()

    expect(routine.evaluate(input(at(24, 2, 5), { idleEnabled: false }))).toBe('sleep')
    expect(routine.evaluate(input(at(24, 3, 0), { idleEnabled: false }))).toBeNull()
  })

  it('用户空闲时不催睡', () => {
    const routine = new RoutineReminder()

    expect(
      routine.evaluate(input(at(23, 23, 45), { idleSeconds: 600, idleEnabled: false })),
    ).toBeNull()
  })

  it('关闭开关后不催睡', () => {
    const routine = new RoutineReminder()

    expect(routine.evaluate(input(at(23, 23, 45), { sleepEnabled: false }))).toBeNull()
  })

  it('第二天夜晚重新计数', () => {
    const routine = new RoutineReminder()

    expect(routine.evaluate(input(at(23, 23, 45), { idleEnabled: false }))).toBe('sleep')
    expect(routine.evaluate(input(at(24, 2, 5), { idleEnabled: false }))).toBe('sleep')
    expect(routine.evaluate(input(at(24, 23, 45), { idleEnabled: false }))).toBe('sleep')
  })
})

describe('提醒台词库', () => {
  it('久坐与催睡都有对应台词，且不属于日常池', () => {
    expect(REMINDER_LINES.some((line) => line.tags.includes('idle'))).toBe(true)
    expect(REMINDER_LINES.some((line) => line.tags.includes('sleep'))).toBe(true)
    expect(REMINDER_LINES.every((line) => line.tags.includes('reminder'))).toBe(true)
    expect(REMINDER_LINES.every((line) => !line.tags.includes('daily'))).toBe(true)
  })

  it('提醒台词都带「法厄同大人」称呼', () => {
    expect(REMINDER_LINES.every((line) => line.text.includes(PERSONA.address))).toBe(true)
  })

  it('提醒台词不含禁用口癖', () => {
    for (const line of REMINDER_LINES) {
      for (const pattern of PERSONA.forbiddenPatterns) {
        expect(line.text.toLowerCase().includes(pattern.toLowerCase())).toBe(false)
      }
    }
  })
})
