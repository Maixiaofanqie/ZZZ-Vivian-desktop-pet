/** 模块 id；与 settings 中的模块设置键保持一致 */
export type ModuleId = 'pomodoro' | 'reminders' | 'chime' | 'claude-code' | 'weather'

export interface PomodoroSettings {
  enabled: boolean
  focusMinutes: number
  breakMinutes: number
}

export interface RemindersSettings {
  enabled: boolean
}

export interface ChimeSettings {
  enabled: boolean
  /** 夜间互动开启时，是否允许 23:00–08:00 报时 */
  nightEnabled: boolean
}

/** 0 表示全部；面板固定最多显示 5 个最近活跃项目 */
export const CLAUDE_CODE_RANGE_DAYS = [0, 7, 30] as const
export type ClaudeCodeRangeDays = (typeof CLAUDE_CODE_RANGE_DAYS)[number]

export const CLAUDE_CODE_MENTION_FREQUENCIES = ['off', 'low', 'medium', 'high'] as const
export type ClaudeCodeMentionFrequency = (typeof CLAUDE_CODE_MENTION_FREQUENCIES)[number]

/** 每次点击触发工作台词的概率；所有档位共享每分钟 1 次、每小时 3 次上限 */
export const CLAUDE_CODE_MENTION_PROBABILITY: Record<ClaudeCodeMentionFrequency, number> = {
  off: 0,
  low: 0.1,
  medium: 0.25,
  high: 0.4,
}

export const CLAUDE_CODE_MENTION_MAX_PER_MINUTE = 1
export const CLAUDE_CODE_MENTION_MAX_PER_HOUR = 3

export interface ClaudeCodeSettings {
  enabled: boolean
  rangeDays: ClaudeCodeRangeDays
  mentionFrequency: ClaudeCodeMentionFrequency
}

export const WEATHER_CITY_MAX = 40

export interface WeatherSettings {
  enabled: boolean
  /** 用户填写的城市名；空字符串表示未配置 */
  city: string
}

export interface ModuleSettings {
  pomodoro: PomodoroSettings
  reminders: RemindersSettings
  chime: ChimeSettings
  'claude-code': ClaudeCodeSettings
  weather: WeatherSettings
}

export const DEFAULT_MODULE_SETTINGS: ModuleSettings = {
  pomodoro: { enabled: false, focusMinutes: 25, breakMinutes: 5 },
  reminders: { enabled: true },
  chime: { enabled: true, nightEnabled: true },
  'claude-code': { enabled: false, rangeDays: 30, mentionFrequency: 'low' },
  weather: { enabled: true, city: '' },
}

export const POMODORO_MIN_FOCUS = 5
export const POMODORO_MAX_FOCUS = 60
export const POMODORO_MIN_BREAK = 1
export const POMODORO_MAX_BREAK = 30

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, Math.round(value)))
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function rangeDays(value: unknown, fallback: ClaudeCodeRangeDays): ClaudeCodeRangeDays {
  return value === 0 || value === 7 || value === 30 ? value : fallback
}

function mentionFrequency(
  value: unknown,
  fallback: ClaudeCodeMentionFrequency,
): ClaudeCodeMentionFrequency {
  return value === 'off' || value === 'low' || value === 'medium' || value === 'high'
    ? value
    : fallback
}

function cityName(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value.trim().slice(0, WEATHER_CITY_MAX) : fallback
}

/** 容错归一化模块设置；缺失或非法字段回退默认值 */
export function normalizeModuleSettings(value: unknown): ModuleSettings {
  const candidate = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  const pomodoro =
    candidate.pomodoro && typeof candidate.pomodoro === 'object'
      ? (candidate.pomodoro as Record<string, unknown>)
      : {}
  const reminders =
    candidate.reminders && typeof candidate.reminders === 'object'
      ? (candidate.reminders as Record<string, unknown>)
      : {}
  const chime =
    candidate.chime && typeof candidate.chime === 'object'
      ? (candidate.chime as Record<string, unknown>)
      : {}
  const claudeCode =
    candidate['claude-code'] && typeof candidate['claude-code'] === 'object'
      ? (candidate['claude-code'] as Record<string, unknown>)
      : {}
  const weather =
    candidate.weather && typeof candidate.weather === 'object'
      ? (candidate.weather as Record<string, unknown>)
      : {}

  return {
    pomodoro: {
      enabled: bool(pomodoro.enabled, DEFAULT_MODULE_SETTINGS.pomodoro.enabled),
      focusMinutes: clampInt(
        pomodoro.focusMinutes,
        POMODORO_MIN_FOCUS,
        POMODORO_MAX_FOCUS,
        DEFAULT_MODULE_SETTINGS.pomodoro.focusMinutes,
      ),
      breakMinutes: clampInt(
        pomodoro.breakMinutes,
        POMODORO_MIN_BREAK,
        POMODORO_MAX_BREAK,
        DEFAULT_MODULE_SETTINGS.pomodoro.breakMinutes,
      ),
    },
    reminders: {
      enabled: bool(reminders.enabled, DEFAULT_MODULE_SETTINGS.reminders.enabled),
    },
    chime: {
      enabled: bool(chime.enabled, DEFAULT_MODULE_SETTINGS.chime.enabled),
      nightEnabled: bool(chime.nightEnabled, DEFAULT_MODULE_SETTINGS.chime.nightEnabled),
    },
    'claude-code': {
      enabled: bool(claudeCode.enabled, DEFAULT_MODULE_SETTINGS['claude-code'].enabled),
      rangeDays: rangeDays(claudeCode.rangeDays, DEFAULT_MODULE_SETTINGS['claude-code'].rangeDays),
      mentionFrequency: mentionFrequency(
        claudeCode.mentionFrequency,
        DEFAULT_MODULE_SETTINGS['claude-code'].mentionFrequency,
      ),
    },
    weather: {
      enabled: bool(weather.enabled, DEFAULT_MODULE_SETTINGS.weather.enabled),
      city: cityName(weather.city, DEFAULT_MODULE_SETTINGS.weather.city),
    },
  }
}
