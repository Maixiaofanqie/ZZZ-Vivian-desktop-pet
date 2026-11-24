import { type BrowserWindow, screen } from 'electron'
import { type HitMask, isPointInMask, normalizePoint } from './geometry'

/**
 * 点击穿透服务。
 *
 * 渲染层把形象的 alpha 面罩上报给主进程；主进程以约 30Hz 轮询光标位置，
 * 光标位于实体像素时关闭穿透，位于透明区域时开启穿透。
 * 不使用渲染层 mousemove 判定，避免窗口一旦穿透就收不到事件的问题。
 */
export class ClickThroughService {
  private timer: ReturnType<typeof setInterval> | null = null
  private mask: HitMask | null = null
  private dragging = false
  private ignoring = false
  private hovered = false

  constructor(
    private readonly win: BrowserWindow,
    private readonly onHoverChange?: (hovered: boolean) => void,
  ) {}

  start(): void {
    if (this.timer) return
    this.setIgnore(true)
    this.timer = setInterval(() => this.tick(), 33)
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    this.updateHover(false)
  }

  setMask(mask: HitMask): void {
    this.mask = mask
    this.tick()
  }

  setDragging(dragging: boolean): void {
    this.dragging = dragging
    if (dragging) {
      this.updateHover(false)
      this.setIgnore(false)
    } else {
      this.tick()
    }
  }

  private tick(): void {
    if (this.win.isDestroyed() || !this.win.isVisible()) {
      this.updateHover(false)
      this.setIgnore(true)
      return
    }

    if (this.dragging) {
      this.updateHover(false)
      this.setIgnore(false)
      return
    }

    // 面罩尚未上报前保持窗口可点击，避免出现无法交互的空窗期
    if (!this.mask) {
      this.updateHover(false)
      this.setIgnore(false)
      return
    }

    const cursor = screen.getCursorScreenPoint()
    const bounds = this.win.getContentBounds()
    const normalized = normalizePoint(cursor, bounds)
    if (!normalized) {
      this.updateHover(false)
      this.setIgnore(true)
      return
    }

    const inMask = isPointInMask(this.mask, normalized.nx, normalized.ny)
    this.updateHover(inMask)
    this.setIgnore(!inMask)
  }

  private updateHover(hovered: boolean): void {
    if (this.hovered === hovered) return
    this.hovered = hovered
    this.onHoverChange?.(hovered)
  }

  private setIgnore(ignore: boolean): void {
    if (this.ignoring === ignore) return
    this.ignoring = ignore
    this.win.setIgnoreMouseEvents(ignore, { forward: true })
  }
}
