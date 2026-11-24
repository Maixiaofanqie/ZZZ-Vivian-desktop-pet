/**
 * IPC 契约唯一事实来源。
 *
 * 渲染层与主进程之间的所有调用都必须先在此声明，禁止在两端各自定义通道字符串。
 * 变更契约时同步更新 preload、主进程 handler、渲染层调用与 docs/03-架构设计.md。
 */

export interface WindowPosition {
  x: number
  y: number
}

/**
 * 命中面罩：由渲染层按当前形象生成的 alpha 网格。
 * data 为 width × height 的 0/255 值，主进程用于逐像素点击穿透判定。
 */
export interface HitMaskPayload {
  width: number
  height: number
  data: number[]
}

export type ImageMode = 'cycle' | 'fixed'

export interface ImageSelection {
  mode: ImageMode
  selectedImageId: string
}

/**
 * 形象在窗口内的可见范围（0..1，按 alpha 边界计算）。
 * 主进程用它把气泡贴到形象头顶，而不是窗口的透明边缘。
 */
export interface PetVisualMetrics {
  topRatio: number
  bottomRatio: number
}

/** P3.1 待机微动效开关 */
export interface IdleMotionSettings {
  enabled: boolean
}

export interface PetWindowApi {
  updateHitMask: (mask: HitMaskPayload) => void
  updateVisualMetrics: (metrics: PetVisualMetrics) => void
  dragStart: () => void
  dragEnd: () => void
  click: () => void
  pointerUp: () => void
  openContextMenu: () => void
  onHoverChanged: (callback: (hovered: boolean) => void) => () => void
  onLanded: (callback: () => void) => () => void
  getImageSelection: () => Promise<ImageSelection>
  setImage: (imageId: string) => Promise<void>
  onImageSelectionChanged: (callback: (selection: ImageSelection) => void) => () => void
  getIdleMotion: () => Promise<IdleMotionSettings>
  onIdleMotionChanged: (callback: (settings: IdleMotionSettings) => void) => () => void
}

/** 共处记录：取消好感度后的陪伴记录（ADR-002） */
export interface CoWorkRecord {
  firstMetAt: number
  interactionCount: number
  lastInteractionAt: number | null
}

export interface BubbleShowPayload {
  text: string
  durationMs: number
  placement: 'above' | 'below'
}

export interface BubbleApi {
  onShow: (callback: (payload: BubbleShowPayload) => void) => () => void
  onComplete: (callback: () => void) => () => void
  onFadeOut: (callback: () => void) => () => void
}

export interface SettingsSnapshot {
  coWork: CoWorkRecord
  daysTogether: number
  autoLaunch: boolean
  packaged: boolean
  /** 上一次运行未正常退出；由 run-state.json 判定 */
  lastRunCrashed: boolean
  /** 应用版本，来自 app.getVersion() */
  version: string
  imageMode: ImageMode
  selectedImageId: string
  idleAnimation: boolean
  proactiveLines: boolean
  idleReminder: boolean
  sleepReminder: boolean
  easterEggs: boolean
  nightInteraction: boolean
  nightProactive: boolean
}

export interface SettingsApi {
  get: () => Promise<SettingsSnapshot>
  setAutoLaunch: (enabled: boolean) => Promise<SettingsSnapshot>
  resetCoWork: () => Promise<SettingsSnapshot>
  setImageMode: (mode: ImageMode) => Promise<SettingsSnapshot>
  setImage: (imageId: string) => Promise<SettingsSnapshot>
  setIdleAnimation: (enabled: boolean) => Promise<SettingsSnapshot>
  setProactiveLines: (enabled: boolean) => Promise<SettingsSnapshot>
  setIdleReminder: (enabled: boolean) => Promise<SettingsSnapshot>
  setSleepReminder: (enabled: boolean) => Promise<SettingsSnapshot>
  setEasterEggs: (enabled: boolean) => Promise<SettingsSnapshot>
  setNightInteraction: (enabled: boolean) => Promise<SettingsSnapshot>
  setNightProactive: (enabled: boolean) => Promise<SettingsSnapshot>
  onSelectionChanged: (callback: (selection: ImageSelection) => void) => () => void
}

export interface ModuleSnapshot {
  id: string
  title: string
  description: string
  enabled: boolean
  settings: unknown
}

export interface ModulesApi {
  list: () => Promise<ModuleSnapshot[]>
  setEnabled: (id: string, enabled: boolean) => Promise<ModuleSnapshot[]>
  updateSettings: (id: string, patch: Record<string, unknown>) => Promise<ModuleSnapshot[]>
}

/** 功能面板中由模块贡献的一页；只暴露元数据，不暴露主进程路径 */
export interface PanelPageSnapshot {
  id: string
  moduleId: string
  title: string
  description: string
}

export interface PanelApi {
  listPages: () => Promise<PanelPageSnapshot[]>
}

export type ClaudeSessionNameSource = 'tab' | 'derived' | 'auto' | 'user' | 'unknown'

export interface ClaudeSessionSummary {
  /** .jsonl 文件名，即 Claude Code session id */
  id: string
  /** 显示名优先级：VSCode 页签名 > 会话注册表 name > 短 id */
  displayName: string
  /** 名字来源；derived 表示自动派生的短名，面板会加标记 */
  nameSource: ClaudeSessionNameSource
  /** 文件 mtime */
  lastActiveAt: number
}

export interface ClaudeProjectSummary {
  /** 主进程内部 id；渲染层不接触完整路径 */
  id: string
  displayName: string
  lastActiveAt: number
  sessionCount: number
  /** 最近 5 个会话，按 mtime 倒序 */
  sessions: ClaudeSessionSummary[]
}

export interface ClaudeCodeSnapshot {
  scannedAt: number
  projects: ClaudeProjectSummary[]
}

export interface ClaudeCodeOpenResult {
  folderOpened: boolean
  sessionOpened: boolean
  /** 给面板的简短提示；成功时为空中字符串 */
  message: string
}

export interface ClaudeCodeApi {
  /** refresh 为 true 时跳过 5 分钟缓存，立即扫描 */
  getSnapshot: (options?: { refresh?: boolean }) => Promise<ClaudeCodeSnapshot>
  openProject: (projectId: string) => Promise<ClaudeCodeOpenResult>
  openSession: (projectId: string, sessionId: string) => Promise<ClaudeCodeOpenResult>
}

export interface WeatherLocation {
  name: string
  admin1: string
  country: string
  latitude: number
  longitude: number
}

export interface WeatherCurrent {
  temperature: number
  apparentTemperature: number
  condition: string
  weatherCode: number
  high: number
  low: number
  precipitationProbability: number
  precipitation: number
  humidity: number
  windSpeed: number
  isDay: boolean
  observedAt: string
}

export interface WeatherSnapshot {
  location: WeatherLocation
  current: WeatherCurrent
  fetchedAt: number
}

export interface WeatherSnapshotResult {
  configured: boolean
  city: string
  snapshot: WeatherSnapshot | null
  /** 显示的是旧缓存，本次刷新失败 */
  stale: boolean
  error: string | null
}

export interface WeatherCityCandidate extends WeatherLocation {
  id: number
}

export interface WeatherApi {
  getSnapshot: (options?: { refresh?: boolean }) => Promise<WeatherSnapshotResult>
  searchCity: (query: string) => Promise<WeatherCityCandidate[]>
  selectCity: (candidate: WeatherCityCandidate) => Promise<WeatherSnapshotResult>
}

export interface ReminderSnapshot {
  id: string
  text: string
  dueAt: number
  done: boolean
  shownAt: number | null
  completed: boolean
  completedAt: number | null
}

export interface RemindersSnapshot {
  enabled: boolean
  items: ReminderSnapshot[]
}

export interface RemindersApi {
  list: () => Promise<RemindersSnapshot>
  add: (input: { text: string; dueAt: number }) => Promise<RemindersSnapshot>
  remove: (id: string) => Promise<RemindersSnapshot>
  setCompleted: (id: string, completed: boolean) => Promise<RemindersSnapshot>
}

export interface BackupExportResult {
  canceled: boolean
  filePath?: string
  error?: string
}

export interface BackupImportResult {
  canceled: boolean
  error?: string
}

export interface DataApi {
  exportBackup: () => Promise<BackupExportResult>
  importBackup: () => Promise<BackupImportResult>
}

export interface VivianApi {
  versions: {
    electron: string
    chrome: string
    node: string
  }
  pet: PetWindowApi
  bubble: BubbleApi
  settings: SettingsApi
  data: DataApi
  modules: ModulesApi
  reminders: RemindersApi
  panel: PanelApi
  claudeCode: ClaudeCodeApi
  weather: WeatherApi
}
