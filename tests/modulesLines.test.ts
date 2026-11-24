import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getModuleClickLine,
  registerModuleClickLine,
  unregisterModuleClickLine,
} from '../src/main/modules/lines'

afterEach(() => {
  unregisterModuleClickLine('a')
  unregisterModuleClickLine('b')
})

describe('模块点击台词', () => {
  it('按注册顺序返回第一条有效台词', () => {
    registerModuleClickLine('a', () => ({ text: '第一条', lineId: 'a-line' }))
    registerModuleClickLine('b', () => ({ text: '第二条' }))

    expect(getModuleClickLine()).toEqual({
      moduleId: 'a',
      text: '第一条',
      lineId: 'a-line',
    })
  })

  it('空文本视为未命中，继续询问下一个模块', () => {
    registerModuleClickLine('a', () => ({ text: '   ' }))
    registerModuleClickLine('b', () => ({ text: '第二条' }))

    expect(getModuleClickLine()?.text).toBe('第二条')
  })

  it('模块抛错时跳过，不影响其他模块', () => {
    const broken = vi.fn(() => {
      throw new Error('boom')
    })
    registerModuleClickLine('a', broken)
    registerModuleClickLine('b', () => ({ text: '仍然可用' }))

    expect(getModuleClickLine()?.text).toBe('仍然可用')
    expect(broken).toHaveBeenCalled()
  })

  it('取消注册后不再参与', () => {
    registerModuleClickLine('a', () => ({ text: '第一条' }))
    unregisterModuleClickLine('a')

    expect(getModuleClickLine()).toBeNull()
  })
})
