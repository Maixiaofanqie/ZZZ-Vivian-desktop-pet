import type { ComponentType } from 'react'
import { ClaudeCodePage } from './claude-code/ClaudeCodePage'
import { RemindersPanelPage } from './reminders/RemindersPanelPage'
import { WeatherPage } from './weather/WeatherPage'

/**
 * 功能面板页面的渲染侧注册表。
 * 模块在 src/main/modules 中声明 panelPage，这里按同一 id 注册组件；
 * 不加载外部代码，也不在本文件之外硬编码页面。
 */
const PANEL_PAGE_COMPONENTS: Record<string, ComponentType> = {
  'claude-code': ClaudeCodePage,
  weather: WeatherPage,
  reminders: RemindersPanelPage,
}

export function resolvePanelPage(id: string): ComponentType | null {
  return PANEL_PAGE_COMPONENTS[id] ?? null
}
