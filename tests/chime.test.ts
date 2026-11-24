import { describe, expect, it } from 'vitest'
import {
  chimeKey,
  chimeText,
  createChimeState,
  markChimed,
  normalizeChimeState,
  shouldChime,
} from '../src/main/modules/chime/state'
import { PERSONA } from '../src/shared/persona'

function at(hour: number, minute = 0): number {
  return new Date(2026, 9, 24, hour, minute).getTime()
}

describe('整点报时', () => {
  it('整点后第一分钟触发，同一小时只触发一次', () => {
    const state = createChimeState()
    expect(shouldChime(state, at(10, 0))).toBe(true)
    expect(shouldChime(state, at(10, 1))).toBe(false)

    const marked = markChimed(state, at(10, 0))
    expect(shouldChime(marked, at(10, 0))).toBe(false)
    expect(shouldChime(marked, at(11, 0))).toBe(true)
  })

  it('键包含本地日期与小时', () => {
    expect(chimeKey(at(9))).toBe('2026-10-24-09')
    expect(chimeKey(at(23))).toBe('2026-10-24-23')
  })

  it('文案带称呼且覆盖凌晨、早上、下午、晚上', () => {
    expect(chimeText(0)).toContain(PERSONA.address)
    expect(chimeText(2)).toContain('凌晨')
    expect(chimeText(7)).toContain('早上')
    expect(chimeText(12)).toContain('中午')
    expect(chimeText(15)).toContain('下午')
    expect(chimeText(20)).toContain('晚上')
    expect(chimeText(23)).toContain('十一点')
  })

  it('归一化非法状态', () => {
    expect(normalizeChimeState(null)).toEqual(createChimeState())
    expect(normalizeChimeState({ lastChimeKey: 123 })).toEqual(createChimeState())
    expect(normalizeChimeState({ lastChimeKey: '2026-10-24-10' })).toEqual({
      lastChimeKey: '2026-10-24-10',
    })
  })
})
