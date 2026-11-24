import type { Rect, Size } from './geometry'

export interface BubblePosition {
  x: number
  y: number
  placement: 'above' | 'below'
}

/**
 * 形象在窗口内的可见范围（0..1）。
 * 静态图四周留有透明边距，气泡需要贴着可见像素而不是窗口边缘。
 */
export interface VisualRatios {
  topRatio: number
  bottomRatio: number
}

export const FULL_VISIBLE: VisualRatios = { topRatio: 0, bottomRatio: 1 }

function clampRatio(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.min(1, Math.max(0, value))
}

/**
 * 气泡优先显示在宠物上方；上方空间不足时翻到下方。
 * 垂直方向以形象可见像素为锚点，避免透明边距把气泡推得过远；
 * 水平方向居中并夹紧到工作区，保证不越界。
 */
export function computeBubblePosition(
  petBounds: Rect,
  bubbleSize: Size,
  workArea: Rect,
  gap = 8,
  visual: VisualRatios = FULL_VISIBLE,
): BubblePosition {
  const topRatio = clampRatio(visual.topRatio, 0)
  const bottomRatio = Math.max(topRatio, clampRatio(visual.bottomRatio, 1))
  const visibleTop = petBounds.y + petBounds.height * topRatio
  const visibleBottom = petBounds.y + petBounds.height * bottomRatio

  const centeredX = petBounds.x + petBounds.width / 2 - bubbleSize.width / 2
  const maxX = workArea.x + Math.max(0, workArea.width - bubbleSize.width)
  const x = Math.min(Math.max(Math.round(centeredX), workArea.x), maxX)

  const aboveY = visibleTop - bubbleSize.height - gap
  if (aboveY >= workArea.y) {
    return { x, y: Math.round(aboveY), placement: 'above' }
  }

  const belowY = visibleBottom + gap
  const maxY = workArea.y + Math.max(0, workArea.height - bubbleSize.height)
  return {
    x,
    y: Math.round(Math.min(Math.max(belowY, workArea.y), maxY)),
    placement: 'below',
  }
}
