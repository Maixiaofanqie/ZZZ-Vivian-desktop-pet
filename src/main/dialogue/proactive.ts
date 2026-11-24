export const PROACTIVE_MIN_DELAY_MS = 30 * 60 * 1000
export const PROACTIVE_MAX_DELAY_MS = 60 * 60 * 1000

/** 30–60 分钟之间的随机间隔；random 返回 0..1 */
export function proactiveDelayMs(random: () => number = Math.random): number {
  const ratio = Math.min(1, Math.max(0, random()))
  return Math.round(
    PROACTIVE_MIN_DELAY_MS + (PROACTIVE_MAX_DELAY_MS - PROACTIVE_MIN_DELAY_MS) * ratio,
  )
}
