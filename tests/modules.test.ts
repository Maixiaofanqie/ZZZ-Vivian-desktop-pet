import { describe, expect, it, vi } from 'vitest'
import { ModuleRegistry, sortModules } from '../src/main/modules/registry'
import type { ModuleContext, PetModule } from '../src/main/modules/types'
import { createEmptyModulesFile, normalizeModulesFile } from '../src/main/store/modulesFile'
import { DEFAULT_MODULE_SETTINGS, normalizeModuleSettings } from '../src/shared/modules'
import { isNightInteractionSuppressed, isNightTime } from '../src/shared/night'
import { normalizeSettings } from '../src/shared/settingsDefaults'

function fakeContext(id: string): ModuleContext {
  return {
    id,
    getSettings: () => ({ enabled: true }),
    getState: () => null,
    setState: vi.fn(),
    scheduler: {
      setTimeout: vi.fn(),
      setInterval: vi.fn(),
      clearTimeout: vi.fn(),
      clearInterval: vi.fn(),
      clearAll: vi.fn(),
    },
    ipc: { handle: vi.fn(), dispose: vi.fn() },
    notify: vi.fn(() => true),
    isNightSuppressed: vi.fn(() => false),
    isAmbientQuiet: vi.fn(() => false),
    refreshMenus: vi.fn(),
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  } as unknown as ModuleContext
}

function fakeModule(id: string, deps?: string[]): PetModule & { calls: string[] } {
  const calls: string[] = []
  return {
    id,
    title: id,
    description: id,
    deps,
    defaultEnabled: true,
    calls,
    async setup() {
      calls.push('setup')
    },
    async start() {
      calls.push('start')
    },
    async stop() {
      calls.push('stop')
    },
    async dispose() {
      calls.push('dispose')
    },
  }
}

describe('模块拓扑排序', () => {
  it('依赖先于被依赖者', () => {
    const a = fakeModule('a')
    const b = fakeModule('b', ['a'])
    const c = fakeModule('c', ['b'])

    expect(sortModules([c, b, a]).map((module) => module.id)).toEqual(['a', 'b', 'c'])
  })

  it('重复 id 报错', () => {
    expect(() => sortModules([fakeModule('a'), fakeModule('a')])).toThrow('重复的模块 id')
  })

  it('缺少依赖报错', () => {
    expect(() => sortModules([fakeModule('a', ['missing'])])).toThrow('缺少依赖')
  })

  it('循环依赖报错', () => {
    expect(() => sortModules([fakeModule('a', ['b']), fakeModule('b', ['a'])])).toThrow('循环依赖')
  })
})

describe('模块生命周期', () => {
  it('setup 全部模块，只 start 已启用的模块', async () => {
    const a = fakeModule('a')
    const b = fakeModule('b')
    const enabled = new Map([
      ['a', true],
      ['b', false],
    ])
    const contexts = new Map<string, ModuleContext>()
    const registry = new ModuleRegistry({
      modules: [a, b],
      createContext: (module) => {
        const context = fakeContext(module.id)
        contexts.set(module.id, context)
        return context
      },
      isEnabled: (id) => enabled.get(id) ?? false,
    })

    await registry.setup()
    await registry.applyEnabledStates()

    expect(a.calls).toContain('setup')
    expect(b.calls).toContain('setup')
    expect(a.calls).toContain('start')
    expect(b.calls).not.toContain('start')

    await registry.applyEnabledStates()
    expect(a.calls.filter((call) => call === 'start')).toHaveLength(1)
  })

  it('启用/禁用可逆，停止时清理定时器', async () => {
    const a = fakeModule('a')
    const enabled = new Map([['a', false]])
    const contexts = new Map<string, ModuleContext>()
    const registry = new ModuleRegistry({
      modules: [a],
      createContext: (module) => {
        const context = fakeContext(module.id)
        contexts.set(module.id, context)
        return context
      },
      isEnabled: (id) => enabled.get(id) ?? false,
    })

    await registry.setup()
    await registry.applyEnabledStates()
    expect(a.calls).not.toContain('start')

    enabled.set('a', true)
    await registry.applyEnabledStates()
    expect(a.calls).toContain('start')

    enabled.set('a', false)
    await registry.applyEnabledStates()
    expect(a.calls).toContain('stop')
    expect(contexts.get('a')?.scheduler.clearAll).toHaveBeenCalled()
  })

  it('功能面板只列出已启用模块贡献的页面', async () => {
    const a = fakeModule('a')
    a.panelPage = { id: 'page-a', title: '页面 A', description: '只读元数据' }
    const b = fakeModule('b')
    b.panelPage = { id: 'page-b', title: '页面 B' }
    const c = fakeModule('c')
    const enabled = new Map([
      ['a', true],
      ['b', false],
      ['c', true],
    ])
    const registry = new ModuleRegistry({
      modules: [a, b, c],
      createContext: (module) => fakeContext(module.id),
      isEnabled: (id) => enabled.get(id) ?? false,
    })

    await registry.setup()
    expect(registry.listPanelPages()).toEqual([
      { id: 'page-a', moduleId: 'a', title: '页面 A', description: '只读元数据' },
    ])

    enabled.set('b', true)
    expect(registry.listPanelPages()).toHaveLength(2)
  })

  it('功能面板页按 order 排序', async () => {
    const a = fakeModule('a')
    a.panelPage = { id: 'page-a', title: '页面 A', order: 30 }
    const b = fakeModule('b')
    b.panelPage = { id: 'page-b', title: '页面 B', order: 10 }
    const registry = new ModuleRegistry({
      modules: [a, b],
      createContext: (module) => fakeContext(module.id),
      isEnabled: () => true,
    })

    await registry.setup()
    expect(registry.listPanelPages().map((page) => page.id)).toEqual(['page-b', 'page-a'])
  })

  it('dispose 逆序清理并移除 IPC', async () => {
    const a = fakeModule('a')
    const b = fakeModule('b', ['a'])
    const disposeOrder: string[] = []
    a.dispose = async () => {
      disposeOrder.push('a')
    }
    b.dispose = async () => {
      disposeOrder.push('b')
    }

    const contexts = new Map<string, ModuleContext>()
    const registry = new ModuleRegistry({
      modules: [a, b],
      createContext: (module) => {
        const context = fakeContext(module.id)
        contexts.set(module.id, context)
        return context
      },
      isEnabled: () => true,
    })

    await registry.setup()
    await registry.applyEnabledStates()
    await registry.dispose()

    expect(contexts.get('b')?.ipc.dispose).toHaveBeenCalled()
    expect(contexts.get('a')?.ipc.dispose).toHaveBeenCalled()
    expect(disposeOrder).toEqual(['b', 'a'])
  })
})

describe('模块设置归一化', () => {
  it('缺失或非法字段回退默认值', () => {
    expect(normalizeModuleSettings(null)).toEqual(DEFAULT_MODULE_SETTINGS)
    expect(normalizeModuleSettings({ pomodoro: { focusMinutes: 999 } }).pomodoro).toEqual({
      ...DEFAULT_MODULE_SETTINGS.pomodoro,
      focusMinutes: 60,
    })
    expect(
      normalizeModuleSettings({ pomodoro: { focusMinutes: 10, breakMinutes: 0, enabled: true } })
        .pomodoro,
    ).toEqual({ enabled: true, focusMinutes: 10, breakMinutes: 1 })
  })

  it('设置归一化包含夜间互动与模块默认值', () => {
    const settings = normalizeSettings({})
    expect(settings.nightInteraction).toBe(true)
    expect(settings.nightProactive).toBe(true)
    expect(settings.modules.chime.nightEnabled).toBe(true)
    expect(settings.modules).toEqual(DEFAULT_MODULE_SETTINGS)
    expect(settings.modules['claude-code']).toEqual({
      enabled: false,
      rangeDays: 30,
      mentionFrequency: 'low',
    })
    expect(
      normalizeSettings({ nightInteraction: false, nightProactive: false }).nightProactive,
    ).toBe(false)
  })

  it('天气模块设置按容错规则归一化', () => {
    expect(normalizeModuleSettings(null).weather).toEqual({ enabled: true, city: '' })
    expect(
      normalizeModuleSettings({ weather: { enabled: false, city: '  上海  ' } }).weather,
    ).toEqual({ enabled: false, city: '上海' })
    expect(normalizeModuleSettings({ weather: { city: 123 } }).weather.city).toBe('')
    expect(
      normalizeModuleSettings({ weather: { city: 'x'.repeat(80) } }).weather.city,
    ).toHaveLength(40)
  })

  it('Claude Code 模块开关、项目范围与主动提及频率按容错规则归一化', () => {
    expect(normalizeModuleSettings({ 'claude-code': { enabled: false } })['claude-code']).toEqual({
      enabled: false,
      rangeDays: 30,
      mentionFrequency: 'low',
    })
    expect(
      normalizeModuleSettings({ 'claude-code': { enabled: 'yes' } })['claude-code'].enabled,
    ).toBe(false)
    expect(
      normalizeModuleSettings({ 'claude-code': { rangeDays: 7 } })['claude-code'].rangeDays,
    ).toBe(7)
    expect(
      normalizeModuleSettings({ 'claude-code': { rangeDays: 0 } })['claude-code'].rangeDays,
    ).toBe(0)
    expect(
      normalizeModuleSettings({ 'claude-code': { rangeDays: 99 } })['claude-code'].rangeDays,
    ).toBe(30)
    expect(
      normalizeModuleSettings({ 'claude-code': { mentionFrequency: 'high' } })['claude-code']
        .mentionFrequency,
    ).toBe('high')
    expect(
      normalizeModuleSettings({ 'claude-code': { mentionFrequency: 'loud' } })['claude-code']
        .mentionFrequency,
    ).toBe('low')
  })
})

describe('夜间互动门控', () => {
  it('识别 23:00–08:00', () => {
    expect(isNightTime(new Date(2026, 9, 24, 23, 0).getTime())).toBe(true)
    expect(isNightTime(new Date(2026, 9, 24, 0, 30).getTime())).toBe(true)
    expect(isNightTime(new Date(2026, 9, 24, 7, 59).getTime())).toBe(true)
    expect(isNightTime(new Date(2026, 9, 24, 8, 0).getTime())).toBe(false)
    expect(isNightTime(new Date(2026, 9, 24, 12, 0).getTime())).toBe(false)
  })

  it('总开关或子开关关闭时只压制夜间', () => {
    const night = new Date(2026, 9, 24, 23, 30).getTime()
    const day = new Date(2026, 9, 24, 12, 0).getTime()

    expect(isNightInteractionSuppressed(false, true, night)).toBe(true)
    expect(isNightInteractionSuppressed(true, false, night)).toBe(true)
    expect(isNightInteractionSuppressed(true, true, night)).toBe(false)
    expect(isNightInteractionSuppressed(false, false, day)).toBe(false)
  })
})

describe('modules.json 外层结构', () => {
  it('空文件结构正确', () => {
    expect(createEmptyModulesFile()).toEqual({ schemaVersion: 1, modules: {} })
  })

  it('保留合法模块数据', () => {
    expect(
      normalizeModulesFile({ schemaVersion: 1, modules: { pomodoro: { phase: 'focus' } } }),
    ).toEqual({ schemaVersion: 1, modules: { pomodoro: { phase: 'focus' } } })
  })

  it('版本不符或结构异常返回 null', () => {
    expect(normalizeModulesFile(null)).toBeNull()
    expect(normalizeModulesFile({ schemaVersion: 2, modules: {} })).toBeNull()
    expect(normalizeModulesFile({ schemaVersion: 1, modules: [] })).toBeNull()
    expect(normalizeModulesFile({ schemaVersion: 1 })).toBeNull()
  })
})
