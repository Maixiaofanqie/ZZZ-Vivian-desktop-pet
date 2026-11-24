import type { ClaudeProjectSummary } from '../../../shared/ipc'
import {
  CLAUDE_CODE_MENTION_MAX_PER_HOUR,
  CLAUDE_CODE_MENTION_MAX_PER_MINUTE,
  CLAUDE_CODE_MENTION_PROBABILITY,
  type ClaudeCodeMentionFrequency,
} from '../../../shared/modules'

const MINUTE_MS = 60 * 1000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

/** 读取 modules.json 时容错：丢弃非法时间戳并按时间排序 */
export function normalizeMentionTimestamps(value: unknown): number[] {
  if (!Array.isArray(value)) return []

  return value
    .filter((item): item is number => typeof item === 'number' && Number.isFinite(item) && item > 0)
    .map((item) => Math.round(item))
    .sort((a, b) => a - b)
    .slice(-CLAUDE_CODE_MENTION_MAX_PER_HOUR)
}

/** 只保留最近一小时内、且不晚于 now 的记录，防止系统时间回拨绕过上限 */
export function pruneMentionTimestamps(timestamps: readonly number[], now: number): number[] {
  return timestamps
    .filter((timestamp) => timestamp <= now && now - timestamp < HOUR_MS)
    .sort((a, b) => a - b)
    .slice(-CLAUDE_CODE_MENTION_MAX_PER_HOUR)
}

export function canMention(timestamps: readonly number[], now: number): boolean {
  const recent = pruneMentionTimestamps(timestamps, now)
  if (recent.length >= CLAUDE_CODE_MENTION_MAX_PER_HOUR) return false

  const inLastMinute = recent.filter((timestamp) => now - timestamp < MINUTE_MS)
  return inLastMinute.length < CLAUDE_CODE_MENTION_MAX_PER_MINUTE
}

export interface MentionRoll {
  frequency: ClaudeCodeMentionFrequency
  timestamps: readonly number[]
  now: number
  random: number
}

export function shouldMention(input: MentionRoll): boolean {
  const probability = CLAUDE_CODE_MENTION_PROBABILITY[input.frequency] ?? 0
  if (probability <= 0 || input.random >= probability) return false

  return canMention(input.timestamps, input.now)
}

/** 记录一次提及；结果同时用于写回 modules.json */
export function mentionTimestampsAfter(timestamps: readonly number[], now: number): number[] {
  return [...pruneMentionTimestamps(timestamps, now), now].slice(-CLAUDE_CODE_MENTION_MAX_PER_HOUR)
}

export function relativeTimeText(now: number, timestamp: number): string {
  const diff = Math.max(0, now - timestamp)
  if (diff < MINUTE_MS) return '刚刚'
  if (diff < HOUR_MS) return `${Math.floor(diff / MINUTE_MS)} 分钟前`
  if (diff < DAY_MS) return `${Math.floor(diff / HOUR_MS)} 小时前`
  return `${Math.floor(diff / DAY_MS)} 天前`
}

const MENTION_TEMPLATES: Array<(name: string, time: string, count: number) => string> = [
  (name, time, count) => `法厄同大人，「${name}」${time}还有 ${count} 个会话呢。`,
  (name, time, count) => `${name} 那边${time}还有 ${count} 个会话。法厄同大人，别太累着自己了。`,
  (name, time, count) => `薇薇安看到「${name}」${time}有 ${count} 个会话……您记得喝水吗？`,
  (name, time, count) => `「${name}」${time}还有 ${count} 个会话。法厄同大人，忙完就休息一下吧。`,
]

/** 台词只使用项目名、相对时间与会话数，不涉及会话标题或对话内容 */
export function buildMentionText(
  project: ClaudeProjectSummary,
  now: number,
  random = Math.random(),
): string {
  const index = Math.min(
    MENTION_TEMPLATES.length - 1,
    Math.max(0, Math.floor(random * MENTION_TEMPLATES.length)),
  )
  const template = MENTION_TEMPLATES[index] ?? MENTION_TEMPLATES[0]
  return template(
    project.displayName,
    relativeTimeText(now, project.lastActiveAt),
    project.sessionCount,
  )
}
