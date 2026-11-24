import { describe, expect, it } from 'vitest'
import type { DialogueLine } from '../src/main/dialogue/lines'
import { DIALOGUE_LINES } from '../src/main/dialogue/lines'
import { renderDialogueText } from '../src/main/dialogue/render'
import {
  periodForHour,
  selectGreeting,
  selectLine,
  selectTaggedLine,
} from '../src/main/dialogue/selectLine'
import { PERSONA } from '../src/shared/persona'

const customLines: DialogueLine[] = [
  { id: 'morning', text: '早安。', timeRange: 'morning', tags: ['daily'] },
  { id: 'night', text: '晚安。', timeRange: 'night', tags: ['daily'] },
  { id: 'any', text: '你好。', timeRange: 'any', tags: ['daily'] },
  { id: 'greeting-morning', text: '早安问候。', timeRange: 'morning', tags: ['greeting'] },
]

const templateContext = { daysTogether: 1, interactions: 0 }

describe('时段划分', () => {
  it('按小时返回正确时段', () => {
    expect(periodForHour(5)).toBe('morning')
    expect(periodForHour(10)).toBe('morning')
    expect(periodForHour(11)).toBe('day')
    expect(periodForHour(16)).toBe('day')
    expect(periodForHour(17)).toBe('evening')
    expect(periodForHour(21)).toBe('evening')
    expect(periodForHour(22)).toBe('night')
    expect(periodForHour(4)).toBe('night')
  })
})

describe('台词选择', () => {
  it('只选择当前时段与通用台词，并排除问候', () => {
    const line = selectLine(customLines, { hour: 8, random: () => 0 })
    expect(['morning', 'any']).toContain(line?.id)
    expect(line?.id).not.toBe('night')
    expect(line?.id).not.toBe('greeting-morning')
  })

  it('显式包含问候时可以选中问候', () => {
    const line = selectLine(
      [{ id: 'greeting-only', text: '早。', timeRange: 'morning', tags: ['greeting'] }],
      { hour: 8, includeGreetings: true, random: () => 0 },
    )
    expect(line?.id).toBe('greeting-only')
  })

  it('普通选择在只有问候时返回 null', () => {
    expect(
      selectLine(
        [{ id: 'greeting-only', text: '早。', timeRange: 'morning', tags: ['greeting'] }],
        {
          hour: 8,
          random: () => 0,
        },
      ),
    ).toBeNull()
  })

  it('按时段选择问候，没有对应问候时返回 null', () => {
    expect(selectGreeting(customLines, 'morning', undefined, () => 0)?.id).toBe('greeting-morning')
    expect(selectGreeting(customLines, 'night', undefined, () => 0)).toBeNull()
  })

  it('避免连续重复同一句', () => {
    const line = selectLine(customLines, {
      hour: 8,
      lastLineId: 'morning',
      random: () => 0,
    })
    expect(line?.id).toBe('any')
  })

  it('自定义权重生效', () => {
    const weighted: DialogueLine[] = [
      { id: 'low', text: '低权重', timeRange: 'any', tags: ['daily'], weight: 1 },
      { id: 'high', text: '高权重', timeRange: 'any', tags: ['daily'], weight: 3 },
    ]

    expect(selectLine(weighted, { hour: 12, random: () => 0.1 })?.id).toBe('low')
    expect(selectLine(weighted, { hour: 12, random: () => 0.9 })?.id).toBe('high')
  })

  it('空台词库返回 null', () => {
    expect(selectLine([], { hour: 12 })).toBeNull()
  })
})

describe('台词标签与条件', () => {
  const tagged: DialogueLine[] = [
    { id: 'daily', text: '日常', tags: ['daily'] },
    { id: 'reminder', text: '提醒', tags: ['reminder'] },
    { id: 'egg', text: '彩蛋', tags: ['easter-egg'] },
  ]

  it('普通选择只取 daily，不混入提醒与彩蛋', () => {
    expect(selectLine(tagged, { hour: 12, random: () => 0 })?.id).toBe('daily')
  })

  it('按标签选择提醒台词', () => {
    expect(selectTaggedLine(tagged, 'reminder', { hour: 12, random: () => 0 })?.id).toBe('reminder')
  })

  it('最低共处天数未满足时不入选', () => {
    const lines: DialogueLine[] = [
      { id: 'week', text: '一周了。', tags: ['daily'], conditions: { minDaysTogether: 7 } },
    ]

    expect(
      selectLine(lines, {
        hour: 12,
        random: () => 0,
        context: { daysTogether: 6, interactions: 0 },
      }),
    ).toBeNull()
    expect(
      selectLine(lines, {
        hour: 12,
        random: () => 0,
        context: { daysTogether: 7, interactions: 0 },
      })?.id,
    ).toBe('week')
  })

  it('互动次数上下限生效', () => {
    const lines: DialogueLine[] = [
      { id: 'early', text: '刚认识。', tags: ['daily'], conditions: { maxInteractions: 20 } },
      { id: 'late', text: '很久了。', tags: ['daily'], conditions: { minInteractions: 50 } },
    ]

    const early = selectLine(lines, {
      hour: 12,
      random: () => 0,
      context: { daysTogether: 1, interactions: 20 },
    })
    expect(early?.id).toBe('early')

    const late = selectLine(lines, {
      hour: 12,
      random: () => 0,
      context: { daysTogether: 10, interactions: 50 },
    })
    expect(late?.id).toBe('late')
  })

  it('缺少上下文时按最初状态处理', () => {
    const lines: DialogueLine[] = [
      { id: 'late', text: '很久了。', tags: ['daily'], conditions: { minInteractions: 50 } },
    ]

    expect(selectLine(lines, { hour: 12, random: () => 0 })).toBeNull()
  })
})

describe('台词模板渲染', () => {
  it('替换天数、互动次数与称呼', () => {
    expect(
      renderDialogueText('第 {days} 天，第 {interactions} 次。{address}', {
        daysTogether: 12.9,
        interactions: 34.2,
      }),
    ).toBe('第 12 天，第 34 次。法厄同大人')
  })

  it('缺省称呼使用人设中的固定称呼', () => {
    expect(renderDialogueText('{address}', templateContext)).toBe(PERSONA.address)
  })

  it('未知占位符原样保留', () => {
    expect(renderDialogueText('{unknown}', templateContext)).toBe('{unknown}')
  })
})

describe('台词库约束', () => {
  it('数量在 30–80 句之间、id 唯一且每句都有标签', () => {
    expect(DIALOGUE_LINES.length).toBeGreaterThanOrEqual(30)
    expect(DIALOGUE_LINES.length).toBeLessThanOrEqual(80)
    expect(new Set(DIALOGUE_LINES.map((line) => line.id)).size).toBe(DIALOGUE_LINES.length)
    expect(DIALOGUE_LINES.every((line) => line.tags.length > 0)).toBe(true)
  })

  it('每个时段都有问候句', () => {
    const periods = ['morning', 'day', 'evening', 'night'] as const
    for (const period of periods) {
      expect(
        DIALOGUE_LINES.some((line) => line.tags.includes('greeting') && line.timeRange === period),
        `${period} 缺少问候句`,
      ).toBe(true)
    }
  })

  it('每个时段至少 8 句日常台词，避免重复感', () => {
    const periods = ['morning', 'day', 'evening', 'night'] as const
    for (const period of periods) {
      const count = DIALOGUE_LINES.filter(
        (line) => line.tags.includes('daily') && line.timeRange === period,
      ).length
      expect(count, `${period} 日常台词不足`).toBeGreaterThanOrEqual(8)
    }
  })

  it('人设包含可执行的说话方式，且不出现禁用口癖', () => {
    expect(PERSONA.speechPatterns.length).toBeGreaterThanOrEqual(4)

    for (const pattern of PERSONA.speechPatterns) {
      const text = pattern.toLowerCase()
      for (const forbidden of PERSONA.forbiddenPatterns) {
        expect(text.includes(forbidden.toLowerCase())).toBe(false)
      }
    }
  })

  it('大部分日常台词使用「法厄同大人」称呼', () => {
    const daily = DIALOGUE_LINES.filter((line) => line.tags.includes('daily'))
    const withAddress = daily.filter((line) => line.text.includes(PERSONA.address)).length

    expect(withAddress / daily.length).toBeGreaterThanOrEqual(0.75)
  })

  it('所有问候句都带「法厄同大人」称呼', () => {
    const greetings = DIALOGUE_LINES.filter((line) => line.tags.includes('greeting'))

    expect(greetings.length).toBeGreaterThan(0)
    expect(greetings.every((line) => line.text.includes(PERSONA.address))).toBe(true)
  })

  it('大部分带自称的日常台词使用「薇薇安」，并保留少量「我」', () => {
    const daily = DIALOGUE_LINES.filter((line) => line.tags.includes('daily'))
    const named = daily.filter((line) => line.text.includes('薇薇安')).length
    const firstPerson = daily.filter((line) => /我(?!们)/.test(line.text)).length

    expect(named).toBeGreaterThanOrEqual(35)
    expect(firstPerson).toBeGreaterThanOrEqual(3)
  })

  it('所有台词都能完整渲染，不留占位符', () => {
    for (const line of DIALOGUE_LINES) {
      const text = renderDialogueText(line.text, { daysTogether: 100, interactions: 1000 })
      expect(text, line.id).not.toContain('{')
      expect(text.length, line.id).toBeGreaterThan(0)
    }
  })

  it('台词中不出现禁用口癖', () => {
    for (const line of DIALOGUE_LINES) {
      const text = line.text.toLowerCase()
      for (const pattern of PERSONA.forbiddenPatterns) {
        expect(text.includes(pattern.toLowerCase()), `${line.id} 含禁用表达「${pattern}」`).toBe(
          false,
        )
      }
    }
  })
})
