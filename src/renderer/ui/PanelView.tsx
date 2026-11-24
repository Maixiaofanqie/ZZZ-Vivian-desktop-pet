import { type KeyboardEvent, useCallback, useEffect, useState } from 'react'
import type { PanelPageSnapshot } from '../../shared/ipc'
import { resolvePanelPage } from '../modules'
import { PageIcon } from './panelIcons'
import { PanelState } from './panelParts'

/** 功能面板：左侧模块页面列表，右侧页面内容 */
export function PanelView() {
  const [pages, setPages] = useState<PanelPageSnapshot[] | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadPages = useCallback(async (isCanceled?: () => boolean): Promise<void> => {
    try {
      const list = await window.vivian.panel.listPages()
      if (isCanceled?.()) return

      setPages(list)
      setActiveId((previous) => {
        if (previous && list.some((page) => page.id === previous)) return previous
        return list[0]?.id ?? null
      })
      setError(null)
    } catch {
      setError('读取功能列表失败。')
    }
  }, [])

  useEffect(() => {
    let canceled = false

    void loadPages(() => canceled)

    // 设置页切换模块开关后，回到面板时刷新可用页面
    const onFocus = (): void => {
      void loadPages()
    }
    window.addEventListener('focus', onFocus)

    return () => {
      canceled = true
      window.removeEventListener('focus', onFocus)
    }
  }, [loadPages])

  const activePage = pages?.find((page) => page.id === activeId) ?? null
  const PageComponent = activePage ? resolvePanelPage(activePage.id) : null

  const handleNavKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
    if (!pages || pages.length === 0) return
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return

    const tabs = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('.panel-tab'))
    if (tabs.length === 0) return

    event.preventDefault()
    const focused = tabs.indexOf(document.activeElement as HTMLButtonElement)
    const current =
      focused >= 0 ? focused : tabs.findIndex((tab) => tab.getAttribute('aria-current') === 'page')
    const start = Math.max(current, 0)

    let next = start
    if (event.key === 'ArrowDown') next = (start + 1) % tabs.length
    if (event.key === 'ArrowUp') next = (start - 1 + tabs.length) % tabs.length
    if (event.key === 'Home') next = 0
    if (event.key === 'End') next = tabs.length - 1

    const target = tabs[next]
    target.focus()
    target.click()
  }

  return (
    <main className="panel-stage">
      <aside className="panel-sidebar">
        <p className="panel-eyebrow">VIVIAN BANSHEE</p>
        <h1 className="panel-title">功能面板</h1>
        <p className="panel-subtitle">法厄同大人的工作台</p>

        <nav className="panel-nav" aria-label="功能列表" onKeyDown={handleNavKeyDown}>
          {pages === null
            ? [0, 1, 2].map((index) => (
                <span key={index} className="panel-nav-skeleton" aria-hidden="true" />
              ))
            : pages.map((page) => (
                <button
                  key={page.id}
                  type="button"
                  className={`panel-tab${page.id === activeId ? ' panel-tab--active' : ''}`}
                  aria-current={page.id === activeId ? 'page' : undefined}
                  onClick={() => setActiveId(page.id)}
                >
                  <span className="panel-tab-icon">
                    <PageIcon id={page.id} />
                  </span>
                  <span className="panel-tab-label">{page.title}</span>
                </button>
              ))}
        </nav>

        <footer className="panel-footer">
          <span className="panel-footer-rule" aria-hidden="true" />
          只读元数据 · 仅本机
        </footer>
      </aside>

      <section className="panel-main">
        {error && pages === null ? (
          <PanelState
            kind="error"
            title={error}
            hint="请稍后再试。"
            action={{ label: '重试', onClick: () => void loadPages() }}
          />
        ) : pages === null ? (
          <PanelState kind="loading" title="正在展开功能面板…" hint="读取已启用的模块。" />
        ) : pages.length === 0 ? (
          <PanelState
            kind="empty"
            title="现在还没有可用的功能页面。"
            hint="可以在设置中开启需要的模块。"
          />
        ) : (
          <>
            {error && (
              <p className="panel-error" role="alert">
                {error}
              </p>
            )}
            {activePage && (
              <>
                <header className="panel-page-header">
                  <h2 className="panel-page-title">{activePage.title}</h2>
                  {activePage.description && (
                    <p className="panel-page-description">{activePage.description}</p>
                  )}
                </header>
                {PageComponent ? (
                  <PageComponent />
                ) : (
                  <PanelState
                    kind="error"
                    title="这个页面暂时无法显示。"
                    hint="请尝试重启应用，或检查模块是否完整。"
                  />
                )}
              </>
            )}
          </>
        )}
      </section>
    </main>
  )
}
