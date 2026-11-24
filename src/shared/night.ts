export const NIGHT_START_HOUR = 23
export const NIGHT_END_HOUR = 8

/** 本地时间 23:00–08:00 */
export function isNightTime(timestamp: number): boolean {
  const hour = new Date(timestamp).getHours()
  return hour >= NIGHT_START_HOUR || hour < NIGHT_END_HOUR
}

/**
 * 夜间互动采用「总开关 + 子开关」：
 * 总开关关闭，或该子项关闭时，在 23:00–08:00 压制对应行为。
 */
export function isNightInteractionSuppressed(
  masterEnabled: boolean,
  childEnabled: boolean,
  timestamp: number,
): boolean {
  return isNightTime(timestamp) && (!masterEnabled || !childEnabled)
}
