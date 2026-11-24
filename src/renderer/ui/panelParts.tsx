import { UiIcon } from './panelIcons'

/**
 * 功能面板的共用状态块：加载、空、错误使用同一套结构与留白，
 * 各页面只替换文案与重试动作。
 */
export function PanelState({
  kind,
  title,
  hint,
  action,
}: {
  kind: 'loading' | 'empty' | 'error'
  title: string
  hint?: string
  action?: { label: string; onClick: () => void; disabled?: boolean }
}) {
  return (
    <div
      className={`panel-state panel-state--${kind}`}
      role={kind === 'error' ? 'alert' : 'status'}
      aria-live={kind === 'error' ? 'assertive' : 'polite'}
    >
      <span className="panel-state-glyph" aria-hidden="true">
        {kind === 'loading' ? (
          <span className="panel-spinner" />
        ) : (
          <UiIcon name={kind === 'error' ? 'alert' : 'umbrella'} size={20} />
        )}
      </span>
      <p className="panel-state-title">{title}</p>
      {hint && <p className="panel-state-hint">{hint}</p>}
      {action && (
        <button
          type="button"
          className="ghost-button panel-state-action"
          disabled={action.disabled}
          onClick={action.onClick}
        >
          {action.label}
        </button>
      )}
    </div>
  )
}

/** 刷新按钮：图标 + 文案，忙碌时图标旋转 */
export function RefreshButton({
  busy,
  onClick,
  label = '刷新',
}: {
  busy: boolean
  onClick: () => void
  label?: string
}) {
  return (
    <button
      type="button"
      className={`ghost-button panel-refresh${busy ? ' panel-refresh--busy' : ''}`}
      disabled={busy}
      onClick={onClick}
    >
      <UiIcon name="refresh" size={14} />
      <span>{busy ? '正在刷新…' : label}</span>
    </button>
  )
}
