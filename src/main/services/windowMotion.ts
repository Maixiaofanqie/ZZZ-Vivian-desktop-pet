import { type BrowserWindow, screen } from 'electron'
import { clampPositionToWorkArea, landingY, type Point, type Size } from './geometry'

// Windows 定时器精度约 15.6ms；16ms 间隔实际会退化成 ~31ms 一帧，改用 8ms 才能稳定贴近刷新率
const DRAG_INTERVAL_MS = 8
const FALL_INTERVAL_MS = 8
const GRAVITY = 2400 // DIP/s²
const MAX_FALL_SPEED = 2200 // DIP/s
const BOUNCE_RESTITUTION = 0.22
const MAX_BOUNCE_SPEED = 420 // DIP/s，限制弹跳高度
const MIN_BOUNCE_SPEED = 120 // DIP/s，低于此值直接落定
const MIN_FALL_DISTANCE = 2 // DIP，离底部太近时不再做下落

export interface WindowMotionHandlers {
  /** 首次触地：触发渲染层的落地挤压动画 */
  onLanded?: () => void
  /** 完全静止：主进程保存最终位置 */
  onSettled?: (position: Point) => void
}

/**
 * 窗口运动服务：拖拽跟随 + 松手后的重力下落与一次小弹跳。
 * 静态形象模式下没有待机动画，但保留"落回桌面"的物理反馈。
 */
export class WindowMotionService {
  private dragTimer: ReturnType<typeof setInterval> | null = null
  private dragOffset: Point = { x: 0, y: 0 }
  private dragging = false

  private fallTimer: ReturnType<typeof setInterval> | null = null
  private fallVelocity = 0
  private fallY = 0
  private fallTargetY = 0
  private fallX = 0
  private lastFallAt = 0
  private bounceCount = 0
  private landedNotified = false

  /**
   * contentSize 使用固定的逻辑尺寸（DIP）。
   * 不能把 getContentBounds() 的结果回写：125% 缩放下它带有取整误差，
   * 反复回写会让无边框窗口逐次变宽。
   */
  constructor(
    private readonly win: BrowserWindow,
    private readonly contentSize: Size,
    private readonly handlers: WindowMotionHandlers = {},
  ) {}

  startDrag(): void {
    if (this.win.isDestroyed()) return

    this.cancelFall()
    const cursor = screen.getCursorScreenPoint()
    const bounds = this.win.getContentBounds()
    this.dragOffset = { x: cursor.x - bounds.x, y: cursor.y - bounds.y }
    this.dragging = true
    this.stopDragTimer()
    this.dragTimer = setInterval(() => this.followCursor(), DRAG_INTERVAL_MS)
    this.followCursor()
  }

  endDrag(): void {
    if (!this.dragging) return
    this.dragging = false
    this.stopDragTimer()
    this.startFall()
  }

  stop(): void {
    this.dragging = false
    this.stopDragTimer()
    this.cancelFall()
  }

  private followCursor(): void {
    if (this.win.isDestroyed()) {
      this.stop()
      return
    }

    const cursor = screen.getCursorScreenPoint()
    const display = screen.getDisplayNearestPoint(cursor)
    const position = clampPositionToWorkArea(
      { x: cursor.x - this.dragOffset.x, y: cursor.y - this.dragOffset.y },
      this.contentSize,
      display.workArea,
    )

    // 每帧同时写入固定尺寸，避免 125% DPI 下 setPosition 造成的尺寸累积漂移
    this.win.setContentBounds(
      {
        x: Math.round(position.x),
        y: Math.round(position.y),
        width: this.contentSize.width,
        height: this.contentSize.height,
      },
      false,
    )
  }

  private startFall(): void {
    if (this.win.isDestroyed()) return
    this.cancelFall()

    const bounds = this.win.getContentBounds()
    const display = screen.getDisplayNearestPoint({
      x: bounds.x + bounds.width / 2,
      y: bounds.y + bounds.height / 2,
    })

    this.fallX = bounds.x
    this.fallY = bounds.y
    this.fallTargetY = Math.round(landingY(display.workArea, this.contentSize.height))
    this.fallVelocity = 0
    this.bounceCount = 0
    this.landedNotified = false

    if (this.fallTargetY - bounds.y <= MIN_FALL_DISTANCE) {
      // 已经贴着桌面：只做一次落地反馈，顺便对齐到整数坐标
      this.applyPosition(this.fallTargetY)
      this.notifyLanded()
      this.handlers.onSettled?.({ x: this.fallX, y: this.fallTargetY })
      return
    }

    this.lastFallAt = performance.now()
    this.fallTimer = setInterval(() => this.stepFall(), FALL_INTERVAL_MS)
  }

  private stepFall(): void {
    if (this.win.isDestroyed()) {
      this.cancelFall()
      return
    }

    const now = performance.now()
    const delta = Math.min(0.05, Math.max(0, (now - this.lastFallAt) / 1000))
    this.lastFallAt = now
    if (delta === 0) return

    this.fallVelocity = Math.min(this.fallVelocity + GRAVITY * delta, MAX_FALL_SPEED)
    let nextY = this.fallY + this.fallVelocity * delta

    if (nextY >= this.fallTargetY) {
      nextY = this.fallTargetY

      if (this.fallVelocity > 0) {
        this.notifyLanded()

        const bounceSpeed = Math.min(this.fallVelocity * BOUNCE_RESTITUTION, MAX_BOUNCE_SPEED)
        const canBounce = this.bounceCount === 0 && bounceSpeed >= MIN_BOUNCE_SPEED

        if (canBounce) {
          this.bounceCount += 1
          this.fallVelocity = -bounceSpeed
        } else {
          this.applyPosition(nextY)
          this.settle()
          return
        }
      }
    }

    this.fallY = nextY
    this.applyPosition(nextY)
  }

  private applyPosition(y: number): void {
    if (this.win.isDestroyed()) return
    this.win.setContentBounds(
      {
        x: this.fallX,
        y: Math.round(y),
        width: this.contentSize.width,
        height: this.contentSize.height,
      },
      false,
    )
  }

  private settle(): void {
    this.stopFallTimer()
    this.applyPosition(this.fallTargetY)
    this.handlers.onSettled?.({ x: this.fallX, y: this.fallTargetY })
  }

  private notifyLanded(): void {
    if (this.landedNotified) return
    this.landedNotified = true
    this.handlers.onLanded?.()
  }

  private cancelFall(): void {
    this.stopFallTimer()
  }

  private stopDragTimer(): void {
    if (this.dragTimer) {
      clearInterval(this.dragTimer)
      this.dragTimer = null
    }
  }

  private stopFallTimer(): void {
    if (this.fallTimer) {
      clearInterval(this.fallTimer)
      this.fallTimer = null
    }
  }
}
