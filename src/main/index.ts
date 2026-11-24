import {
  app,
  type BrowserWindow,
  dialog,
  type IpcMainEvent,
  type IpcMainInvokeEvent,
  ipcMain,
  Menu,
  type MenuItemConstructorOptions,
  powerMonitor,
  screen,
  type Tray,
} from 'electron'
import { bubbleRevealMs } from '../shared/bubble'
import {
  APP_ID,
  BUBBLE_COMPLETE_READ_MS,
  BUBBLE_FADE_OUT_MS,
  BUBBLE_GAP,
  BUBBLE_HEIGHT,
  BUBBLE_WIDTH,
  PET_WINDOW_HEIGHT,
  PET_WINDOW_WIDTH,
} from '../shared/constants'
import { daysTogether } from '../shared/coWork'
import type {
  BubbleShowPayload,
  IdleMotionSettings,
  ImageSelection,
  ModuleSnapshot,
  PanelPageSnapshot,
  PetVisualMetrics,
  SettingsSnapshot,
  WindowPosition,
} from '../shared/ipc'
import { isNightInteractionSuppressed } from '../shared/night'
import { PERSONA } from '../shared/persona'
import {
  autoLaunchSchema,
  easterEggsSchema,
  hitMaskSchema,
  idleAnimationSchema,
  idleReminderSchema,
  imageIdSchema,
  imageModeSchema,
  moduleSetEnabledSchema,
  moduleUpdateSettingsSchema,
  nightInteractionSchema,
  nightProactiveSchema,
  proactiveLinesSchema,
  sleepReminderSchema,
  visualMetricsSchema,
} from '../shared/schemas'
import { selectEasterEggLine } from './dialogue/easterEggs'
import type { DayPeriod, DialogueLine } from './dialogue/lines'
import { DIALOGUE_LINES } from './dialogue/lines'
import { proactiveDelayMs } from './dialogue/proactive'
import { REMINDER_LINES } from './dialogue/reminders'
import { renderDialogueText } from './dialogue/render'
import { periodForHour, selectGreeting, selectLine, selectTaggedLine } from './dialogue/selectLine'
import { createModuleContext } from './modules/context'
import { APP_MODULES } from './modules/index'
import { getModuleClickLine } from './modules/lines'
import { getModulePetMenuItems } from './modules/menus'
import { ModuleRegistry } from './modules/registry'
import { computeBubblePosition } from './services/bubblePosition'
import { ClickThroughService } from './services/clickThrough'
import { clampPositionToWorkArea } from './services/geometry'
import { configureFileLogger, logger } from './services/logger'
import { ROUTINE_GLOBAL_COOLDOWN_MS, ROUTINE_POLL_MS, RoutineReminder } from './services/routine'
import { beginRun, endRun, runStatePath } from './services/runState'
import { createTray, destroyTray, refreshTrayMenu } from './services/tray'
import { WindowMotionService } from './services/windowMotion'
import { exportBackup, importBackup } from './store/backup'
import { markMilestonesSeen } from './store/memory'
import {
  getCoWork,
  getMemory,
  loadProfile,
  recordInteraction,
  resetCoWork,
  updateMemory,
} from './store/profile'
import {
  applyAutoLaunch,
  getSettings,
  setAutoLaunch,
  setEasterEggs,
  setIdleAnimation,
  setIdleReminder,
  setImageMode,
  setModuleEnabled,
  setNightInteraction,
  setNightProactive,
  setProactiveLines,
  setSelectedImage,
  setSleepReminder,
  updateModuleSettingsById,
} from './store/settings'
import { loadWindowPosition, saveWindowPosition } from './store/state'
import { createBubbleWindow } from './windows/bubbleWindow'
import { createPanelWindow } from './windows/panelWindow'
import { createPetWindow } from './windows/petWindow'
import { createSettingsWindow } from './windows/settingsWindow'

let petWindow: BrowserWindow | null = null
let bubbleWindow: BrowserWindow | null = null
let settingsWindow: BrowserWindow | null = null
let panelWindow: BrowserWindow | null = null
let tray: Tray | null = null
let clickThrough: ClickThroughService | null = null
let motion: WindowMotionService | null = null
let saveTimer: ReturnType<typeof setTimeout> | null = null
let bubbleHideTimer: ReturnType<typeof setTimeout> | null = null
let bubbleFadeTimer: ReturnType<typeof setTimeout> | null = null
let bubbleReady = false
let bubbleRevealUntil = 0
let lastBubbleCompletionAt = 0
let lastLineId: string | undefined
/** 开发期台词预览：VIVIAN_LINE_PREVIEW=id1,id2,...；每次点击按顺序显示 */
const linePreviewIds = app.isPackaged
  ? []
  : (process.env.VIVIAN_LINE_PREVIEW ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean)
let linePreviewIndex = 0
let quitting = false
let petDragging = false
let proactiveTimer: ReturnType<typeof setTimeout> | null = null
let routineTimer: ReturnType<typeof setInterval> | null = null
let moduleRegistry: ModuleRegistry | null = null
let runStartedAt = 0
let lastRunCrashed = false
let petRebuildAt = 0
let petRebuildTimer: ReturnType<typeof setTimeout> | null = null

const PET_REBUILD_COOLDOWN_MS = 5 * 60 * 1000
const PET_REBUILD_DELAY_MS = 300
const routineReminder = new RoutineReminder({
  idleActiveMs: (() => {
    if (app.isPackaged) return undefined
    const override = Number(process.env.VIVIAN_IDLE_TEST_MS)
    return Number.isFinite(override) && override > 0 ? Math.max(1000, override) : undefined
  })(),
})
/** 本次启动中已经问候过的时段 */
const greetedPeriods = new Set<DayPeriod>()
/** 当前形象的可见范围；渲染层按 alpha 边界上报，用于把气泡贴到头顶 */
let petVisualMetrics: PetVisualMetrics = { topRatio: 0, bottomRatio: 1 }

// 开发期验收钩子：隔离用户数据目录，避免测试数据污染真实记录
if (!app.isPackaged && process.env.VIVIAN_USER_DATA_DIR) {
  app.setPath('userData', process.env.VIVIAN_USER_DATA_DIR)
}

// 外部终止（如开发脚本 timeout）也按退出处理，避免把渲染进程退出误判为崩溃
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    quitting = true
    app.quit()
  })
}

process.on('uncaughtException', (error) => {
  logger.crash('main', error, { phase: 'uncaughtException' })
  app.exit(1)
})

process.on('unhandledRejection', (reason) => {
  logger.crash('main', reason, { phase: 'unhandledRejection' })
})

const hasSingleInstanceLock = app.requestSingleInstanceLock()

if (!hasSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (petWindow && !petWindow.isDestroyed()) {
      petWindow.showInactive()
    }
  })

  app.on('child-process-gone', (_event, details) => {
    // 退出阶段 GPU/Utility 进程也会收到 SIGTERM，不应记为崩溃
    if (quitting) return
    if (details.reason === 'clean-exit' || details.exitCode === 143) return

    logger.crash('child', new Error(`子进程退出：${details.type} ${details.reason}`), {
      type: details.type,
      reason: details.reason,
      exitCode: details.exitCode,
      serviceName: details.serviceName,
      name: details.name,
    })
  })

  app.whenReady().then(startApp)

  app.on('before-quit', () => {
    quitting = true
    if (petRebuildTimer) {
      clearTimeout(petRebuildTimer)
      petRebuildTimer = null
    }
    if (runStartedAt > 0) {
      try {
        endRun(runStatePath(app.getPath('userData')), runStartedAt, Date.now())
      } catch (error) {
        logger.warn('运行状态收尾失败', error)
      }
    }
    logger.info('应用退出')
    flushPosition()
    hideBubble()
    clearProactiveTimer()
    stopRoutineReminders()
    void moduleRegistry?.dispose()
    moduleRegistry = null
    clickThrough?.stop()
    motion?.stop()
    bubbleWindow?.destroy()
    bubbleWindow = null
    settingsWindow?.destroy()
    settingsWindow = null
    panelWindow?.destroy()
    panelWindow = null
    destroyTray(tray)
    tray = null
  })

  // 托盘驻留应用：窗口全部关闭也不退出
  app.on('window-all-closed', () => {})
}

function defaultPosition(): WindowPosition {
  const workArea = screen.getPrimaryDisplay().workArea
  return {
    x: workArea.x + workArea.width - PET_WINDOW_WIDTH - 32,
    // 底部贴合工作区，避免重置位置后再次出现脚底浮空
    y: workArea.y + workArea.height - PET_WINDOW_HEIGHT,
  }
}

function resolveInitialPosition(): WindowPosition {
  const saved = loadWindowPosition()
  if (!saved) return defaultPosition()

  const display = screen.getDisplayNearestPoint({
    x: saved.x + PET_WINDOW_WIDTH / 2,
    y: saved.y + PET_WINDOW_HEIGHT / 2,
  })

  return clampPositionToWorkArea(
    saved,
    { width: PET_WINDOW_WIDTH, height: PET_WINDOW_HEIGHT },
    display.workArea,
  )
}

function scheduleSave(position: WindowPosition): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saveWindowPosition(position.x, position.y)
    saveTimer = null
  }, 400)
}

function flushPosition(): void {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }

  if (petWindow && !petWindow.isDestroyed()) {
    const bounds = petWindow.getContentBounds()
    saveWindowPosition(bounds.x, bounds.y)
  }
}

/** 监听渲染进程崩溃；宠物窗走重建，其余窗口只记录 */
function watchRenderer(win: BrowserWindow, name: string): void {
  win.webContents.on('render-process-gone', (_event, details) => {
    // 退出阶段渲染进程也会收到 SIGTERM，不能当成崩溃去重建
    if (quitting) return
    if (details.reason === 'clean-exit' || details.exitCode === 143) return

    logger.crash('renderer', new Error(`渲染进程退出：${name} ${details.reason}`), {
      window: name,
      reason: details.reason,
      exitCode: details.exitCode,
    })

    if (name === 'pet') schedulePetRebuild()
  })
}

/**
 * 创建宠物窗并接好运动/命中服务。
 * 渲染进程崩溃重建时复用同一套接线，避免托盘、气泡与命中面罩各自持有旧窗口。
 */
function createAndWirePetWindow(position: WindowPosition): void {
  const win = createPetWindow(position)
  petWindow = win
  watchRenderer(win, 'pet')

  motion?.stop()
  clickThrough?.stop()

  motion = new WindowMotionService(
    win,
    { width: PET_WINDOW_WIDTH, height: PET_WINDOW_HEIGHT },
    {
      onLanded: () => {
        if (petWindow === win && !win.isDestroyed()) {
          win.webContents.send('pet:landed')
        }
      },
      onSettled: (next) => scheduleSave(next),
    },
  )

  clickThrough = new ClickThroughService(win, (hovered) => {
    if (petWindow === win && !win.isDestroyed()) {
      win.webContents.send('pet:hover-changed', hovered)
    }
  })
  clickThrough.start()

  win.on('close', (event) => {
    if (!quitting) {
      event.preventDefault()
      win.hide()
      hideBubble()
    }
  })

  win.on('hide', () => {
    if (petWindow === win) hideBubble()
  })

  win.on('closed', () => {
    if (petWindow === win) petWindow = null
  })
}

/** 渲染进程崩溃后限频重建；5 分钟内再次崩溃则停止自动重建并提示 */
function schedulePetRebuild(): void {
  const now = Date.now()
  if (now - petRebuildAt < PET_REBUILD_COOLDOWN_MS) {
    logger.error('宠物窗口在冷却期内再次崩溃，停止自动重建')
    dialog.showErrorBox('薇薇安桌宠', '界面进程异常，请重新启动应用。日志已保存。')
    return
  }

  petRebuildAt = now
  if (petRebuildTimer) clearTimeout(petRebuildTimer)
  petRebuildTimer = setTimeout(() => {
    petRebuildTimer = null
    if (quitting) return

    const old = petWindow
    const bounds = old && !old.isDestroyed() ? old.getBounds() : null
    const position = bounds ? { x: bounds.x, y: bounds.y } : resolveInitialPosition()

    motion?.stop()
    motion = null
    clickThrough?.stop()
    clickThrough = null
    petWindow = null
    if (old && !old.isDestroyed()) old.destroy()

    try {
      createAndWirePetWindow(position)
      logger.info('宠物窗口已重建', position)
    } catch (error) {
      logger.crash('main', error, { phase: 'pet-rebuild' })
      dialog.showErrorBox('薇薇安桌宠', '界面恢复失败，请重新启动应用。日志已保存。')
    }
  }, PET_REBUILD_DELAY_MS)
}

/** 显示器缩放/增删后确保宠物仍在工作区内 */
function keepPetOnScreen(): void {
  if (!petWindow || petWindow.isDestroyed()) return

  hideBubble()
  const bounds = petWindow.getContentBounds()
  const display = screen.getDisplayNearestPoint({
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
  })
  const clamped = clampPositionToWorkArea(
    { x: bounds.x, y: bounds.y },
    { width: bounds.width, height: bounds.height },
    display.workArea,
  )

  if (clamped.x !== bounds.x || clamped.y !== bounds.y) {
    petWindow.setContentBounds(
      { x: clamped.x, y: clamped.y, width: bounds.width, height: bounds.height },
      false,
    )
    scheduleSave(clamped)
  }
}

function resetPosition(): void {
  if (!petWindow || petWindow.isDestroyed()) return
  hideBubble()
  const position = defaultPosition()
  const bounds = petWindow.getContentBounds()
  petWindow.setContentBounds(
    { x: position.x, y: position.y, width: bounds.width, height: bounds.height },
    false,
  )
  scheduleSave(position)
}

/** 导入备份后把宠物移动到备份中的位置，并夹紧到当前工作区 */
function applyImportedPosition(position: WindowPosition): void {
  if (!petWindow || petWindow.isDestroyed()) return
  hideBubble()

  const display = screen.getDisplayNearestPoint({
    x: position.x + PET_WINDOW_WIDTH / 2,
    y: position.y + PET_WINDOW_HEIGHT / 2,
  })
  const clamped = clampPositionToWorkArea(
    position,
    { width: PET_WINDOW_WIDTH, height: PET_WINDOW_HEIGHT },
    display.workArea,
  )

  petWindow.setContentBounds(
    {
      x: clamped.x,
      y: clamped.y,
      width: PET_WINDOW_WIDTH,
      height: PET_WINDOW_HEIGHT,
    },
    false,
  )
  scheduleSave(clamped)
}

function getSettingsSnapshot(): SettingsSnapshot {
  const coWork = getCoWork()
  const settings = getSettings()
  return {
    coWork,
    daysTogether: daysTogether(coWork, Date.now()),
    autoLaunch: settings.autoLaunch,
    packaged: app.isPackaged,
    lastRunCrashed,
    version: app.getVersion(),
    imageMode: settings.imageMode,
    selectedImageId: settings.selectedImageId,
    idleAnimation: settings.idleAnimation,
    proactiveLines: settings.proactiveLines,
    idleReminder: settings.idleReminder,
    sleepReminder: settings.sleepReminder,
    easterEggs: settings.easterEggs,
    nightInteraction: settings.nightInteraction,
    nightProactive: settings.nightProactive,
  }
}

function getPanelPages(): PanelPageSnapshot[] {
  if (moduleRegistry) return moduleRegistry.listPanelPages()

  const modules = getSettings().modules as unknown as Record<string, { enabled?: boolean }>
  return APP_MODULES.flatMap((module) => {
    if (!module.panelPage || modules[module.id]?.enabled !== true) return []

    return [
      {
        id: module.panelPage.id,
        moduleId: module.id,
        title: module.panelPage.title,
        description: module.panelPage.description ?? '',
      },
    ]
  })
}

function getModulesSnapshot(): ModuleSnapshot[] {
  if (moduleRegistry) return moduleRegistry.list()

  const modules = getSettings().modules as unknown as Record<string, unknown>
  return APP_MODULES.map((module) => ({
    id: module.id,
    title: module.title,
    description: module.description,
    enabled: (modules[module.id] as { enabled?: boolean } | undefined)?.enabled === true,
    settings: modules[module.id] ?? null,
  }))
}

function getIdleMotion(): IdleMotionSettings {
  return { enabled: getSettings().idleAnimation }
}

function broadcastIdleMotion(): void {
  petWindow?.webContents.send('pet:idle-motion-changed', getIdleMotion())
}

function getImageSelection(): ImageSelection {
  const settings = getSettings()
  return {
    mode: settings.imageMode,
    selectedImageId: settings.selectedImageId,
  }
}

function broadcastImageSelection(): void {
  const selection = getImageSelection()
  petWindow?.webContents.send('pet:image-selection-changed', selection)
  settingsWindow?.webContents.send('settings:image-selection-changed', selection)
}

function showBubble(text: string, durationMs: number): void {
  if (!bubbleWindow || bubbleWindow.isDestroyed()) return
  if (!petWindow || petWindow.isDestroyed()) return

  const petBounds = petWindow.getContentBounds()
  const display = screen.getDisplayNearestPoint({
    x: petBounds.x + petBounds.width / 2,
    y: petBounds.y + petBounds.height / 2,
  })
  const position = computeBubblePosition(
    petBounds,
    { width: BUBBLE_WIDTH, height: BUBBLE_HEIGHT },
    display.workArea,
    BUBBLE_GAP,
    petVisualMetrics,
  )

  bubbleWindow.setContentBounds(
    {
      x: position.x,
      y: position.y,
      width: BUBBLE_WIDTH,
      height: BUBBLE_HEIGHT,
    },
    false,
  )

  const payload: BubbleShowPayload = {
    text,
    durationMs,
    placement: position.placement,
  }
  const send = (): void => {
    bubbleWindow?.webContents.send('bubble:show', payload)
  }

  if (bubbleReady && !bubbleWindow.webContents.isLoading()) {
    send()
  } else {
    bubbleWindow.webContents.once('did-finish-load', send)
  }

  bubbleWindow.showInactive()
  bubbleRevealUntil = Date.now() + bubbleRevealMs(text) + 120
  scheduleBubbleTimers(durationMs)
}

function scheduleBubbleTimers(durationMs: number): void {
  clearBubbleTimers()
  bubbleFadeTimer = setTimeout(
    () => {
      bubbleFadeTimer = null
      bubbleWindow?.webContents.send('bubble:fade-out')
    },
    Math.max(0, durationMs - BUBBLE_FADE_OUT_MS),
  )
  bubbleHideTimer = setTimeout(() => {
    bubbleHideTimer = null
    bubbleRevealUntil = 0
    bubbleWindow?.hide()
  }, durationMs)
}

function clearBubbleTimers(): void {
  if (bubbleHideTimer) {
    clearTimeout(bubbleHideTimer)
    bubbleHideTimer = null
  }
  if (bubbleFadeTimer) {
    clearTimeout(bubbleFadeTimer)
    bubbleFadeTimer = null
  }
}

function completeBubbleText(): void {
  if (!bubbleWindow || bubbleWindow.isDestroyed()) return
  bubbleWindow.webContents.send('bubble:complete')
  bubbleRevealUntil = 0
  scheduleBubbleTimers(BUBBLE_COMPLETE_READ_MS)
}

function hideBubble(): void {
  clearBubbleTimers()
  bubbleRevealUntil = 0
  if (bubbleWindow && !bubbleWindow.isDestroyed()) {
    bubbleWindow.hide()
  }
}

function nextPreviewLine(): DialogueLine | null {
  if (linePreviewIds.length === 0) return null

  const id = linePreviewIds[linePreviewIndex % linePreviewIds.length] ?? ''
  linePreviewIndex += 1
  return DIALOGUE_LINES.find((line) => line.id === id) ?? null
}

/** 气泡停留时长：按文字长度估算，限制在 3.5–9 秒 */
function bubbleDurationFor(text: string): number {
  return Math.min(9000, Math.max(3500, 2200 + text.length * 90))
}

function handlePetClick(): void {
  // 同一次 pointerup 已经即时补全过气泡时，忽略 300ms 后的延迟单击
  if (Date.now() - lastBubbleCompletionAt < 500) return

  if (
    bubbleWindow &&
    !bubbleWindow.isDestroyed() &&
    bubbleWindow.isVisible() &&
    Date.now() < bubbleRevealUntil
  ) {
    completeBubbleText()
    return
  }

  const now = Date.now()
  const coWork = recordInteraction(now)
  const context = {
    daysTogether: daysTogether(coWork, now),
    interactions: coWork.interactionCount,
    address: PERSONA.address,
  }

  // 开发期台词预览优先，便于逐条检查新台词
  const preview = nextPreviewLine()
  if (preview) {
    const previewText = renderDialogueText(preview.text, context)
    showBubble(previewText, bubbleDurationFor(previewText))
    logger.info('台词预览', { lineId: preview.id })
    return
  }

  // 里程碑彩蛋优先于普通台词
  if (showPendingEasterEgg(now, true)) return

  const hour = new Date(now).getHours()
  const period = periodForHour(hour)
  let line: DialogueLine | null = null

  if (!greetedPeriods.has(period)) {
    greetedPeriods.add(period)
    line = selectGreeting(DIALOGUE_LINES, period, lastLineId, Math.random, context)
  }

  // 模块主动台词次优先于普通台词，但不抢时段问候
  if (!line) {
    const workLine = getModuleClickLine()
    if (workLine) {
      const durationMs = bubbleDurationFor(workLine.text)
      showBubble(workLine.text, durationMs)
      logger.info('模块主动台词', {
        moduleId: workLine.moduleId,
        lineId: workLine.lineId,
      })
      return
    }
  }

  line ??= selectLine(DIALOGUE_LINES, { hour, lastLineId, context })
  if (!line) return

  lastLineId = line.id
  const text = renderDialogueText(line.text, context)
  const durationMs = bubbleDurationFor(text)
  showBubble(text, durationMs)
  logger.info('宠物被点击', {
    interactionCount: coWork.interactionCount,
    lineId: line.id,
    greeting: line.tags.includes('greeting'),
  })
}

function openSettingsWindow(): void {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.show()
    settingsWindow.focus()
    return
  }

  settingsWindow = createSettingsWindow()
  watchRenderer(settingsWindow, 'settings')
  settingsWindow.on('closed', () => {
    settingsWindow = null
  })
}

function openPanelWindow(): void {
  if (panelWindow && !panelWindow.isDestroyed()) {
    panelWindow.show()
    panelWindow.focus()
    return
  }

  panelWindow = createPanelWindow()
  watchRenderer(panelWindow, 'panel')
  panelWindow.on('closed', () => {
    panelWindow = null
  })
}

function openPetContextMenu(): void {
  if (!petWindow || petWindow.isDestroyed()) return

  hideBubble()
  const moduleItems = getModulePetMenuItems()
  const template: MenuItemConstructorOptions[] = [...moduleItems]
  if (moduleItems.length > 0) template.push({ type: 'separator' })

  template.push(
    { label: '功能面板', click: openPanelWindow },
    { label: '设置', click: openSettingsWindow },
    { type: 'separator' },
    {
      label: '隐藏',
      click: () => {
        petWindow?.hide()
        hideBubble()
      },
    },
    {
      label: '退出',
      click: () => {
        quitting = true
        app.quit()
      },
    },
  )

  const menu = Menu.buildFromTemplate(template)
  menu.popup({ window: petWindow })
}

function nextProactiveDelay(): number {
  if (!app.isPackaged) {
    const override = Number(process.env.VIVIAN_PROACTIVE_TEST_MS)
    if (Number.isFinite(override) && override > 0) return Math.max(500, override)
  }
  return proactiveDelayMs()
}

function clearProactiveTimer(): void {
  if (proactiveTimer) {
    clearTimeout(proactiveTimer)
    proactiveTimer = null
  }
}

function scheduleProactiveLine(): void {
  clearProactiveTimer()
  if (!getSettings().proactiveLines) return

  proactiveTimer = setTimeout(() => {
    proactiveTimer = null
    fireProactiveLine()
  }, nextProactiveDelay())
}

function fireProactiveLine(): void {
  const settings = getSettings()
  if (!settings.proactiveLines) return
  const now = Date.now()

  if (isNightInteractionSuppressed(settings.nightInteraction, settings.nightProactive, now)) {
    scheduleProactiveLine()
    return
  }

  const hour = new Date(now).getHours()
  const ready =
    petWindow !== null &&
    !petWindow.isDestroyed() &&
    petWindow.isVisible() &&
    !petDragging &&
    !(bubbleWindow?.isVisible() ?? false)

  if (!ready) {
    scheduleProactiveLine()
    return
  }

  // 与久坐/催睡共用冷却，避免两种主动提醒挨得太近
  if (now - routineReminder.lastReminderAt < ROUTINE_GLOBAL_COOLDOWN_MS) {
    scheduleProactiveLine()
    return
  }

  const coWork = getCoWork()
  const context = {
    daysTogether: daysTogether(coWork, now),
    interactions: coWork.interactionCount,
    address: PERSONA.address,
  }
  const line = selectLine(DIALOGUE_LINES, { hour, lastLineId, context })
  if (!line) {
    scheduleProactiveLine()
    return
  }

  lastLineId = line.id
  const text = renderDialogueText(line.text, context)
  const durationMs = bubbleDurationFor(text)
  showBubble(text, durationMs)
  logger.info('主动问候', { lineId: line.id })
  scheduleProactiveLine()
}

function petReadyForBubble(): boolean {
  return Boolean(
    petWindow && !petWindow.isDestroyed() && petWindow.isVisible() && !petDragging && !quitting,
  )
}

function routineCanShow(): boolean {
  return (
    petReadyForBubble() &&
    !(bubbleWindow && !bubbleWindow.isDestroyed() && bubbleWindow.isVisible())
  )
}

/**
 * 展示尚未看过的里程碑彩蛋。
 * 点击时允许抢占旧气泡；后台调度时等气泡消失再展示。
 */
function showPendingEasterEgg(now: number, allowReplaceBubble = false): boolean {
  if (!getSettings().easterEggs) return false
  if (allowReplaceBubble ? !petReadyForBubble() : !routineCanShow()) return false

  const pending = getMemory().milestones.find(
    (milestone) => !milestone.seen && selectEasterEggLine(milestone.id) !== null,
  )
  if (!pending) return false

  const line = selectEasterEggLine(pending.id)
  if (!line) return false

  const coWork = getCoWork()
  const context = {
    daysTogether: daysTogether(coWork, now),
    interactions: coWork.interactionCount,
    address: PERSONA.address,
  }
  const text = renderDialogueText(line.text, context)
  const durationMs = bubbleDurationFor(text)
  showBubble(text, durationMs)
  updateMemory((memory) => markMilestonesSeen(memory, [pending.id]))
  logger.info('彩蛋触发', { milestoneId: pending.id, lineId: line.id })
  return true
}

function tickRoutine(): void {
  const now = Date.now()
  if (showPendingEasterEgg(now)) return

  const settings = getSettings()
  const sleepEnabled =
    settings.sleepReminder &&
    !isNightInteractionSuppressed(settings.nightInteraction, settings.sleepReminder, now)
  if (!settings.idleReminder && !sleepEnabled) return

  const action = routineReminder.evaluate({
    now,
    idleSeconds: powerMonitor.getSystemIdleTime(),
    idleEnabled: settings.idleReminder,
    sleepEnabled,
    canShow: routineCanShow(),
  })
  if (!action) return

  const coWork = getCoWork()
  const context = {
    daysTogether: daysTogether(coWork, now),
    interactions: coWork.interactionCount,
    address: PERSONA.address,
  }
  const line = selectTaggedLine(REMINDER_LINES, action, {
    hour: new Date(now).getHours(),
    lastLineId,
    context,
  })
  if (!line) return

  lastLineId = line.id
  const text = renderDialogueText(line.text, context)
  const durationMs = bubbleDurationFor(text)
  showBubble(text, durationMs)
  logger.info(action === 'idle' ? '久坐提醒' : '深夜催睡', { lineId: line.id })
}

function routinePollMs(): number {
  if (!app.isPackaged) {
    const idleOverride = Number(process.env.VIVIAN_IDLE_TEST_MS)
    if (Number.isFinite(idleOverride) && idleOverride > 0) {
      return Math.max(1000, Math.min(ROUTINE_POLL_MS, idleOverride))
    }
  }
  return ROUTINE_POLL_MS
}

function startRoutineReminders(): void {
  if (routineTimer) return
  routineTimer = setInterval(tickRoutine, routinePollMs())
}

function stopRoutineReminders(): void {
  if (routineTimer) {
    clearInterval(routineTimer)
    routineTimer = null
  }
}

function isFromPetWindow(event: IpcMainEvent | IpcMainInvokeEvent): boolean {
  return (
    petWindow !== null && !petWindow.isDestroyed() && event.sender.id === petWindow.webContents.id
  )
}

function isFromSettingsWindow(event: IpcMainEvent | IpcMainInvokeEvent): boolean {
  return (
    settingsWindow !== null &&
    !settingsWindow.isDestroyed() &&
    event.sender.id === settingsWindow.webContents.id
  )
}

function isFromPanelWindow(event: IpcMainEvent | IpcMainInvokeEvent): boolean {
  return (
    panelWindow !== null &&
    !panelWindow.isDestroyed() &&
    event.sender.id === panelWindow.webContents.id
  )
}

function registerIpc(): void {
  ipcMain.on('pet:update-hit-mask', (event, payload: unknown) => {
    if (!isFromPetWindow(event)) return

    const parsed = hitMaskSchema.safeParse(payload)
    if (!parsed.success) {
      logger.warn('收到无效的命中面罩', parsed.error.issues[0]?.message)
      return
    }

    clickThrough?.setMask({
      width: parsed.data.width,
      height: parsed.data.height,
      data: Uint8Array.from(parsed.data.data),
    })
  })

  ipcMain.on('pet:update-visual-metrics', (event, payload: unknown) => {
    if (!isFromPetWindow(event)) return

    const parsed = visualMetricsSchema.safeParse(payload)
    if (!parsed.success) {
      logger.warn('收到无效的形象可见范围', parsed.error.issues[0]?.message)
      return
    }

    petVisualMetrics = parsed.data
  })

  ipcMain.on('pet:pointer-up', (event) => {
    if (!isFromPetWindow(event)) return
    if (
      bubbleWindow &&
      !bubbleWindow.isDestroyed() &&
      bubbleWindow.isVisible() &&
      Date.now() < bubbleRevealUntil
    ) {
      completeBubbleText()
      lastBubbleCompletionAt = Date.now()
    }
  })

  ipcMain.on('pet:click', (event) => {
    if (!isFromPetWindow(event)) return
    handlePetClick()
  })

  ipcMain.on('pet:context-menu', (event) => {
    if (!isFromPetWindow(event)) return
    openPetContextMenu()
  })

  ipcMain.handle('pet:get-image-selection', (event) => {
    if (!isFromPetWindow(event)) {
      throw new Error('未授权的形象请求')
    }
    return getImageSelection()
  })

  ipcMain.handle('pet:set-image', (event, payload: unknown) => {
    if (!isFromPetWindow(event)) {
      throw new Error('未授权的形象请求')
    }

    const parsed = imageIdSchema.safeParse(payload)
    if (!parsed.success) {
      throw new Error('无效的形象 id')
    }

    setSelectedImage(parsed.data)
    broadcastImageSelection()
  })

  ipcMain.handle('pet:get-idle-motion', (event) => {
    if (!isFromPetWindow(event)) {
      throw new Error('未授权的待机动效请求')
    }
    return getIdleMotion()
  })

  ipcMain.on('pet:drag-start', (event) => {
    if (!isFromPetWindow(event)) return
    logger.info('拖拽开始', petWindow?.getBounds())
    petDragging = true
    hideBubble()
    clickThrough?.setDragging(true)
    motion?.startDrag()
  })

  ipcMain.on('pet:drag-end', (event) => {
    if (!isFromPetWindow(event)) return
    logger.info('拖拽结束', petWindow?.getBounds())
    petDragging = false
    motion?.endDrag()
    clickThrough?.setDragging(false)
    recordInteraction()
  })

  ipcMain.handle('settings:get', (event) => {
    if (!isFromSettingsWindow(event)) {
      throw new Error('未授权的设置请求')
    }
    return getSettingsSnapshot()
  })

  ipcMain.handle('settings:set-auto-launch', (event, payload: unknown) => {
    if (!isFromSettingsWindow(event)) {
      throw new Error('未授权的设置请求')
    }

    const parsed = autoLaunchSchema.safeParse(payload)
    if (!parsed.success) {
      throw new Error('无效的开机自启设置')
    }

    setAutoLaunch(parsed.data)
    return getSettingsSnapshot()
  })

  ipcMain.handle('settings:reset-co-work', (event) => {
    if (!isFromSettingsWindow(event)) {
      throw new Error('未授权的设置请求')
    }

    resetCoWork()
    return getSettingsSnapshot()
  })

  ipcMain.handle('settings:set-image-mode', (event, payload: unknown) => {
    if (!isFromSettingsWindow(event)) {
      throw new Error('未授权的设置请求')
    }

    const parsed = imageModeSchema.safeParse(payload)
    if (!parsed.success) {
      throw new Error('无效的形象切换模式')
    }

    setImageMode(parsed.data)
    broadcastImageSelection()
    return getSettingsSnapshot()
  })

  ipcMain.handle('settings:set-image', (event, payload: unknown) => {
    if (!isFromSettingsWindow(event)) {
      throw new Error('未授权的设置请求')
    }

    const parsed = imageIdSchema.safeParse(payload)
    if (!parsed.success) {
      throw new Error('无效的形象 id')
    }

    setSelectedImage(parsed.data)
    broadcastImageSelection()
    return getSettingsSnapshot()
  })

  ipcMain.handle('settings:set-idle-animation', (event, payload: unknown) => {
    if (!isFromSettingsWindow(event)) {
      throw new Error('未授权的设置请求')
    }

    const parsed = idleAnimationSchema.safeParse(payload)
    if (!parsed.success) {
      throw new Error('无效的待机动效设置')
    }

    setIdleAnimation(parsed.data)
    broadcastIdleMotion()
    return getSettingsSnapshot()
  })

  ipcMain.handle('settings:set-proactive-lines', (event, payload: unknown) => {
    if (!isFromSettingsWindow(event)) {
      throw new Error('未授权的设置请求')
    }

    const parsed = proactiveLinesSchema.safeParse(payload)
    if (!parsed.success) {
      throw new Error('无效的定时问候设置')
    }

    setProactiveLines(parsed.data)
    scheduleProactiveLine()
    return getSettingsSnapshot()
  })

  ipcMain.handle('settings:set-idle-reminder', (event, payload: unknown) => {
    if (!isFromSettingsWindow(event)) {
      throw new Error('未授权的设置请求')
    }

    const parsed = idleReminderSchema.safeParse(payload)
    if (!parsed.success) {
      throw new Error('无效的久坐提醒设置')
    }

    setIdleReminder(parsed.data)
    return getSettingsSnapshot()
  })

  ipcMain.handle('settings:set-sleep-reminder', (event, payload: unknown) => {
    if (!isFromSettingsWindow(event)) {
      throw new Error('未授权的设置请求')
    }

    const parsed = sleepReminderSchema.safeParse(payload)
    if (!parsed.success) {
      throw new Error('无效的深夜催睡设置')
    }

    setSleepReminder(parsed.data)
    return getSettingsSnapshot()
  })

  ipcMain.handle('settings:set-easter-eggs', (event, payload: unknown) => {
    if (!isFromSettingsWindow(event)) {
      throw new Error('未授权的设置请求')
    }

    const parsed = easterEggsSchema.safeParse(payload)
    if (!parsed.success) {
      throw new Error('无效的彩蛋设置')
    }

    setEasterEggs(parsed.data)
    return getSettingsSnapshot()
  })

  ipcMain.handle('settings:set-night-interaction', (event, payload: unknown) => {
    if (!isFromSettingsWindow(event)) {
      throw new Error('未授权的设置请求')
    }

    const parsed = nightInteractionSchema.safeParse(payload)
    if (!parsed.success) {
      throw new Error('无效的夜间互动设置')
    }

    setNightInteraction(parsed.data)
    return getSettingsSnapshot()
  })

  ipcMain.handle('settings:set-night-proactive', (event, payload: unknown) => {
    if (!isFromSettingsWindow(event)) {
      throw new Error('未授权的设置请求')
    }

    const parsed = nightProactiveSchema.safeParse(payload)
    if (!parsed.success) {
      throw new Error('无效的夜间问候设置')
    }

    setNightProactive(parsed.data)
    return getSettingsSnapshot()
  })

  ipcMain.handle('panel:list-pages', (event) => {
    if (!isFromPanelWindow(event)) {
      throw new Error('未授权的功能面板请求')
    }
    return getPanelPages()
  })

  ipcMain.handle('modules:list', (event) => {
    if (!isFromSettingsWindow(event)) {
      throw new Error('未授权的模块请求')
    }
    return getModulesSnapshot()
  })

  ipcMain.handle('modules:set-enabled', async (event, payload: unknown) => {
    if (!isFromSettingsWindow(event)) {
      throw new Error('未授权的模块请求')
    }

    const parsed = moduleSetEnabledSchema.safeParse(payload)
    if (!parsed.success) {
      throw new Error('无效的模块开关')
    }

    setModuleEnabled(parsed.data.id, parsed.data.enabled)
    await moduleRegistry?.applyEnabledStates()
    return getModulesSnapshot()
  })

  ipcMain.handle('modules:update-settings', (event, payload: unknown) => {
    if (!isFromSettingsWindow(event)) {
      throw new Error('未授权的模块请求')
    }

    const parsed = moduleUpdateSettingsSchema.safeParse(payload)
    if (!parsed.success) {
      throw new Error('无效的模块参数')
    }

    updateModuleSettingsById(parsed.data.id, parsed.data.patch)
    return getModulesSnapshot()
  })

  ipcMain.handle('data:export', async (event) => {
    if (!isFromSettingsWindow(event)) {
      throw new Error('未授权的数据请求')
    }
    if (!settingsWindow || settingsWindow.isDestroyed()) {
      return { canceled: true }
    }

    return exportBackup(settingsWindow)
  })

  ipcMain.handle('data:import', async (event) => {
    if (!isFromSettingsWindow(event)) {
      throw new Error('未授权的数据请求')
    }
    if (!settingsWindow || settingsWindow.isDestroyed()) {
      return { canceled: true }
    }

    const result = await importBackup(settingsWindow)

    if (!result.canceled && !result.error) {
      broadcastIdleMotion()
      broadcastImageSelection()
      scheduleProactiveLine()
      if (result.position) applyImportedPosition(result.position)

      await moduleRegistry?.dispose()
      moduleRegistry = null
      try {
        await initModuleRegistry()
      } catch (error) {
        logger.error('模块系统重新加载失败', error)
      }
    }

    return { canceled: result.canceled, error: result.error }
  })
}

async function initModuleRegistry(): Promise<void> {
  const registry = new ModuleRegistry({
    modules: APP_MODULES,
    createContext: (module) =>
      createModuleContext(module, {
        // 模块页面在功能面板中读取数据；设置页仍可操作模块参数
        isTrustedSender: (event) => isFromSettingsWindow(event) || isFromPanelWindow(event),
        notify: (text, durationMs) => {
          if (!routineCanShow()) return false
          showBubble(text, durationMs ?? bubbleDurationFor(text))
          return true
        },
        isAmbientQuiet: (now) => now - routineReminder.lastReminderAt < ROUTINE_GLOBAL_COOLDOWN_MS,
        refreshMenus: refreshTrayMenu,
      }),
    isEnabled: (id) => {
      const modules = getSettings().modules as unknown as Record<string, { enabled?: boolean }>
      return modules[id]?.enabled === true
    },
  })

  await registry.setup()
  await registry.applyEnabledStates()
  moduleRegistry = registry
  refreshTrayMenu()
}

function startApp(): void {
  app.setAppUserModelId(APP_ID)
  configureFileLogger()

  try {
    const run = beginRun(runStatePath(app.getPath('userData')), Date.now())
    runStartedAt = run.state.startedAt
    lastRunCrashed = run.crashed
    if (run.crashed) {
      logger.warn('检测到上次未正常退出', { previousStartedAt: run.previous?.startedAt ?? null })
    }
  } catch (error) {
    logger.warn('运行状态记录失败', error)
  }

  logger.info('应用启动', {
    version: app.getVersion(),
    packaged: app.isPackaged,
    lastRunCrashed,
  })

  loadProfile()
  applyAutoLaunch(getSettings().autoLaunch)

  const position = resolveInitialPosition()
  createAndWirePetWindow(position)

  bubbleWindow = createBubbleWindow()
  watchRenderer(bubbleWindow, 'bubble')
  bubbleWindow.webContents.on('did-finish-load', () => {
    bubbleReady = true
  })
  bubbleWindow.on('closed', () => {
    bubbleWindow = null
    bubbleReady = false
  })

  registerIpc()

  tray = createTray({
    getWindow: () => petWindow,
    onResetPosition: resetPosition,
    onOpenSettings: openSettingsWindow,
    onHide: hideBubble,
    onQuit: () => {
      quitting = true
      app.quit()
    },
  })

  void initModuleRegistry().catch((error) => logger.error('模块系统启动失败', error))

  screen.on('display-metrics-changed', (_event, display, changedMetrics) => {
    logger.info('显示器参数变化', { id: display.id, changedMetrics })
    keepPetOnScreen()
  })
  screen.on('display-added', (_event, display) => {
    logger.info('显示器已添加', display.id)
    keepPetOnScreen()
  })
  screen.on('display-removed', (_event, display) => {
    logger.info('显示器已移除', display.id)
    keepPetOnScreen()
  })

  scheduleProactiveLine()
  startRoutineReminders()

  // 开发期视觉验收钩子：启动后自动打开设置页 / 功能面板；打包版不生效
  if (!app.isPackaged && process.env.VIVIAN_OPEN_SETTINGS === '1') {
    setTimeout(openSettingsWindow, 1200)
  }
  if (!app.isPackaged && process.env.VIVIAN_OPEN_PANEL === '1') {
    setTimeout(openPanelWindow, 1200)
  }

  // 开发期崩溃验收钩子：VIVIAN_CRASH_TEST=renderer|main；打包版不生效
  if (!app.isPackaged) {
    const crashTest = process.env.VIVIAN_CRASH_TEST
    if (crashTest === 'renderer') {
      setTimeout(() => {
        if (petWindow && !petWindow.isDestroyed()) {
          logger.warn('崩溃测试：强制结束渲染进程')
          petWindow.webContents.forcefullyCrashRenderer()
        }
      }, 3000)
    } else if (crashTest === 'main') {
      setTimeout(() => {
        throw new Error('VIVIAN_CRASH_TEST main')
      }, 3000)
    }
  }

  logger.info('宠物窗口已创建', position)
}
