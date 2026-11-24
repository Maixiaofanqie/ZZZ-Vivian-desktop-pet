import { contextBridge, ipcRenderer } from 'electron'
import type {
  BackupExportResult,
  BackupImportResult,
  BubbleShowPayload,
  ClaudeCodeOpenResult,
  ClaudeCodeSnapshot,
  HitMaskPayload,
  IdleMotionSettings,
  ImageMode,
  ImageSelection,
  ModuleSnapshot,
  PanelPageSnapshot,
  PetVisualMetrics,
  RemindersSnapshot,
  SettingsSnapshot,
  VivianApi,
  WeatherCityCandidate,
  WeatherSnapshotResult,
} from '../shared/ipc'

/**
 * 预加载层唯一出口。
 * 只暴露白名单能力，绝不直接暴露 ipcRenderer 或 Node API。
 */
const vivianApi: VivianApi = {
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  },
  pet: {
    updateHitMask: (mask: HitMaskPayload) => {
      ipcRenderer.send('pet:update-hit-mask', mask)
    },
    updateVisualMetrics: (metrics: PetVisualMetrics) => {
      ipcRenderer.send('pet:update-visual-metrics', metrics)
    },
    dragStart: () => {
      ipcRenderer.send('pet:drag-start')
    },
    dragEnd: () => {
      ipcRenderer.send('pet:drag-end')
    },
    click: () => {
      ipcRenderer.send('pet:click')
    },
    pointerUp: () => {
      ipcRenderer.send('pet:pointer-up')
    },
    openContextMenu: () => {
      ipcRenderer.send('pet:context-menu')
    },
    onHoverChanged: (callback: (hovered: boolean) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, hovered: boolean): void => {
        callback(hovered)
      }
      ipcRenderer.on('pet:hover-changed', listener)
      return () => {
        ipcRenderer.removeListener('pet:hover-changed', listener)
      }
    },
    onLanded: (callback: () => void) => {
      const listener = (): void => {
        callback()
      }
      ipcRenderer.on('pet:landed', listener)
      return () => {
        ipcRenderer.removeListener('pet:landed', listener)
      }
    },
    getImageSelection: () =>
      ipcRenderer.invoke('pet:get-image-selection') as Promise<ImageSelection>,
    setImage: (imageId: string) => ipcRenderer.invoke('pet:set-image', imageId) as Promise<void>,
    onImageSelectionChanged: (callback: (selection: ImageSelection) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, selection: ImageSelection): void => {
        callback(selection)
      }
      ipcRenderer.on('pet:image-selection-changed', listener)
      return () => {
        ipcRenderer.removeListener('pet:image-selection-changed', listener)
      }
    },
    getIdleMotion: () => ipcRenderer.invoke('pet:get-idle-motion') as Promise<IdleMotionSettings>,
    onIdleMotionChanged: (callback: (settings: IdleMotionSettings) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, settings: IdleMotionSettings): void => {
        callback(settings)
      }
      ipcRenderer.on('pet:idle-motion-changed', listener)
      return () => {
        ipcRenderer.removeListener('pet:idle-motion-changed', listener)
      }
    },
  },
  bubble: {
    onShow: (callback: (payload: BubbleShowPayload) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, payload: BubbleShowPayload): void => {
        callback(payload)
      }
      ipcRenderer.on('bubble:show', listener)
      return () => {
        ipcRenderer.removeListener('bubble:show', listener)
      }
    },
    onComplete: (callback: () => void) => {
      const listener = (): void => {
        callback()
      }
      ipcRenderer.on('bubble:complete', listener)
      return () => {
        ipcRenderer.removeListener('bubble:complete', listener)
      }
    },
    onFadeOut: (callback: () => void) => {
      const listener = (): void => {
        callback()
      }
      ipcRenderer.on('bubble:fade-out', listener)
      return () => {
        ipcRenderer.removeListener('bubble:fade-out', listener)
      }
    },
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get') as Promise<SettingsSnapshot>,
    setAutoLaunch: (enabled: boolean) =>
      ipcRenderer.invoke('settings:set-auto-launch', enabled) as Promise<SettingsSnapshot>,
    resetCoWork: () => ipcRenderer.invoke('settings:reset-co-work') as Promise<SettingsSnapshot>,
    setImageMode: (mode: ImageMode) =>
      ipcRenderer.invoke('settings:set-image-mode', mode) as Promise<SettingsSnapshot>,
    setImage: (imageId: string) =>
      ipcRenderer.invoke('settings:set-image', imageId) as Promise<SettingsSnapshot>,
    setIdleAnimation: (enabled: boolean) =>
      ipcRenderer.invoke('settings:set-idle-animation', enabled) as Promise<SettingsSnapshot>,
    setProactiveLines: (enabled: boolean) =>
      ipcRenderer.invoke('settings:set-proactive-lines', enabled) as Promise<SettingsSnapshot>,
    setIdleReminder: (enabled: boolean) =>
      ipcRenderer.invoke('settings:set-idle-reminder', enabled) as Promise<SettingsSnapshot>,
    setSleepReminder: (enabled: boolean) =>
      ipcRenderer.invoke('settings:set-sleep-reminder', enabled) as Promise<SettingsSnapshot>,
    setEasterEggs: (enabled: boolean) =>
      ipcRenderer.invoke('settings:set-easter-eggs', enabled) as Promise<SettingsSnapshot>,
    setNightInteraction: (enabled: boolean) =>
      ipcRenderer.invoke('settings:set-night-interaction', enabled) as Promise<SettingsSnapshot>,
    setNightProactive: (enabled: boolean) =>
      ipcRenderer.invoke('settings:set-night-proactive', enabled) as Promise<SettingsSnapshot>,
    onSelectionChanged: (callback: (selection: ImageSelection) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, selection: ImageSelection): void => {
        callback(selection)
      }
      ipcRenderer.on('settings:image-selection-changed', listener)
      return () => {
        ipcRenderer.removeListener('settings:image-selection-changed', listener)
      }
    },
  },
  data: {
    exportBackup: () => ipcRenderer.invoke('data:export') as Promise<BackupExportResult>,
    importBackup: () => ipcRenderer.invoke('data:import') as Promise<BackupImportResult>,
  },
  modules: {
    list: () => ipcRenderer.invoke('modules:list') as Promise<ModuleSnapshot[]>,
    setEnabled: (id: string, enabled: boolean) =>
      ipcRenderer.invoke('modules:set-enabled', { id, enabled }) as Promise<ModuleSnapshot[]>,
    updateSettings: (id: string, patch: Record<string, unknown>) =>
      ipcRenderer.invoke('modules:update-settings', { id, patch }) as Promise<ModuleSnapshot[]>,
  },
  reminders: {
    list: () => ipcRenderer.invoke('reminders:list', {}) as Promise<RemindersSnapshot>,
    add: (input: { text: string; dueAt: number }) =>
      ipcRenderer.invoke('reminders:add', input) as Promise<RemindersSnapshot>,
    remove: (id: string) =>
      ipcRenderer.invoke('reminders:remove', { id }) as Promise<RemindersSnapshot>,
    setCompleted: (id: string, completed: boolean) =>
      ipcRenderer.invoke('reminders:set-completed', {
        id,
        completed,
      }) as Promise<RemindersSnapshot>,
  },
  panel: {
    listPages: () => ipcRenderer.invoke('panel:list-pages') as Promise<PanelPageSnapshot[]>,
  },
  claudeCode: {
    getSnapshot: (options?: { refresh?: boolean }) =>
      ipcRenderer.invoke('claude-code:get-snapshot', {
        refresh: options?.refresh === true,
      }) as Promise<ClaudeCodeSnapshot>,
    openProject: (projectId: string) =>
      ipcRenderer.invoke('claude-code:open-project', {
        projectId,
      }) as Promise<ClaudeCodeOpenResult>,
    openSession: (projectId: string, sessionId: string) =>
      ipcRenderer.invoke('claude-code:open-session', {
        projectId,
        sessionId,
      }) as Promise<ClaudeCodeOpenResult>,
  },
  weather: {
    getSnapshot: (options?: { refresh?: boolean }) =>
      ipcRenderer.invoke('weather:get-snapshot', {
        refresh: options?.refresh === true,
      }) as Promise<WeatherSnapshotResult>,
    searchCity: (query: string) =>
      ipcRenderer.invoke('weather:search-city', { query }) as Promise<WeatherCityCandidate[]>,
    selectCity: (candidate: WeatherCityCandidate) =>
      ipcRenderer.invoke('weather:select-city', candidate) as Promise<WeatherSnapshotResult>,
  },
}

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('vivian', vivianApi)
}
