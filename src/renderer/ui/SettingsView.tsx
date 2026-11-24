import { type KeyboardEvent, useEffect, useRef, useState } from 'react'
import type {
  ImageSelection,
  ModuleSnapshot,
  RemindersSnapshot,
  SettingsSnapshot,
  WeatherCityCandidate,
} from '../../shared/ipc'
import type { ClaudeCodeMentionFrequency } from '../../shared/modules'
import { STATIC_IMAGES } from '../staticImages'

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function localDateInput(timestamp: number): string {
  const date = new Date(timestamp)
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function pomodoroDraft(modules: ModuleSnapshot[]): { focus: number; rest: number } {
  const pomodoro = modules.find((module) => module.id === 'pomodoro')
  const settings = (pomodoro?.settings ?? {}) as { focusMinutes?: number; breakMinutes?: number }
  return {
    focus: settings.focusMinutes ?? 25,
    rest: settings.breakMinutes ?? 5,
  }
}

function claudeCodeRange(modules: ModuleSnapshot[]): number {
  const claudeCode = modules.find((module) => module.id === 'claude-code')
  const settings = (claudeCode?.settings ?? {}) as { rangeDays?: number }
  return settings.rangeDays ?? 30
}

function claudeCodeMention(modules: ModuleSnapshot[]): ClaudeCodeMentionFrequency {
  const claudeCode = modules.find((module) => module.id === 'claude-code')
  const settings = (claudeCode?.settings ?? {}) as { mentionFrequency?: unknown }
  return settings.mentionFrequency === 'off' ||
    settings.mentionFrequency === 'low' ||
    settings.mentionFrequency === 'medium' ||
    settings.mentionFrequency === 'high'
    ? settings.mentionFrequency
    : 'low'
}

function weatherCityOf(modules: ModuleSnapshot[]): string {
  const weather = modules.find((module) => module.id === 'weather')
  const settings = (weather?.settings ?? {}) as { city?: unknown }
  return typeof settings.city === 'string' ? settings.city : ''
}

/** 设置窗口：形象选择、共处记录、开机自启、重置记录 */
export function SettingsView() {
  const [snapshot, setSnapshot] = useState<SettingsSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dataMessage, setDataMessage] = useState<string | null>(null)
  const [moduleMessage, setModuleMessage] = useState<string | null>(null)
  const [modules, setModules] = useState<ModuleSnapshot[]>([])
  const [expandedModule, setExpandedModule] = useState<string | null>(null)
  const [reminders, setReminders] = useState<RemindersSnapshot | null>(null)
  const [pomodoroFocus, setPomodoroFocus] = useState(25)
  const [pomodoroBreak, setPomodoroBreak] = useState(5)
  const [claudeRange, setClaudeRange] = useState(30)
  const [claudeMention, setClaudeMention] = useState<ClaudeCodeMentionFrequency>('low')
  const [weatherCity, setWeatherCity] = useState('')
  const [weatherCandidates, setWeatherCandidates] = useState<WeatherCityCandidate[]>([])
  const [weatherMessage, setWeatherMessage] = useState<string | null>(null)
  const [weatherBusy, setWeatherBusy] = useState(false)
  const [reminderText, setReminderText] = useState('')
  const [reminderDate, setReminderDate] = useState(() =>
    localDateInput(Date.now() + 24 * 60 * 60 * 1000),
  )
  const [reminderTime, setReminderTime] = useState('09:00')
  const [resetArmed, setResetArmed] = useState(false)
  const resetTimer = useRef<number | null>(null)

  useEffect(() => {
    void (async () => {
      try {
        setSnapshot(await window.vivian.settings.get())
      } catch {
        setError('读取设置失败。')
      }

      try {
        const moduleList = await window.vivian.modules.list()
        setModules(moduleList)
        const draft = pomodoroDraft(moduleList)
        setPomodoroFocus(draft.focus)
        setPomodoroBreak(draft.rest)
        setClaudeRange(claudeCodeRange(moduleList))
        setClaudeMention(claudeCodeMention(moduleList))
        setWeatherCity(weatherCityOf(moduleList))
      } catch {
        // 模块系统尚未就绪时保持空列表，不影响其他设置
      }

      try {
        setReminders(await window.vivian.reminders.list())
      } catch {
        // 提醒模块关闭时不提供列表
      }
    })()

    const unsubscribe = window.vivian?.settings?.onSelectionChanged((selection: ImageSelection) => {
      setSnapshot((previous) =>
        previous
          ? {
              ...previous,
              imageMode: selection.mode,
              selectedImageId: selection.selectedImageId,
            }
          : previous,
      )
    })

    return () => {
      unsubscribe?.()
      if (resetTimer.current !== null) {
        window.clearTimeout(resetTimer.current)
      }
    }
  }, [])

  const toggleAutoLaunch = async (): Promise<void> => {
    if (!snapshot?.packaged) return
    try {
      setSnapshot(await window.vivian.settings.setAutoLaunch(!snapshot.autoLaunch))
      setError(null)
    } catch {
      setError('保存开机自启设置失败。')
    }
  }

  const toggleImageMode = async (): Promise<void> => {
    if (!snapshot) return
    const nextMode = snapshot.imageMode === 'cycle' ? 'fixed' : 'cycle'
    try {
      setSnapshot(await window.vivian.settings.setImageMode(nextMode))
      setError(null)
    } catch {
      setError('保存形象模式失败。')
    }
  }

  const toggleIdleAnimation = async (): Promise<void> => {
    if (!snapshot) return
    try {
      setSnapshot(await window.vivian.settings.setIdleAnimation(!snapshot.idleAnimation))
      setError(null)
    } catch {
      setError('保存待机动效设置失败。')
    }
  }

  const toggleProactiveLines = async (): Promise<void> => {
    if (!snapshot) return
    try {
      setSnapshot(await window.vivian.settings.setProactiveLines(!snapshot.proactiveLines))
      setError(null)
    } catch {
      setError('保存定时问候设置失败。')
    }
  }

  const toggleIdleReminder = async (): Promise<void> => {
    if (!snapshot) return
    try {
      setSnapshot(await window.vivian.settings.setIdleReminder(!snapshot.idleReminder))
      setError(null)
    } catch {
      setError('保存久坐提醒设置失败。')
    }
  }

  const toggleSleepReminder = async (): Promise<void> => {
    if (!snapshot) return
    try {
      setSnapshot(await window.vivian.settings.setSleepReminder(!snapshot.sleepReminder))
      setError(null)
    } catch {
      setError('保存深夜催睡设置失败。')
    }
  }

  const toggleEasterEggs = async (): Promise<void> => {
    if (!snapshot) return
    try {
      setSnapshot(await window.vivian.settings.setEasterEggs(!snapshot.easterEggs))
      setError(null)
    } catch {
      setError('保存彩蛋设置失败。')
    }
  }

  const toggleNightInteraction = async (): Promise<void> => {
    if (!snapshot) return
    try {
      setSnapshot(await window.vivian.settings.setNightInteraction(!snapshot.nightInteraction))
      setError(null)
    } catch {
      setError('保存夜间互动设置失败。')
    }
  }

  const toggleNightProactive = async (): Promise<void> => {
    if (!snapshot) return
    try {
      setSnapshot(await window.vivian.settings.setNightProactive(!snapshot.nightProactive))
      setError(null)
    } catch {
      setError('保存夜间问候设置失败。')
    }
  }

  const toggleChimeNight = async (): Promise<void> => {
    const chime = modules.find((module) => module.id === 'chime')
    const settings = (chime?.settings ?? {}) as { nightEnabled?: boolean }

    try {
      setModules(
        await window.vivian.modules.updateSettings('chime', {
          nightEnabled: settings.nightEnabled === false,
        }),
      )
      setError(null)
    } catch {
      setError('保存夜间报时设置失败。')
    }
  }

  const refreshReminders = async (): Promise<void> => {
    try {
      setReminders(await window.vivian.reminders.list())
    } catch {
      setReminders(null)
    }
  }

  const toggleModuleExpanded = (id: string): void => {
    const module = modules.find((entry) => entry.id === id)
    if (!module?.enabled) return
    setExpandedModule((current) => (current === id ? null : id))
  }

  const toggleModule = async (id: string): Promise<void> => {
    const module = modules.find((entry) => entry.id === id)
    if (!module) return
    const nextEnabled = !module.enabled

    try {
      setModules(await window.vivian.modules.setEnabled(id, nextEnabled))
      setExpandedModule((current) => (nextEnabled ? id : current === id ? null : current))
      setModuleMessage(null)
      setError(null)
      if (id === 'reminders') void refreshReminders()
    } catch {
      setError('保存模块开关失败。')
    }
  }

  const savePomodoroSettings = async (): Promise<void> => {
    try {
      setModules(
        await window.vivian.modules.updateSettings('pomodoro', {
          focusMinutes: pomodoroFocus,
          breakMinutes: pomodoroBreak,
        }),
      )
      setModuleMessage('番茄钟时长已保存，下次开始生效。')
      setError(null)
    } catch {
      setError('保存番茄钟时长失败。')
    }
  }

  const saveClaudeCodeRange = async (rangeDays: number): Promise<void> => {
    try {
      const moduleList = await window.vivian.modules.updateSettings('claude-code', { rangeDays })
      setModules(moduleList)
      setClaudeRange(claudeCodeRange(moduleList))
      setError(null)
    } catch {
      setError('保存 Claude Code 项目范围失败。')
    }
  }

  const saveClaudeCodeMention = async (frequency: ClaudeCodeMentionFrequency): Promise<void> => {
    try {
      const moduleList = await window.vivian.modules.updateSettings('claude-code', {
        mentionFrequency: frequency,
      })
      setModules(moduleList)
      setClaudeMention(claudeCodeMention(moduleList))
      setError(null)
    } catch {
      setError('保存 Claude Code 主动提及频率失败。')
    }
  }

  const searchWeatherCity = async (): Promise<void> => {
    const query = weatherCity.trim()
    if (!query) {
      setError('请先填写城市名。')
      return
    }

    setWeatherBusy(true)
    try {
      const candidates = await window.vivian.weather.searchCity(query)
      setWeatherCandidates(candidates)
      setWeatherMessage(candidates.length > 0 ? '请选择正确的城市。' : '没有找到这个城市。')
      setError(null)
    } catch {
      setError('搜索城市失败。')
    } finally {
      setWeatherBusy(false)
    }
  }

  const selectWeatherCity = async (candidate: WeatherCityCandidate): Promise<void> => {
    setWeatherBusy(true)
    try {
      await window.vivian.weather.selectCity(candidate)
      const moduleList = await window.vivian.modules.list()
      setModules(moduleList)
      setWeatherCity(weatherCityOf(moduleList))
      setWeatherCandidates([])
      setWeatherMessage('天气城市已保存。')
      setError(null)
    } catch {
      setError('保存天气城市失败。')
    } finally {
      setWeatherBusy(false)
    }
  }

  const addReminder = async (): Promise<void> => {
    const dueAt = new Date(`${reminderDate}T${reminderTime}:00`).getTime()
    const text = reminderText.trim()

    if (!text) {
      setError('提醒内容不能为空。')
      return
    }
    if (!Number.isFinite(dueAt)) {
      setError('提醒时间无效。')
      return
    }
    if (dueAt <= Date.now()) {
      setError('提醒时间需要晚于现在。')
      return
    }

    try {
      setReminders(await window.vivian.reminders.add({ text, dueAt }))
      setReminderText('')
      setError(null)
    } catch {
      setError('添加提醒失败。')
    }
  }

  const removeReminder = async (id: string): Promise<void> => {
    try {
      setReminders(await window.vivian.reminders.remove(id))
      setError(null)
    } catch {
      setError('删除提醒失败。')
    }
  }

  const handleExport = async (): Promise<void> => {
    try {
      const result = await window.vivian.data.exportBackup()
      if (result.canceled) return
      if (result.error) {
        setError(result.error)
        setDataMessage(null)
        return
      }
      setError(null)
      setDataMessage('备份已导出。')
    } catch {
      setError('导出备份失败。')
    }
  }

  const handleImport = async (): Promise<void> => {
    try {
      const result = await window.vivian.data.importBackup()
      if (result.canceled) return
      if (result.error) {
        setError(result.error)
        setDataMessage(null)
        return
      }
      setSnapshot(await window.vivian.settings.get())
      try {
        const moduleList = await window.vivian.modules.list()
        setModules(moduleList)
        const draft = pomodoroDraft(moduleList)
        setPomodoroFocus(draft.focus)
        setPomodoroBreak(draft.rest)
        setClaudeRange(claudeCodeRange(moduleList))
        setClaudeMention(claudeCodeMention(moduleList))
        setWeatherCity(weatherCityOf(moduleList))
      } catch {
        // 模块列表刷新失败不影响导入结果
      }
      void refreshReminders()
      setError(null)
      setDataMessage('备份已导入，共处记录、记忆与模块数据已更新。')
    } catch {
      setError('导入备份失败。')
    }
  }

  const selectImage = async (imageId: string): Promise<void> => {
    try {
      setSnapshot(await window.vivian.settings.setImage(imageId))
      setError(null)
    } catch {
      setError('保存形象选择失败。')
    }
  }

  // 形象画廊是 listbox：方向键移动焦点，Enter / Space 由按钮本身完成选择
  const handleGalleryKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
      return
    }

    const options = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>('.image-option'),
    )
    if (options.length === 0) return

    event.preventDefault()
    const focused = options.indexOf(document.activeElement as HTMLButtonElement)
    const start = Math.max(focused, 0)

    let next = start
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      next = (start + 1) % options.length
    }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      next = (start - 1 + options.length) % options.length
    }
    if (event.key === 'Home') next = 0
    if (event.key === 'End') next = options.length - 1

    options[next].focus()
  }

  const handleReset = async (): Promise<void> => {
    if (!resetArmed) {
      setResetArmed(true)
      if (resetTimer.current !== null) window.clearTimeout(resetTimer.current)
      resetTimer.current = window.setTimeout(() => {
        setResetArmed(false)
        resetTimer.current = null
      }, 3000)
      return
    }

    if (resetTimer.current !== null) {
      window.clearTimeout(resetTimer.current)
      resetTimer.current = null
    }
    setResetArmed(false)

    try {
      setSnapshot(await window.vivian.settings.resetCoWork())
      setError(null)
    } catch {
      setError('重置共处记录失败。')
    }
  }

  if (!snapshot) {
    return (
      <main className="settings-stage">
        <p className="settings-loading" role="status">
          {!error && <span className="settings-spinner" aria-hidden="true" />}
          {error ?? '正在整理记录…'}
        </p>
      </main>
    )
  }

  const canCycleImages = STATIC_IMAGES.length > 1
  const cycling = canCycleImages && snapshot.imageMode === 'cycle'
  const pendingReminders = (reminders?.items ?? []).filter((item) => !item.done && !item.completed)
  const chimeModule = modules.find((module) => module.id === 'chime')
  const chimeSettings = (chimeModule?.settings ?? {}) as { nightEnabled?: boolean }
  const chimeNightEnabled = chimeSettings.nightEnabled !== false

  return (
    <main className="settings-stage">
      <header className="settings-header">
        <p className="settings-eyebrow">VIVIAN BANSHEE</p>
        <h1 className="settings-title">设置</h1>
        <p className="settings-subtitle">与法厄同大人的共处记录</p>
      </header>

      {snapshot.lastRunCrashed && (
        <p className="settings-notice" role="status">
          上次运行没有正常退出。日志已保存到她数据目录的 logs 文件夹里。
        </p>
      )}

      <div className="settings-section">
        <div className="settings-section-head">
          <h2>形象与互动</h2>
          <small>形象、待机与问候</small>
        </div>
        <section className="settings-card">
          <div className="settings-row settings-row--switch">
            <div>
              <span>双击切换形象</span>
              <small>
                {!canCycleImages
                  ? '当前没有可切换的形象'
                  : cycling
                    ? '双击宠物在形象间循环'
                    : '固定显示选中的形象'}
              </small>
            </div>
            <button
              type="button"
              className={`switch${cycling ? ' switch--on' : ''}`}
              role="switch"
              aria-checked={cycling}
              aria-label="双击切换形象"
              disabled={!canCycleImages}
              onClick={() => void toggleImageMode()}
            >
              <span />
            </button>
          </div>

          <div className="settings-row settings-row--switch">
            <div>
              <span>待机微动效</span>
              <small>
                {snapshot.idleAnimation
                  ? '轻微呼吸与摇摆；关闭即恢复完全静态'
                  : '当前为完全静态模式（P3.0 表现）'}
              </small>
            </div>
            <button
              type="button"
              className={`switch${snapshot.idleAnimation ? ' switch--on' : ''}`}
              role="switch"
              aria-checked={snapshot.idleAnimation}
              aria-label="待机微动效"
              onClick={() => void toggleIdleAnimation()}
            >
              <span />
            </button>
          </div>

          <div className="settings-row settings-row--switch">
            <div>
              <span>定时主动问候</span>
              <small>
                {snapshot.proactiveLines
                  ? '每 30–60 分钟轻声一句；夜间是否出现见「夜间互动」'
                  : '默认关闭；开启后薇薇安会偶尔主动开口'}
              </small>
            </div>
            <button
              type="button"
              className={`switch${snapshot.proactiveLines ? ' switch--on' : ''}`}
              role="switch"
              aria-checked={snapshot.proactiveLines}
              aria-label="定时主动问候"
              onClick={() => void toggleProactiveLines()}
            >
              <span />
            </button>
          </div>

          <div
            className="image-gallery"
            role="listbox"
            aria-label="形象选择"
            onKeyDown={handleGalleryKeyDown}
          >
            {STATIC_IMAGES.map((image) => (
              <button
                key={image.id}
                type="button"
                className={`image-option${
                  snapshot.selectedImageId === image.id ? ' image-option--selected' : ''
                }`}
                role="option"
                aria-selected={snapshot.selectedImageId === image.id}
                onClick={() => void selectImage(image.id)}
              >
                <img src={image.url} alt={image.label} />
                <span>{image.label}</span>
              </button>
            ))}
          </div>

          {STATIC_IMAGES.length === 0 && (
            <p className="settings-hint">
              源码版本不包含角色美术。将 7 张图放入 assets/characters/&lt;set&gt;/
              后重新构建，或使用官方 Release。
            </p>
          )}
        </section>
      </div>

      <div className="settings-section">
        <div className="settings-section-head">
          <h2>模块</h2>
          <small>按需开启；点击模块名展开配置</small>
        </div>
        <section className="settings-card">
          {modules.map((module) => (
            <div key={module.id} className="module-item">
              <div className="settings-row settings-row--switch module-row">
                <button
                  type="button"
                  className="module-toggle"
                  aria-expanded={expandedModule === module.id && module.enabled}
                  aria-controls={`module-config-${module.id}`}
                  disabled={!module.enabled}
                  onClick={() => toggleModuleExpanded(module.id)}
                >
                  <span className="module-copy">
                    <span>{module.title}</span>
                    <small>{module.description}</small>
                  </span>
                  <span
                    className={`module-chevron${
                      expandedModule === module.id && module.enabled ? ' module-chevron--open' : ''
                    }`}
                    aria-hidden="true"
                  >
                    ▸
                  </span>
                </button>
                <button
                  type="button"
                  className={`switch${module.enabled ? ' switch--on' : ''}`}
                  role="switch"
                  aria-checked={module.enabled}
                  aria-label={module.title}
                  onClick={() => void toggleModule(module.id)}
                >
                  <span />
                </button>
              </div>

              {module.enabled && (
                <div
                  id={`module-config-${module.id}`}
                  className="module-config-group"
                  hidden={expandedModule !== module.id}
                >
                  {module.id === 'pomodoro' && module.enabled && (
                    <div className="module-config">
                      <div className="module-fields">
                        <label>
                          专注
                          <input
                            type="number"
                            min={5}
                            max={60}
                            value={pomodoroFocus}
                            onChange={(event) => setPomodoroFocus(Number(event.target.value))}
                          />
                          分钟
                        </label>
                        <label>
                          休息
                          <input
                            type="number"
                            min={1}
                            max={30}
                            value={pomodoroBreak}
                            onChange={(event) => setPomodoroBreak(Number(event.target.value))}
                          />
                          分钟
                        </label>
                      </div>
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={() => void savePomodoroSettings()}
                      >
                        保存时长
                      </button>
                    </div>
                  )}

                  {module.id === 'reminders' && module.enabled && (
                    <div className="module-config">
                      <div className="reminder-form">
                        <input
                          type="date"
                          value={reminderDate}
                          aria-label="提醒日期"
                          onChange={(event) => setReminderDate(event.target.value)}
                        />
                        <input
                          type="time"
                          value={reminderTime}
                          aria-label="提醒时间"
                          onChange={(event) => setReminderTime(event.target.value)}
                        />
                        <input
                          type="text"
                          maxLength={60}
                          placeholder="提醒内容（最多 60 字）"
                          value={reminderText}
                          aria-label="提醒内容"
                          onChange={(event) => setReminderText(event.target.value)}
                        />
                        <button
                          type="button"
                          className="ghost-button"
                          onClick={() => void addReminder()}
                        >
                          添加提醒
                        </button>
                      </div>

                      {pendingReminders.length > 0 ? (
                        <ul className="reminder-list">
                          {pendingReminders.map((item) => (
                            <li key={item.id}>
                              <span>{formatDate(item.dueAt)}</span>
                              <span>{item.text}</span>
                              <button
                                type="button"
                                className="ghost-button"
                                onClick={() => void removeReminder(item.id)}
                              >
                                删除
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="settings-hint">还没有待提醒的事项。</p>
                      )}
                    </div>
                  )}

                  {module.id === 'claude-code' && module.enabled && (
                    <div className="module-config">
                      <div className="module-fields">
                        <label>
                          项目范围
                          <select
                            value={claudeRange}
                            aria-label="Claude Code 项目范围"
                            onChange={(event) =>
                              void saveClaudeCodeRange(Number(event.target.value))
                            }
                          >
                            <option value={7}>最近 7 天</option>
                            <option value={30}>最近 30 天</option>
                            <option value={0}>全部</option>
                          </select>
                        </label>
                        <label>
                          主动提及
                          <select
                            value={claudeMention}
                            aria-label="Claude Code 主动提及频率"
                            onChange={(event) =>
                              void saveClaudeCodeMention(
                                event.target.value as ClaudeCodeMentionFrequency,
                              )
                            }
                          >
                            <option value="off">关闭</option>
                            <option value="low">低（10%）</option>
                            <option value="medium">中（25%）</option>
                            <option value="high">高（40%）</option>
                          </select>
                        </label>
                      </div>
                      <p className="settings-hint">
                        功能面板最多显示 5 个最近活跃项目，每个项目 5 个最近会话；只读元数据。
                      </p>
                      <p className="settings-hint">
                        主动提及每分钟最多 1 次、每小时最多 3 次；只说项目名、时间与会话数。
                      </p>
                    </div>
                  )}

                  {module.id === 'weather' && module.enabled && (
                    <div className="module-config">
                      <div className="module-fields">
                        <label>
                          城市
                          <input
                            type="text"
                            maxLength={40}
                            placeholder="如 上海"
                            value={weatherCity}
                            aria-label="天气城市"
                            onChange={(event) => {
                              setWeatherCity(event.target.value)
                              setWeatherCandidates([])
                              setWeatherMessage(null)
                            }}
                          />
                        </label>
                        <button
                          type="button"
                          className="ghost-button"
                          disabled={weatherBusy}
                          onClick={() => void searchWeatherCity()}
                        >
                          {weatherBusy ? '查询中…' : '搜索城市'}
                        </button>
                      </div>

                      {weatherMessage && <p className="settings-hint">{weatherMessage}</p>}

                      {weatherCandidates.length > 0 && (
                        <div className="weather-candidates">
                          {weatherCandidates.map((candidate) => (
                            <button
                              key={candidate.id}
                              type="button"
                              className="weather-candidate"
                              disabled={weatherBusy}
                              onClick={() => void selectWeatherCity(candidate)}
                            >
                              <span>{candidate.name}</span>
                              <small>
                                {[candidate.admin1, candidate.country].filter(Boolean).join(' · ')}
                              </small>
                            </button>
                          ))}
                        </div>
                      )}

                      <p className="settings-hint">
                        天气数据由 Open-Meteo 提供；重名城市请选择正确候选。
                      </p>
                    </div>
                  )}

                  {module.id === 'chime' && module.enabled && (
                    <p className="settings-hint">
                      全天 24 小时整点报时；23:00–08:00 由「夜间互动」中的子开关管理。
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}

          {modules.length === 0 && <p className="settings-hint">正在读取模块…</p>}
          {moduleMessage && <p className="settings-hint">{moduleMessage}</p>}
        </section>
      </div>

      <div className="settings-section">
        <div className="settings-section-head">
          <h2>作息与夜间</h2>
          <small>久坐、彩蛋与夜间门控</small>
        </div>
        <section className="settings-card">
          <div className="settings-row settings-row--switch">
            <div>
              <span>久坐提醒</span>
              <small>
                {snapshot.idleReminder
                  ? '连续在电脑前 60 分钟时提醒起身；休息 5 分钟重置'
                  : '已关闭；不会提醒起身'}
              </small>
            </div>
            <button
              type="button"
              className={`switch${snapshot.idleReminder ? ' switch--on' : ''}`}
              role="switch"
              aria-checked={snapshot.idleReminder}
              aria-label="久坐提醒"
              onClick={() => void toggleIdleReminder()}
            >
              <span />
            </button>
          </div>

          <div className="settings-row settings-row--switch">
            <div>
              <span>彩蛋</span>
              <small>
                {snapshot.easterEggs
                  ? '纪念日与第 100 次互动时，会出现专属台词'
                  : '已关闭；不会触发里程碑彩蛋'}
              </small>
            </div>
            <button
              type="button"
              className={`switch${snapshot.easterEggs ? ' switch--on' : ''}`}
              role="switch"
              aria-checked={snapshot.easterEggs}
              aria-label="彩蛋"
              onClick={() => void toggleEasterEggs()}
            >
              <span />
            </button>
          </div>
        </section>

        <section className="settings-card">
          <div className="settings-row settings-row--switch">
            <div>
              <span>夜间互动</span>
              <small>
                {snapshot.nightInteraction
                  ? '23:00–08:00 的主动开口总开关；可在下面单独关闭子项'
                  : '已关闭；23:00–08:00 不主动开口'}
              </small>
            </div>
            <button
              type="button"
              className={`switch${snapshot.nightInteraction ? ' switch--on' : ''}`}
              role="switch"
              aria-checked={snapshot.nightInteraction}
              aria-label="夜间互动"
              onClick={() => void toggleNightInteraction()}
            >
              <span />
            </button>
          </div>

          {snapshot.nightInteraction && (
            <>
              <div className="settings-row settings-row--switch settings-row--child">
                <div>
                  <span>定时主动问候</span>
                  <small>
                    {snapshot.proactiveLines
                      ? '23:00–08:00 是否允许定时问候'
                      : '需先在「定时主动问候」中开启'}
                  </small>
                </div>
                <button
                  type="button"
                  className={`switch${snapshot.nightProactive ? ' switch--on' : ''}`}
                  role="switch"
                  aria-checked={snapshot.nightProactive}
                  aria-label="夜间定时主动问候"
                  disabled={!snapshot.proactiveLines}
                  onClick={() => void toggleNightProactive()}
                >
                  <span />
                </button>
              </div>

              <div className="settings-row settings-row--switch settings-row--child">
                <div>
                  <span>整点报时</span>
                  <small>
                    {chimeModule?.enabled
                      ? '23:00–08:00 是否允许整点报时'
                      : '需先在「模块」中开启整点报时'}
                  </small>
                </div>
                <button
                  type="button"
                  className={`switch${chimeNightEnabled ? ' switch--on' : ''}`}
                  role="switch"
                  aria-checked={chimeNightEnabled}
                  aria-label="夜间整点报时"
                  disabled={!chimeModule?.enabled}
                  onClick={() => void toggleChimeNight()}
                >
                  <span />
                </button>
              </div>

              <div className="settings-row settings-row--switch settings-row--child">
                <div>
                  <span>深夜催睡</span>
                  <small>23:30–05:00 的休息提醒；关闭后夜间不催睡</small>
                </div>
                <button
                  type="button"
                  className={`switch${snapshot.sleepReminder ? ' switch--on' : ''}`}
                  role="switch"
                  aria-checked={snapshot.sleepReminder}
                  aria-label="夜间催睡"
                  onClick={() => void toggleSleepReminder()}
                >
                  <span />
                </button>
              </div>
            </>
          )}
        </section>
      </div>

      <div className="settings-section">
        <div className="settings-section-head">
          <h2>数据与关于</h2>
          <small>共处记录、自启、备份与版本</small>
        </div>
        <section className="settings-card">
          <div className="settings-row">
            <span>一起度过的</span>
            <strong>第 {snapshot.daysTogether} 天</strong>
          </div>
          <div className="settings-row">
            <span>互动次数</span>
            <strong>{snapshot.coWork.interactionCount} 次</strong>
          </div>
          <div className="settings-row settings-row--muted">
            <span>首次见面</span>
            <strong>{formatDate(snapshot.coWork.firstMetAt)}</strong>
          </div>
        </section>

        <section className="settings-card">
          <div className="settings-row settings-row--switch">
            <div>
              <span>开机自启</span>
              <small>
                {snapshot.packaged
                  ? '随系统启动，让薇薇安在桌面上等您'
                  : '打包版生效；开发模式不写入注册表'}
              </small>
            </div>
            <button
              type="button"
              className={`switch${snapshot.autoLaunch ? ' switch--on' : ''}`}
              role="switch"
              aria-checked={snapshot.autoLaunch}
              aria-label="开机自启"
              disabled={!snapshot.packaged}
              onClick={() => void toggleAutoLaunch()}
            >
              <span />
            </button>
          </div>
        </section>

        <section className="settings-card">
          <div className="settings-row">
            <div>
              <span>数据备份</span>
              <small>导出设置、共处记录与记忆；导入前会自动备份当前数据</small>
            </div>
            <div className="settings-actions">
              <button type="button" className="ghost-button" onClick={() => void handleExport()}>
                导出
              </button>
              <button type="button" className="ghost-button" onClick={() => void handleImport()}>
                导入
              </button>
            </div>
          </div>
          {dataMessage && <p className="settings-hint">{dataMessage}</p>}
        </section>

        <section className="settings-card">
          <div className="settings-row">
            <span>版本</span>
            <strong>v{snapshot.version}</strong>
          </div>
          <div className="settings-row">
            <div>
              <span>性质</span>
              <small>非商业同人作品；官方版角色美术由抖音@星穹列车星某非商用授权</small>
            </div>
          </div>
          <div className="settings-row">
            <div>
              <span>字体</span>
              <small>标题 Noto Serif SC（SIL OFL 1.1）；正文系统 UI</small>
            </div>
          </div>
          <div className="settings-row">
            <div>
              <span>数据</span>
              <small>设置、共处记录与日志只保存在本机</small>
            </div>
          </div>
        </section>

        <section className="settings-card settings-card--danger">
          <div className="settings-row">
            <div>
              <span>重置共处记录</span>
              <small>首次见面、互动次数与记忆里程碑将一并清空</small>
            </div>
            <button type="button" className="danger-button" onClick={() => void handleReset()}>
              {resetArmed ? '再点一次确认' : '重置'}
            </button>
          </div>
        </section>
      </div>

      {error && <p className="settings-error">{error}</p>}

      <footer className="settings-footer">薇薇安桌宠 · v{snapshot.version} · 非商业同人作品</footer>
    </main>
  )
}
