import { describe, expect, it } from 'vitest'
import {
  PROACTIVE_MAX_DELAY_MS,
  PROACTIVE_MIN_DELAY_MS,
  proactiveDelayMs,
} from '../src/main/dialogue/proactive'

describe('定时主动问候', () => {
  it('间隔落在 30–60 分钟之间', () => {
    expect(proactiveDelayMs(() => 0)).toBe(PROACTIVE_MIN_DELAY_MS)
    expect(proactiveDelayMs(() => 0.5)).toBe(
      Math.round((PROACTIVE_MIN_DELAY_MS + PROACTIVE_MAX_DELAY_MS) / 2),
    )
    expect(proactiveDelayMs(() => 1)).toBe(PROACTIVE_MAX_DELAY_MS)
  })

  it('随机值越界时夹紧', () => {
    expect(proactiveDelayMs(() => -1)).toBe(PROACTIVE_MIN_DELAY_MS)
    expect(proactiveDelayMs(() => 2)).toBe(PROACTIVE_MAX_DELAY_MS)
  })
})
