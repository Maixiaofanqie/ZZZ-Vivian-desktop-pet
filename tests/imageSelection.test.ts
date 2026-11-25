import { describe, expect, it } from 'vitest'
import { DEFAULT_IMAGE_ID, DEFAULT_IMAGE_MODE, nextImageId } from '../src/shared/imageSelection'

describe('形象选择', () => {
  const ids = [
    'vivian_static_01',
    'vivian_static_02',
    'vivian_static_03',
    'vivian_static_04',
    'vivian_static_05',
    'vivian_static_06',
    'vivian_static_07',
  ]

  it('默认形象为第 7 张（wink）', () => {
    expect(DEFAULT_IMAGE_ID).toBe('vivian_static_07')
  })

  it('默认模式为双击切换', () => {
    expect(DEFAULT_IMAGE_MODE).toBe('cycle')
  })

  it('循环到下一张', () => {
    expect(nextImageId(ids, 'vivian_static_01')).toBe('vivian_static_02')
    expect(nextImageId(ids, 'vivian_static_02')).toBe('vivian_static_03')
  })

  it('最后一张回到第一张', () => {
    expect(nextImageId(ids, 'vivian_static_07')).toBe('vivian_static_01')
  })

  it('当前 id 不存在时回到第一张', () => {
    expect(nextImageId(ids, 'unknown')).toBe('vivian_static_01')
  })

  it('空列表保持当前值', () => {
    expect(nextImageId([], 'current')).toBe('current')
  })
})
