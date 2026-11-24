export interface ChimeState {
  /** 已报时的整点，格式 YYYY-MM-DD-HH */
  lastChimeKey: string | null
}

export function createChimeState(): ChimeState {
  return { lastChimeKey: null }
}

export function normalizeChimeState(value: unknown): ChimeState {
  if (!value || typeof value !== 'object') return createChimeState()

  const candidate = value as Partial<ChimeState>
  const lastChimeKey =
    typeof candidate.lastChimeKey === 'string' && candidate.lastChimeKey.length > 0
      ? candidate.lastChimeKey
      : null

  return { lastChimeKey }
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

export function chimeKey(timestamp: number): string {
  const date = new Date(timestamp)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}`
}

/** 只在整点后的第一分钟报时；错过不补 */
export function shouldChime(state: ChimeState, now: number): boolean {
  return new Date(now).getMinutes() === 0 && state.lastChimeKey !== chimeKey(now)
}

export function markChimed(_state: ChimeState, now: number): ChimeState {
  return { lastChimeKey: chimeKey(now) }
}

const CN_NUMBERS = [
  '零',
  '一',
  '两',
  '三',
  '四',
  '五',
  '六',
  '七',
  '八',
  '九',
  '十',
  '十一',
  '十二',
] as const

/** 文案短、分段；凌晨时段更轻 */
export function chimeText(hour: number): string {
  if (hour === 0) return '法厄同大人，零点了。'
  if (hour === 12) return '法厄同大人，中午十二点了。'
  if (hour < 5) return `法厄同大人，凌晨${CN_NUMBERS[hour]}点了。`
  if (hour < 8) return `法厄同大人，早上${CN_NUMBERS[hour]}点了。`
  if (hour < 12) return `法厄同大人，上午${CN_NUMBERS[hour]}点了。`
  if (hour < 18) return `法厄同大人，下午${CN_NUMBERS[hour - 12]}点了。`
  if (hour < 23) return `法厄同大人，晚上${CN_NUMBERS[hour - 12]}点了。`
  return '法厄同大人，晚上十一点了。'
}
