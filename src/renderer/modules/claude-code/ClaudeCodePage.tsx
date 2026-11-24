import { useCallback, useEffect, useState } from 'react'
import type { ClaudeCodeOpenResult, ClaudeCodeSnapshot } from '../../../shared/ipc'
import { UiIcon } from '../../ui/panelIcons'
import { PanelState, RefreshButton } from '../../ui/panelParts'

const REFRESH_INTERVAL_MS = 5 * 60 * 1000

function formatActiveAt(timestamp: number, now = Date.now()): string {
  const diff = Math.max(0, now - timestamp)
  if (diff < 60_000) return '刚刚'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`

  return new Date(timestamp).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Claude Code · 最近项目：只展示元数据，不读取对话内容 */
export function ClaudeCodePage() {
  const [snapshot, setSnapshot] = useState<ClaudeCodeSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [expandedProjectId, setExpandedProjectId] = useState<string | null>(null)
  const [actionKey, setActionKey] = useState<string | null>(null)
  const [actionMessage, setActionMessage] = useState('')

  const load = useCallback(async (refresh: boolean): Promise<void> => {
    if (refresh) setRefreshing(true)

    try {
      const data = await window.vivian.claudeCode.getSnapshot({ refresh })
      setSnapshot(data)
      setError(null)
    } catch {
      setError('读取 Claude Code 记录失败。')
    } finally {
      if (refresh) setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void load(true)

    // 面板隐藏时不扫描；重新可见时立即刷新
    const refreshIfVisible = (): void => {
      if (document.visibilityState === 'visible') void load(true)
    }
    const refreshOnFocus = (): void => {
      if (document.visibilityState === 'visible') void load(false)
    }
    const timer = window.setInterval(refreshIfVisible, REFRESH_INTERVAL_MS)
    document.addEventListener('visibilitychange', refreshIfVisible)
    window.addEventListener('focus', refreshOnFocus)

    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', refreshIfVisible)
      window.removeEventListener('focus', refreshOnFocus)
    }
  }, [load])

  const runOpen = useCallback(
    async (key: string, successText: string, action: () => Promise<ClaudeCodeOpenResult>) => {
      setActionKey(key)
      setActionMessage('')

      try {
        const result = await action()
        setActionMessage(
          result.message ||
            (result.sessionOpened || result.folderOpened ? successText : '打开失败，请稍后再试。'),
        )
      } catch {
        setActionMessage('打开失败，请稍后再试。')
      } finally {
        setActionKey(null)
      }
    },
    [],
  )

  if (error && !snapshot) {
    return (
      <PanelState
        kind="error"
        title={error}
        hint="请确认本机 Claude Code 数据目录可读，然后重试。"
        action={{ label: '重试', onClick: () => void load(true), disabled: refreshing }}
      />
    )
  }

  if (!snapshot) {
    return <PanelState kind="loading" title="正在整理最近的项目…" hint="只读取本机元数据。" />
  }

  const projects = snapshot.projects
  const busy = actionKey !== null
  const hasDerivedNames = projects.some((project) =>
    project.sessions.some((session) => session.nameSource === 'derived'),
  )

  return (
    <div>
      <div className="panel-toolbar">
        <span className="panel-updated">
          {snapshot.scannedAt > 0 ? `更新于 ${formatActiveAt(snapshot.scannedAt)}` : '尚未扫描'}
        </span>
        <RefreshButton busy={refreshing} onClick={() => void load(true)} />
      </div>

      {error && (
        <p className="panel-error" role="alert">
          {error}
        </p>
      )}
      {actionMessage && (
        <p className="panel-action-message" role="status">
          {actionMessage}
        </p>
      )}

      {projects.length === 0 ? (
        <PanelState
          kind="empty"
          title="现在还没有可展示的项目。"
          hint="等法厄同大人开始工作，薇薇安会把最近的记录放在这里。"
        />
      ) : (
        <>
          <ul className="panel-project-list">
            {projects.map((project) => {
              const expanded = project.id === expandedProjectId

              return (
                <li key={project.id} className="panel-project">
                  <div className="panel-project-header">
                    <button
                      type="button"
                      className={`panel-project-toggle${expanded ? ' panel-project-toggle--open' : ''}`}
                      aria-expanded={expanded}
                      onClick={() => setExpandedProjectId(expanded ? null : project.id)}
                    >
                      <span className="panel-project-icon" aria-hidden="true">
                        <UiIcon name="folder" size={17} />
                      </span>
                      <span className="panel-project-main">
                        <span className="panel-project-name">{project.displayName}</span>
                        <span className="panel-project-meta">
                          {project.sessionCount} 个会话 · {formatActiveAt(project.lastActiveAt)}
                        </span>
                      </span>
                      <span className="panel-project-chevron" aria-hidden="true">
                        <UiIcon name="chevron" size={15} />
                      </span>
                    </button>
                    <button
                      type="button"
                      className="ghost-button panel-project-open"
                      disabled={busy}
                      onClick={() =>
                        void runOpen(`project:${project.id}`, '已在 VSCode 中打开项目。', () =>
                          window.vivian.claudeCode.openProject(project.id),
                        )
                      }
                    >
                      <UiIcon name="external" size={14} />
                      <span>{actionKey === `project:${project.id}` ? '打开…' : '打开'}</span>
                    </button>
                  </div>

                  {expanded && (
                    <ul className="panel-session-list">
                      {project.sessions.map((session) => (
                        <li key={session.id} className="panel-session">
                          <button
                            type="button"
                            className="panel-session-button"
                            disabled={busy}
                            aria-label={`在 VSCode 中打开会话 ${session.displayName}`}
                            title={session.id}
                            onClick={() =>
                              void runOpen(
                                `session:${session.id}`,
                                '已在 VSCode 中打开对话。',
                                () => window.vivian.claudeCode.openSession(project.id, session.id),
                              )
                            }
                          >
                            <span className="panel-session-dot" aria-hidden="true" />
                            <span className="panel-session-label">
                              <span className="panel-session-name">{session.displayName}</span>
                              {session.nameSource === 'derived' && (
                                <span
                                  className="panel-session-badge"
                                  title="由 Claude Code 自动派生，可用 /rename 自定义"
                                >
                                  自动命名
                                </span>
                              )}
                            </span>
                            <span className="panel-session-time">
                              {actionKey === `session:${session.id}`
                                ? '打开中…'
                                : formatActiveAt(session.lastActiveAt)}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              )
            })}
          </ul>

          <p className="panel-hint">
            如果对话没有打开，请确认已安装 Claude Code VSCode 扩展，或在终端运行 claude --resume
            会话 id。
          </p>
          {hasDerivedNames && (
            <p className="panel-hint">标注「自动命名」的会话可在输入框用 /rename 改成可读标题。</p>
          )}
        </>
      )}
    </div>
  )
}
