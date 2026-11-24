import { describe, expect, it } from 'vitest'
import {
  buildMentionText,
  canMention,
  mentionTimestampsAfter,
  normalizeMentionTimestamps,
  pruneMentionTimestamps,
  relativeTimeText,
  shouldMention,
} from '../src/main/modules/claudeCode/mentions'

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const NOW = Date.UTC(2026, 9, 24, 12, 0, 0)

describe('主动台词频率与冷却', () => {
  it('没有记录时可以提及', () => {
    expect(canMention([], NOW)).toBe(true)
  })

  it('每分钟最多 1 次', () => {
    expect(canMention([NOW - 30_000], NOW)).toBe(false)
    expect(canMention([NOW - MINUTE - 1], NOW)).toBe(true)
  })

  it('每小时最多 3 次', () => {
    expect(canMention([NOW - 10 * MINUTE, NOW - 20 * MINUTE, NOW - 30 * MINUTE], NOW)).toBe(false)
    expect(canMention([NOW - 10 * MINUTE, NOW - 20 * MINUTE, NOW - HOUR - 1], NOW)).toBe(true)
  })

  it('忽略未来时间与超过一小时的旧记录', () => {
    expect(pruneMentionTimestamps([NOW + 1000, NOW - HOUR - 1, NOW - MINUTE], NOW)).toEqual([
      NOW - MINUTE,
    ])
  })

  it('未越界时按概率决定，关闭档永不触发', () => {
    expect(shouldMention({ frequency: 'off', timestamps: [], now: NOW, random: 0 })).toBe(false)
    expect(shouldMention({ frequency: 'low', timestamps: [], now: NOW, random: 0.09 })).toBe(true)
    expect(shouldMention({ frequency: 'low', timestamps: [], now: NOW, random: 0.1 })).toBe(false)
    expect(shouldMention({ frequency: 'medium', timestamps: [], now: NOW, random: 0.24 })).toBe(
      true,
    )
    expect(shouldMention({ frequency: 'high', timestamps: [], now: NOW, random: 0.39 })).toBe(true)
    expect(
      shouldMention({
        frequency: 'high',
        timestamps: [NOW - 10 * MINUTE, NOW - 20 * MINUTE, NOW - 30 * MINUTE],
        now: NOW,
        random: 0,
      }),
    ).toBe(false)
  })

  it('记录提及后保留最近一小时，最多 3 条', () => {
    expect(mentionTimestampsAfter([], NOW)).toEqual([NOW])
    expect(mentionTimestampsAfter([NOW - HOUR - 1, NOW - MINUTE], NOW)).toEqual([NOW - MINUTE, NOW])
    expect(
      mentionTimestampsAfter([NOW - 30 * MINUTE, NOW - 20 * MINUTE, NOW - 10 * MINUTE], NOW),
    ).toEqual([NOW - 20 * MINUTE, NOW - 10 * MINUTE, NOW])
  })

  it('归一化非法记录并排序', () => {
    expect(normalizeMentionTimestamps('oops')).toEqual([])
    expect(normalizeMentionTimestamps([20, 'x', 10, -1, Number.NaN, 20])).toEqual([10, 20, 20])
  })
})

describe('主动台词文本', () => {
  const project = {
    id: 'project',
    displayName: 'demo-project',
    lastActiveAt: NOW - 2 * HOUR,
    sessionCount: 5,
    sessions: [
      { id: 'secret', displayName: '不该出现的会话标题', nameSource: 'tab', lastActiveAt: NOW },
    ],
  }

  it('相对时间文本', () => {
    expect(relativeTimeText(NOW, NOW)).toBe('刚刚')
    expect(relativeTimeText(NOW, NOW - 5 * MINUTE)).toBe('5 分钟前')
    expect(relativeTimeText(NOW, NOW - 3 * HOUR)).toBe('3 小时前')
    expect(relativeTimeText(NOW, NOW - 2 * 24 * HOUR)).toBe('2 天前')
  })

  it('只说项目名、时间与会话数', () => {
    const text = buildMentionText(project, NOW, 0)

    expect(text).toContain('demo-project')
    expect(text).toContain('2 小时前')
    expect(text).toContain('5 个会话')
    expect(text).toContain('法厄同大人')
    expect(text).not.toContain('不该出现的会话标题')
  })
})
