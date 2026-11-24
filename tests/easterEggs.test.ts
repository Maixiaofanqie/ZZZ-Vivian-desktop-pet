import { describe, expect, it } from 'vitest'
import { EASTER_EGG_LINES, selectEasterEggLine } from '../src/main/dialogue/easterEggs'
import { PERSONA } from '../src/shared/persona'

describe('彩蛋选择', () => {
  it('纪念日按年份前缀匹配', () => {
    const line = selectEasterEggLine('anniversary-2027', () => 0)
    expect(line?.milestone).toBe('anniversary')
  })

  it('第 100 次互动匹配对应彩蛋', () => {
    expect(selectEasterEggLine('interactions-100', () => 0)?.milestone).toBe('interactions-100')
  })

  it('没有对应彩蛋的里程碑返回 null', () => {
    expect(selectEasterEggLine('days-7')).toBeNull()
    expect(selectEasterEggLine('interactions-1000')).toBeNull()
  })

  it('同一彩蛋多条台词时按随机值选择且不越界', () => {
    const first = selectEasterEggLine('anniversary-2027', () => 0)
    const last = selectEasterEggLine('anniversary-2027', () => 1)
    expect(first).not.toBeNull()
    expect(last).not.toBeNull()
  })
})

describe('彩蛋台词库', () => {
  it('全部带 easter-egg 标签且 id 唯一', () => {
    expect(EASTER_EGG_LINES.every((line) => line.tags.includes('easter-egg'))).toBe(true)
    expect(new Set(EASTER_EGG_LINES.map((line) => line.id)).size).toBe(EASTER_EGG_LINES.length)
  })

  it('彩蛋台词都带「法厄同大人」称呼', () => {
    expect(EASTER_EGG_LINES.every((line) => line.text.includes(PERSONA.address))).toBe(true)
  })

  it('不含禁用口癖', () => {
    for (const line of EASTER_EGG_LINES) {
      for (const pattern of PERSONA.forbiddenPatterns) {
        expect(line.text.toLowerCase().includes(pattern.toLowerCase())).toBe(false)
      }
    }
  })
})
