import { describe, expect, it } from 'vitest'
import {
  ACTIVE_DAYS_LIMIT,
  createMemoryRecord,
  createWorkMemory,
  evaluateMemory,
  localDayKey,
  type MemoryRecord,
  MILESTONES_LIMIT,
  markMilestonesSeen,
  normalizeMemory,
  recordWorkSnapshot,
} from '../src/main/store/memory'

const DAY_MS = 24 * 60 * 60 * 1000

function coWork(firstMetAt: number, interactionCount = 0) {
  return { firstMetAt, interactionCount, lastInteractionAt: null }
}

describe('活跃日', () => {
  it('按本地自然日生成键', () => {
    expect(localDayKey(new Date(2026, 9, 23, 0, 5).getTime())).toBe('2026-10-23')
    expect(localDayKey(new Date(2026, 0, 1, 23, 55).getTime())).toBe('2026-01-01')
  })

  it('评估时记录当天，且只在变化时返回新对象', () => {
    const now = new Date(2026, 9, 23, 12).getTime()
    const record = coWork(now)
    const first = evaluateMemory(record, createMemoryRecord(), now)

    expect(first.memory.activeDays).toEqual(['2026-10-23'])

    const second = evaluateMemory(record, first.memory, now)
    expect(second.memory).toBe(first.memory)
  })

  it('活跃日超过上限时丢弃最旧记录', () => {
    const now = new Date(2026, 9, 23, 12).getTime()
    const activeDays = Array.from({ length: ACTIVE_DAYS_LIMIT }, (_, index) =>
      localDayKey(now - (ACTIVE_DAYS_LIMIT - index) * DAY_MS),
    )
    const memory: MemoryRecord = { activeDays, milestones: [], work: createWorkMemory() }
    const next = evaluateMemory(coWork(now - ACTIVE_DAYS_LIMIT * DAY_MS), memory, now)

    expect(next.memory.activeDays).toHaveLength(ACTIVE_DAYS_LIMIT)
    expect(next.memory.activeDays.at(-1)).toBe('2026-10-23')
    expect(next.memory.activeDays).not.toContain(activeDays[0])
  })
})

describe('里程碑', () => {
  it('共处满 7 天时解锁，且只解锁一次', () => {
    const firstMet = new Date(2026, 9, 1, 10).getTime()
    const day7 = new Date(2026, 9, 7, 10).getTime()

    const first = evaluateMemory(coWork(firstMet), createMemoryRecord(), day7)
    expect(first.unlocked.map((item) => item.id)).toContain('days-7')

    const second = evaluateMemory(coWork(firstMet), first.memory, day7)
    expect(second.unlocked).toHaveLength(0)
  })

  it('未满 7 天不解锁', () => {
    const firstMet = new Date(2026, 9, 1, 10).getTime()
    const day6 = new Date(2026, 9, 6, 10).getTime()

    const result = evaluateMemory(coWork(firstMet), createMemoryRecord(), day6)
    expect(result.unlocked).toHaveLength(0)
  })

  it('互动次数达到阈值时解锁', () => {
    const now = new Date(2026, 9, 23, 12).getTime()
    const result = evaluateMemory(coWork(now, 100), createMemoryRecord(), now)

    expect(result.unlocked.map((item) => item.id)).toContain('interactions-100')
    expect(result.unlocked.map((item) => item.id)).not.toContain('interactions-1000')
  })

  it('纪念日按年触发，当年不会重复', () => {
    const firstMet = new Date(2025, 9, 23, 10).getTime()
    const anniversary = new Date(2026, 9, 23, 9).getTime()

    const first = evaluateMemory(coWork(firstMet), createMemoryRecord(), anniversary)
    expect(first.unlocked.map((item) => item.id)).toContain('anniversary-2026')

    const again = evaluateMemory(coWork(firstMet), first.memory, anniversary + 3600_000)
    expect(again.unlocked.map((item) => item.id)).not.toContain('anniversary-2026')
  })

  it('首次见面的当年不触发纪念日', () => {
    const firstMet = new Date(2026, 9, 23, 10).getTime()
    const sameDay = new Date(2026, 9, 23, 20).getTime()

    const result = evaluateMemory(coWork(firstMet), createMemoryRecord(), sameDay)
    expect(result.unlocked.some((item) => item.id.startsWith('anniversary-'))).toBe(false)
  })

  it('超过上限时丢弃最旧里程碑', () => {
    const now = new Date(2026, 9, 23, 12).getTime()
    const milestones = Array.from({ length: MILESTONES_LIMIT }, (_, index) => ({
      id: `old-${index}`,
      reachedAt: index + 1,
      seen: true,
    }))
    const result = evaluateMemory(
      coWork(now, 100),
      { activeDays: [], milestones, work: createWorkMemory() },
      now,
    )

    expect(result.memory.milestones).toHaveLength(MILESTONES_LIMIT)
    expect(result.memory.milestones[0]?.id).toBe('old-1')
    expect(result.memory.milestones.at(-1)?.id).toBe('interactions-100')
  })
})

describe('记忆归一化与展示状态', () => {
  it('丢弃非法条目、去重并排序', () => {
    const memory = normalizeMemory({
      activeDays: ['2026-10-23', 'bad', '2026-10-01', '2026-10-23'],
      milestones: [
        { id: 'b', reachedAt: 20, seen: false },
        { id: 'b', reachedAt: 30, seen: true },
        { id: 'a', reachedAt: 10, seen: true },
        { id: '', reachedAt: 5, seen: false },
      ],
    })

    expect(memory.activeDays).toEqual(['2026-10-01', '2026-10-23'])
    expect(memory.milestones.map((item) => item.id)).toEqual(['a', 'b'])
    expect(memory.milestones[1]?.reachedAt).toBe(20)
  })

  it('非对象输入返回空记忆', () => {
    expect(normalizeMemory(null)).toEqual(createMemoryRecord())
    expect(normalizeMemory('oops')).toEqual(createMemoryRecord())
  })

  it('标记展示后 seen 为 true，重复标记不改变对象', () => {
    const memory: MemoryRecord = {
      activeDays: [],
      milestones: [
        { id: 'days-7', reachedAt: 1, seen: false },
        { id: 'days-30', reachedAt: 2, seen: false },
      ],
      work: createWorkMemory(),
    }

    const marked = markMilestonesSeen(memory, ['days-7'])
    expect(marked.milestones[0]?.seen).toBe(true)
    expect(marked.milestones[1]?.seen).toBe(false)
    expect(markMilestonesSeen(marked, ['days-7'])).toBe(marked)
  })
})

describe('工作记录聚合', () => {
  function project(overrides: Record<string, unknown> = {}) {
    return {
      id: 'project-a',
      displayName: 'demo-project',
      lastActiveAt: 1000,
      sessionCount: 5,
      sessions: [],
      ...overrides,
    }
  }

  it('保存最近项目、时间与计数；字段不变时返回原对象', () => {
    const snapshot = {
      scannedAt: 5000,
      projects: [project(), project({ id: 'project-b', displayName: 'Other', lastActiveAt: 900 })],
    }
    const first = recordWorkSnapshot(createMemoryRecord(), snapshot)

    expect(first.work).toEqual({
      lastProjectName: 'demo-project',
      lastActiveAt: 1000,
      sessionCount: 5,
      projectCount: 2,
      updatedAt: 5000,
    })
    expect(recordWorkSnapshot(first, snapshot)).toBe(first)
  })

  it('没有项目时保持原记忆', () => {
    const memory = createMemoryRecord()
    expect(recordWorkSnapshot(memory, { scannedAt: 1, projects: [] })).toBe(memory)
  })

  it('归一化工作记录，丢弃非法字段', () => {
    const memory = normalizeMemory({
      work: {
        lastProjectName: '  demo-project  ',
        lastActiveAt: 'bad',
        sessionCount: -1,
        projectCount: 2.8,
        updatedAt: 10,
      },
    })

    expect(memory.work).toEqual({
      lastProjectName: 'demo-project',
      lastActiveAt: null,
      sessionCount: 0,
      projectCount: 2,
      updatedAt: 10,
    })
    expect(normalizeMemory({ work: { lastProjectName: '   ' } }).work).toEqual(createWorkMemory())
  })

  it('工作记忆不保存会话标题', () => {
    const snapshot = {
      scannedAt: 5000,
      projects: [
        project({
          sessions: [
            { id: 's1', displayName: '不该进入记忆的会话标题', nameSource: 'tab', lastActiveAt: 1 },
          ],
        }),
      ],
    }
    const memory = recordWorkSnapshot(createMemoryRecord(), snapshot)

    expect(JSON.stringify(memory)).not.toContain('不该进入记忆的会话标题')
  })
})
