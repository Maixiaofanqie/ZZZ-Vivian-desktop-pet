import { describe, expect, it } from 'vitest'
import {
  createCoWorkRecord,
  daysTogether,
  isValidCoWork,
  recordInteraction,
  resetCoWork,
} from '../src/shared/coWork'

describe('共处记录', () => {
  it('首次创建时计数为 0', () => {
    const record = createCoWorkRecord(1000)
    expect(record).toEqual({
      firstMetAt: 1000,
      interactionCount: 0,
      lastInteractionAt: null,
    })
  })

  it('记录互动会累加计数并更新最近互动时间', () => {
    const record = recordInteraction(createCoWorkRecord(1000), 2000)
    expect(record.firstMetAt).toBe(1000)
    expect(record.interactionCount).toBe(1)
    expect(record.lastInteractionAt).toBe(2000)

    const next = recordInteraction(record, 3000)
    expect(next.interactionCount).toBe(2)
    expect(next.lastInteractionAt).toBe(3000)
  })

  it('首次见面时间无效时以当前时间补齐', () => {
    const record = recordInteraction(
      { firstMetAt: 0, interactionCount: 0, lastInteractionAt: null },
      5000,
    )
    expect(record.firstMetAt).toBe(5000)
  })

  it('重置后回到初始状态', () => {
    expect(resetCoWork(9000)).toEqual({
      firstMetAt: 9000,
      interactionCount: 0,
      lastInteractionAt: null,
    })
  })

  it('同一天算第 1 天，跨天递增', () => {
    const first = new Date(2026, 9, 22, 8, 0, 0).getTime()
    const sameDay = new Date(2026, 9, 22, 23, 0, 0).getTime()
    const nextDay = new Date(2026, 9, 23, 0, 30, 0).getTime()

    const record = createCoWorkRecord(first)
    expect(daysTogether(record, sameDay)).toBe(1)
    expect(daysTogether(record, nextDay)).toBe(2)
  })

  it('校验共处记录结构', () => {
    expect(isValidCoWork({ firstMetAt: 1, interactionCount: 0, lastInteractionAt: null })).toBe(
      true,
    )
    expect(isValidCoWork({ firstMetAt: 1, interactionCount: 3, lastInteractionAt: 2 })).toBe(true)
    expect(isValidCoWork({ firstMetAt: 0, interactionCount: 0, lastInteractionAt: null })).toBe(
      false,
    )
    expect(isValidCoWork({ firstMetAt: 1, interactionCount: -1, lastInteractionAt: null })).toBe(
      false,
    )
    expect(
      isValidCoWork({ firstMetAt: Number.NaN, interactionCount: 0, lastInteractionAt: null }),
    ).toBe(false)
  })
})
