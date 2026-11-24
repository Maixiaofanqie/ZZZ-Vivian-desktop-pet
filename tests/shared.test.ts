import { describe, expect, it } from 'vitest'
import { APP_ID, APP_NAME, CURRENT_PHASE } from '../src/shared/constants'

describe('共享常量', () => {
  it('应用名称为「薇薇安桌宠」', () => {
    expect(APP_NAME).toBe('薇薇安桌宠')
  })

  it('应用标识与 electron-builder 配置一致', () => {
    expect(APP_ID).toBe('com.vivian.desktop-pet')
  })

  it('当前阶段为 v1.0', () => {
    expect(CURRENT_PHASE).toBe('v1.0')
  })
})
