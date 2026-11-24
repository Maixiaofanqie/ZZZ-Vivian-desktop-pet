/**
 * 窗口与命中检测的纯函数集合。
 * 不依赖 Electron，便于用 Vitest 直接测试。
 */

export interface Point {
  x: number
  y: number
}

export interface Size {
  width: number
  height: number
}

export interface Rect extends Point, Size {}

/** 将窗口位置夹紧到工作区内，避免拖出屏幕或落在任务栏下方 */
export function clampPositionToWorkArea(position: Point, size: Size, workArea: Rect): Point {
  const maxX = workArea.x + Math.max(0, workArea.width - size.width)
  const maxY = workArea.y + Math.max(0, workArea.height - size.height)

  return {
    x: Math.min(Math.max(position.x, workArea.x), maxX),
    y: Math.min(Math.max(position.y, workArea.y), maxY),
  }
}

/** 窗口落地后的 y 坐标：工作区底部减去窗口高度 */
export function landingY(workArea: Rect, windowHeight: number): number {
  return Math.max(workArea.y, workArea.y + workArea.height - windowHeight)
}

export interface NormalizedPoint {
  nx: number
  ny: number
}

/** 把屏幕坐标换算成窗口内的 0..1 归一化坐标；不在窗口内返回 null */
export function normalizePoint(point: Point, bounds: Rect): NormalizedPoint | null {
  if (
    point.x < bounds.x ||
    point.x >= bounds.x + bounds.width ||
    point.y < bounds.y ||
    point.y >= bounds.y + bounds.height
  ) {
    return null
  }

  return {
    nx: (point.x - bounds.x) / bounds.width,
    ny: (point.y - bounds.y) / bounds.height,
  }
}

export interface HitMask {
  width: number
  height: number
  data: Uint8Array
}

/**
 * 逐像素命中检测。
 * 使用 alpha 网格的阈值判断，避免阴影、光晕等半透明像素被误判为可点击。
 */
export function isPointInMask(mask: HitMask, nx: number, ny: number, threshold = 64): boolean {
  if (nx < 0 || nx >= 1 || ny < 0 || ny >= 1) return false

  const mx = Math.min(mask.width - 1, Math.floor(nx * mask.width))
  const my = Math.min(mask.height - 1, Math.floor(ny * mask.height))
  const alpha = mask.data[my * mask.width + mx] ?? 0

  return alpha >= threshold
}
