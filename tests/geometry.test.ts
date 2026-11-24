import { describe, expect, it } from 'vitest'
import {
  clampPositionToWorkArea,
  type HitMask,
  isPointInMask,
  landingY,
  normalizePoint,
} from '../src/main/services/geometry'

describe('工作区夹紧', () => {
  const workArea = { x: 0, y: 0, width: 1920, height: 1040 }
  const size = { width: 260, height: 360 }

  it('工作区内的位置保持不变', () => {
    expect(clampPositionToWorkArea({ x: 100, y: 200 }, size, workArea)).toEqual({
      x: 100,
      y: 200,
    })
  })

  it('左上越界时夹紧到工作区原点', () => {
    expect(clampPositionToWorkArea({ x: -50, y: -80 }, size, workArea)).toEqual({
      x: 0,
      y: 0,
    })
  })

  it('右下越界时夹紧到工作区右下边缘', () => {
    expect(clampPositionToWorkArea({ x: 2000, y: 1200 }, size, workArea)).toEqual({
      x: 1660,
      y: 680,
    })
  })

  it('工作区小于窗口时回到工作区原点', () => {
    expect(
      clampPositionToWorkArea({ x: 20, y: 20 }, size, {
        x: 0,
        y: 0,
        width: 200,
        height: 200,
      }),
    ).toEqual({ x: 0, y: 0 })
  })

  it('落地坐标位于工作区底部', () => {
    expect(landingY(workArea, 360)).toBe(680)
  })
})

describe('归一化坐标', () => {
  const bounds = { x: 100, y: 100, width: 260, height: 360 }

  it('窗口内坐标正确归一化', () => {
    expect(normalizePoint({ x: 230, y: 280 }, bounds)).toEqual({ nx: 0.5, ny: 0.5 })
  })

  it('窗口外坐标返回 null', () => {
    expect(normalizePoint({ x: 99, y: 200 }, bounds)).toBeNull()
    expect(normalizePoint({ x: 360, y: 200 }, bounds)).toBeNull()
  })
})

describe('逐像素命中', () => {
  const mask: HitMask = {
    width: 2,
    height: 2,
    data: Uint8Array.from([0, 255, 255, 0]),
  }

  it('命中不透明像素', () => {
    expect(isPointInMask(mask, 0.75, 0.25)).toBe(true)
    expect(isPointInMask(mask, 0.25, 0.75)).toBe(true)
  })

  it('不命中透明像素', () => {
    expect(isPointInMask(mask, 0.25, 0.25)).toBe(false)
    expect(isPointInMask(mask, 0.75, 0.75)).toBe(false)
  })

  it('归一化坐标越界时不命中', () => {
    expect(isPointInMask(mask, -0.01, 0.5)).toBe(false)
    expect(isPointInMask(mask, 0.5, 1)).toBe(false)
  })

  it('按阈值过滤半透明像素', () => {
    const softMask: HitMask = {
      width: 1,
      height: 1,
      data: Uint8Array.from([40]),
    }
    expect(isPointInMask(softMask, 0.5, 0.5)).toBe(false)
    expect(isPointInMask(softMask, 0.5, 0.5, 32)).toBe(true)
  })
})
