import type { DayPeriod, DialogueLine, DialogueTag } from './lines'
import type { DialogueContext } from './render'

export function periodForHour(hour: number): DayPeriod {
  if (hour >= 5 && hour < 11) return 'morning'
  if (hour >= 11 && hour < 17) return 'day'
  if (hour >= 17 && hour < 22) return 'evening'
  return 'night'
}

export interface SelectLineOptions {
  hour: number
  lastLineId?: string
  random?: () => number
  /** 普通选择默认排除问候；仅在特殊场景显式包含 */
  includeGreetings?: boolean
  /** 记忆上下文；缺省按「共处 1 天、0 次互动」处理，带最低条件的台词不会入选 */
  context?: DialogueContext
}

/** 条件全部满足才可入选；缺少上下文时按最初状态处理 */
export function matchesConditions(line: DialogueLine, context?: DialogueContext): boolean {
  if (!line.conditions) return true

  const days = Math.max(1, Math.floor(context?.daysTogether ?? 1))
  const interactions = Math.max(0, Math.floor(context?.interactions ?? 0))
  const { minDaysTogether, minInteractions, maxInteractions } = line.conditions

  if (minDaysTogether !== undefined && days < minDaysTogether) return false
  if (minInteractions !== undefined && interactions < minInteractions) return false
  if (maxInteractions !== undefined && interactions > maxInteractions) return false
  return true
}

function weightedPick(lines: DialogueLine[], random: () => number): DialogueLine {
  const totalWeight = lines.reduce((sum, line) => sum + Math.max(0.0001, line.weight ?? 1), 0)
  let threshold = random() * totalWeight

  for (const line of lines) {
    threshold -= Math.max(0.0001, line.weight ?? 1)
    if (threshold <= 0) return line
  }

  return lines[lines.length - 1] as DialogueLine
}

function pickFromPool(
  pool: DialogueLine[],
  lastLineId: string | undefined,
  random: () => number,
): DialogueLine | null {
  if (pool.length === 0) return null

  const withoutLast =
    pool.length > 1 && lastLineId ? pool.filter((line) => line.id !== lastLineId) : pool
  const candidates = withoutLast.length > 0 ? withoutLast : pool

  return weightedPick(candidates, random)
}

/** 优先取当前时段；该时段没有台词时退回全部候选 */
function filterByPeriod(lines: DialogueLine[], hour: number): DialogueLine[] {
  const period = periodForHour(hour)
  const periodLines = lines.filter(
    (line) => !line.timeRange || line.timeRange === 'any' || line.timeRange === period,
  )
  return periodLines.length > 0 ? periodLines : lines
}

/**
 * 从日常台词中按时段筛选，并避免连续重复。
 * 默认只取 daily 标签；问候只由 selectGreeting 在时段首次互动时选择。
 */
export function selectLine(lines: DialogueLine[], options: SelectLineOptions): DialogueLine | null {
  const eligible = lines.filter(
    (line) =>
      line.tags.includes('daily') ||
      (options.includeGreetings === true && line.tags.includes('greeting')),
  )
  const available = eligible.filter((line) => matchesConditions(line, options.context))

  return pickFromPool(
    filterByPeriod(available, options.hour),
    options.lastLineId,
    options.random ?? Math.random,
  )
}

/** 选择某个时段的问候句；没有问候时返回 null */
export function selectGreeting(
  lines: DialogueLine[],
  period: DayPeriod,
  lastLineId?: string,
  random: () => number = Math.random,
  context?: DialogueContext,
): DialogueLine | null {
  const candidates = lines.filter(
    (line) =>
      line.tags.includes('greeting') &&
      (line.timeRange === period || line.timeRange === 'any') &&
      matchesConditions(line, context),
  )

  return pickFromPool(candidates, lastLineId, random)
}

/** 按标签取台词（提醒、彩蛋等）；时段规则与普通台词一致 */
export function selectTaggedLine(
  lines: DialogueLine[],
  tag: DialogueTag,
  options: SelectLineOptions,
): DialogueLine | null {
  const candidates = lines.filter(
    (line) => line.tags.includes(tag) && matchesConditions(line, options.context),
  )

  return pickFromPool(
    filterByPeriod(candidates, options.hour),
    options.lastLineId,
    options.random ?? Math.random,
  )
}
