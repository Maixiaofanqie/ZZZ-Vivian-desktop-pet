import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { RemindersSnapshot } from '../../../shared/ipc'
import { UiIcon } from '../../ui/panelIcons'
import { PanelState, RefreshButton } from '../../ui/panelParts'

const REMINDER_TEXT_MAX = 60

function localDateInput(timestamp: number): string {
  const date = new Date(timestamp)
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function formatDueParts(timestamp: number): { date: string; time: string } {
  const date = new Date(timestamp)
  const pad = (value: number): string => String(value).padStart(2, '0')
  return {
    date: `${pad(date.getMonth() + 1)}/${pad(date.getDate())}`,
    time: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
  }
}

/** 日程 · 待办：复用提醒模块数据，支持面板内快捷添加、完成勾选与筛选 */
export function RemindersPanelPage() {
  const [snapshot, setSnapshot] = useState<RemindersSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [filter, setFilter] = useState<'pending' | 'done'>('pending')
  const [text, setText] = useState('')
  const [date, setDate] = useState(() => localDateInput(Date.now() + 24 * 60 * 60 * 1000))
  const [time, setTime] = useState('09:00')
  // 勾选动画期间先本地翻转状态，等退场动画结束后再提交快照
  const [completedOverrides, setCompletedOverrides] = useState<Record<string, boolean>>({})
  const [leaving, setLeaving] = useState<Record<string, true>>({})
  const timersRef = useRef<number[]>([])

  const load = useCallback(async (): Promise<void> => {
    try {
      setSnapshot(await window.vivian.reminders.list())
      setError(null)
    } catch {
      setError('读取提醒失败。')
    }
  }, [])

  useEffect(() => {
    void load()

    const refreshIfVisible = (): void => {
      if (document.visibilityState === 'visible') void load()
    }
    const refreshOnFocus = (): void => {
      void load()
    }
    const timer = window.setInterval(refreshIfVisible, 30_000)
    document.addEventListener('visibilitychange', refreshIfVisible)
    window.addEventListener('focus', refreshOnFocus)

    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', refreshIfVisible)
      window.removeEventListener('focus', refreshOnFocus)
    }
  }, [load])

  useEffect(() => {
    return () => {
      for (const id of timersRef.current) window.clearTimeout(id)
      timersRef.current = []
    }
  }, [])

  const refresh = async (): Promise<void> => {
    setRefreshing(true)
    try {
      await load()
    } finally {
      setRefreshing(false)
    }
  }

  const pending = useMemo(
    () =>
      (snapshot?.items ?? [])
        .filter((item) => !item.done && !item.completed)
        .sort((a, b) => a.dueAt - b.dueAt),
    [snapshot],
  )
  const completed = useMemo(
    () =>
      (snapshot?.items ?? [])
        .filter((item) => item.completed && !item.done)
        .sort((a, b) => b.dueAt - a.dueAt),
    [snapshot],
  )
  const visible = filter === 'pending' ? pending : completed

  const isCompleted = (item: RemindersSnapshot['items'][number]): boolean =>
    completedOverrides[item.id] ?? item.completed

  const addReminder = async (): Promise<void> => {
    const content = text.trim()
    const dueAt = new Date(`${date}T${time}:00`).getTime()

    if (!content) {
      setError('待办内容不能为空。')
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

    setBusy(true)
    try {
      setSnapshot(await window.vivian.reminders.add({ text: content, dueAt }))
      setText('')
      setFilter('pending')
      setError(null)
    } catch {
      setError('添加待办失败。')
    } finally {
      setBusy(false)
    }
  }

  const removeReminder = async (id: string): Promise<void> => {
    setBusy(true)
    try {
      setSnapshot(await window.vivian.reminders.remove(id))
      setError(null)
    } catch {
      setError('删除待办失败。')
    } finally {
      setBusy(false)
    }
  }

  const toggleCompleted = (item: RemindersSnapshot['items'][number]): void => {
    if (busy) return

    const next = !isCompleted(item)

    // 减少动效：不等待退场动画，直接提交
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setBusy(true)
      void (async () => {
        try {
          setSnapshot(await window.vivian.reminders.setCompleted(item.id, next))
          setError(null)
        } catch {
          setError('更新待办状态失败。')
        } finally {
          setBusy(false)
        }
      })()
      return
    }

    setCompletedOverrides((prev) => ({ ...prev, [item.id]: next }))
    setBusy(true)

    const leaveTimer = window.setTimeout(() => {
      setLeaving((prev) => ({ ...prev, [item.id]: true }))
    }, 180)
    timersRef.current.push(leaveTimer)

    void (async () => {
      try {
        // 至少保留 360ms，让勾选/取消勾选动画与退场动画都看得见
        const [nextSnapshot] = await Promise.all([
          window.vivian.reminders.setCompleted(item.id, next),
          new Promise<void>((resolve) => {
            window.setTimeout(resolve, 360)
          }),
        ])
        setSnapshot(nextSnapshot)
        setError(null)
      } catch {
        setError('更新待办状态失败。')
      } finally {
        window.clearTimeout(leaveTimer)
        timersRef.current = timersRef.current.filter((id) => id !== leaveTimer)
        setCompletedOverrides((prev) => {
          const copy = { ...prev }
          delete copy[item.id]
          return copy
        })
        setLeaving((prev) => {
          const copy = { ...prev }
          delete copy[item.id]
          return copy
        })
        setBusy(false)
      }
    })()
  }

  return (
    <div>
      <div className="panel-toolbar">
        <fieldset className="panel-filter" aria-label="待办筛选">
          <button
            type="button"
            className={`panel-filter-button${
              filter === 'pending' ? ' panel-filter-button--active' : ''
            }`}
            aria-pressed={filter === 'pending'}
            disabled={busy}
            onClick={() => setFilter('pending')}
          >
            未完成 <span className="panel-filter-count">{pending.length}</span>
          </button>
          <button
            type="button"
            className={`panel-filter-button${filter === 'done' ? ' panel-filter-button--active' : ''}`}
            aria-pressed={filter === 'done'}
            disabled={busy}
            onClick={() => setFilter('done')}
          >
            已完成 <span className="panel-filter-count">{completed.length}</span>
          </button>
        </fieldset>
        <RefreshButton busy={refreshing} onClick={() => void refresh()} />
      </div>

      <div className="panel-reminder-form">
        <input
          type="date"
          value={date}
          aria-label="待办日期"
          onChange={(event) => setDate(event.target.value)}
        />
        <input
          type="time"
          value={time}
          aria-label="待办时间"
          onChange={(event) => setTime(event.target.value)}
        />
        <input
          type="text"
          maxLength={REMINDER_TEXT_MAX}
          placeholder="待办内容（最多 60 字）"
          value={text}
          aria-label="待办内容"
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !busy) void addReminder()
          }}
        />
        <button
          type="button"
          className="ghost-button panel-reminder-add"
          disabled={busy}
          onClick={() => void addReminder()}
        >
          <UiIcon name="plus" size={14} />
          <span>{busy ? '处理中…' : '添加'}</span>
        </button>
      </div>

      {error && snapshot !== null && (
        <p className="panel-error" role="alert">
          {error}
        </p>
      )}

      {snapshot === null ? (
        error ? (
          <PanelState
            kind="error"
            title={error}
            hint="请稍后重试；待办与提醒模块共用数据。"
            action={{ label: '重试', onClick: () => void load() }}
          />
        ) : (
          <PanelState kind="loading" title="正在整理日程…" hint="读取未完成与已完成的提醒。" />
        )
      ) : visible.length === 0 ? (
        <PanelState
          kind="empty"
          title={filter === 'pending' ? '现在没有待办。' : '还没有已完成的待办。'}
          hint={
            filter === 'pending'
              ? '在上方填写内容与时间，就能添加一条提醒。'
              : '勾选完成的事项会出现在这里。'
          }
        />
      ) : (
        <ul className="panel-reminder-list">
          {visible.map((item) => {
            const due = formatDueParts(item.dueAt)

            return (
              <li
                key={item.id}
                className={`panel-reminder${isCompleted(item) ? ' panel-reminder--done' : ''}${
                  leaving[item.id] ? ' panel-reminder--leaving' : ''
                }`}
              >
                <input
                  type="checkbox"
                  className="panel-reminder-check"
                  checked={isCompleted(item)}
                  aria-label={
                    isCompleted(item) ? `取消完成：${item.text}` : `标记完成：${item.text}`
                  }
                  title={isCompleted(item) ? '取消完成' : '标记完成'}
                  disabled={busy}
                  onChange={() => toggleCompleted(item)}
                />
                <span className="panel-reminder-when">
                  <span className="panel-reminder-date">{due.date}</span>
                  <span className="panel-reminder-clock">{due.time}</span>
                </span>
                <span className="panel-reminder-text">{item.text}</span>
                <button
                  type="button"
                  className="panel-reminder-delete"
                  disabled={busy}
                  aria-label={`删除待办：${item.text}`}
                  title="删除待办"
                  onClick={() => void removeReminder(item.id)}
                >
                  <UiIcon name="trash" size={15} />
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {!snapshot?.enabled && snapshot !== null && (
        <p className="panel-hint">提醒模块当前关闭，新待办不会触发提醒。</p>
      )}
    </div>
  )
}
