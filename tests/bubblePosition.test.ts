import { describe, expect, it } from 'vitest'
import { computeBubblePosition } from '../src/main/services/bubblePosition'

const workArea = { x: 0, y: 0, width: 1920, height: 1040 }
const bubbleSize = { width: 280, height: 120 }

describe('气泡定位', () => {
  it('空间足够时显示在宠物上方并水平居中', () => {
    const result = computeBubblePosition(
      { x: 900, y: 500, width: 260, height: 360 },
      bubbleSize,
      workArea,
    )
    expect(result.placement).toBe('above')
    expect(result.y).toBe(372)
    expect(result.x).toBe(890)
  })

  it('上方空间不足时翻到下方', () => {
    const result = computeBubblePosition(
      { x: 900, y: 20, width: 260, height: 360 },
      bubbleSize,
      workArea,
    )
    expect(result.placement).toBe('below')
    expect(result.y).toBe(388)
  })

  it('水平方向夹紧到工作区', () => {
    const left = computeBubblePosition(
      { x: 0, y: 500, width: 260, height: 360 },
      bubbleSize,
      workArea,
    )
    const right = computeBubblePosition(
      { x: 1800, y: 500, width: 260, height: 360 },
      bubbleSize,
      workArea,
    )
    expect(left.x).toBe(0)
    expect(right.x).toBe(1640)
  })

  it('下方空间不足时夹紧到底部', () => {
    const result = computeBubblePosition({ x: 900, y: 0, width: 260, height: 100 }, bubbleSize, {
      x: 0,
      y: 0,
      width: 1920,
      height: 200,
    })
    expect(result.placement).toBe('below')
    expect(result.y).toBe(80)
  })

  it('工作区小于气泡时回到工作区原点', () => {
    const result = computeBubblePosition({ x: 10, y: 10, width: 100, height: 100 }, bubbleSize, {
      x: 0,
      y: 0,
      width: 200,
      height: 100,
    })
    expect(result.x).toBe(0)
    expect(result.y).toBe(0)
  })

  it('上方气泡锚定形象可见顶部，忽略透明边距', () => {
    const result = computeBubblePosition(
      { x: 900, y: 500, width: 260, height: 360 },
      bubbleSize,
      workArea,
      8,
      { topRatio: 0.2, bottomRatio: 0.95 },
    )
    expect(result.placement).toBe('above')
    expect(result.y).toBe(500 + 72 - 120 - 8)
  })

  it('翻转下方时锚定形象可见底部', () => {
    const result = computeBubblePosition(
      { x: 900, y: 20, width: 260, height: 360 },
      bubbleSize,
      workArea,
      8,
      { topRatio: 0.2, bottomRatio: 0.95 },
    )
    expect(result.placement).toBe('below')
    expect(result.y).toBe(20 + 342 + 8)
  })

  it('异常比例回退到整窗范围', () => {
    const result = computeBubblePosition(
      { x: 900, y: 500, width: 260, height: 360 },
      bubbleSize,
      workArea,
      8,
      { topRatio: Number.NaN, bottomRatio: Number.POSITIVE_INFINITY },
    )
    expect(result.y).toBe(372)
  })
})
