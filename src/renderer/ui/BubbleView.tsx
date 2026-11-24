import { useEffect, useState } from 'react'
import { BUBBLE_CHAR_STAGGER_MS, BUBBLE_FADE_OUT_MS } from '../../shared/constants'
import type { BubbleShowPayload } from '../../shared/ipc'

interface DisplayBubble extends BubbleShowPayload {
  key: number
}

/** 独立气泡窗口的渲染层：只负责展示主进程发来的台词 */
export function BubbleView() {
  const [bubble, setBubble] = useState<DisplayBubble | null>(null)
  const [leaving, setLeaving] = useState(false)
  const [completed, setCompleted] = useState(false)

  useEffect(() => {
    let key = 0
    const offShow = window.vivian?.bubble?.onShow((payload) => {
      key += 1
      setBubble({ ...payload, key })
      setLeaving(false)
      setCompleted(false)
    })
    const offComplete = window.vivian?.bubble?.onComplete(() => {
      setCompleted(true)
    })
    const offFadeOut = window.vivian?.bubble?.onFadeOut(() => {
      setLeaving(true)
    })

    return () => {
      offShow?.()
      offComplete?.()
      offFadeOut?.()
    }
  }, [])

  if (!bubble) return null

  const characters = Array.from(bubble.text).map((character, index) => ({
    key: `${bubble.key}-${index}`,
    character,
    delay: index * BUBBLE_CHAR_STAGGER_MS,
  }))

  return (
    <div className={`bubble-stage bubble-stage--${bubble.placement}`}>
      <div
        key={bubble.key}
        className={`bubble-card${leaving ? ' bubble-card--leaving' : ''}`}
        style={leaving ? { animationDuration: `${BUBBLE_FADE_OUT_MS}ms` } : undefined}
      >
        <p className={`bubble-text${completed ? ' bubble-text--complete' : ''}`}>
          {characters.map(({ key, character, delay }) => (
            <span key={key} className="bubble-char" style={{ animationDelay: `${delay}ms` }}>
              {character}
            </span>
          ))}
        </p>
      </div>
    </div>
  )
}
