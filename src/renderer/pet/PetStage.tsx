import { useEffect, useRef, useState } from 'react'
import { DEFAULT_IMAGE_MODE, nextImageId } from '../../shared/imageSelection'
import type { ImageSelection, PetVisualMetrics } from '../../shared/ipc'
import { MOTION, MOTION_EASING } from '../motion'
import { DEFAULT_IMAGE, STATIC_IMAGES } from '../staticImages'

const MASK_SIZE = 72
const ALPHA_THRESHOLD = 64
const DRAG_THRESHOLD = 4
const DOUBLE_CLICK_MS = 280
// 略长于双击窗口，避免“慢双击”先弹出一条气泡
const CLICK_DELAY_MS = 300
// 半身形象没有明确脚底，2026-10-29 取消地面阴影，可见底边直接对齐窗口底部
const GROUND_MARGIN = 0

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error(`无法加载形象：${url}`))
    image.src = url
  })
}

/**
 * 绘制形象，并把可见脚底对齐到窗口底部，去掉脚下透明边距造成的浮空感。
 * 返回窗口坐标系下的可见范围，供主进程贴气泡。
 */
function drawImage(
  canvas: HTMLCanvasElement,
  image: HTMLImageElement,
  metrics: PetVisualMetrics,
): PetVisualMetrics | null {
  const cssWidth = window.innerWidth
  const cssHeight = window.innerHeight
  if (cssWidth === 0 || cssHeight === 0) return null

  const dpr = window.devicePixelRatio || 1
  canvas.width = Math.round(cssWidth * dpr)
  canvas.height = Math.round(cssHeight * dpr)

  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.clearRect(0, 0, cssWidth, cssHeight)

  const availableHeight = Math.max(1, cssHeight - GROUND_MARGIN)
  const scale = Math.min(cssWidth / image.width, availableHeight / image.height)
  const drawWidth = image.width * scale
  const drawHeight = image.height * scale
  // 可见底边对齐到窗口底部上方 GROUND_MARGIN（当前为 0）
  const drawTop = availableHeight - metrics.bottomRatio * drawHeight

  ctx.drawImage(image, (cssWidth - drawWidth) / 2, drawTop, drawWidth, drawHeight)

  const visibleTop = drawTop + metrics.topRatio * drawHeight
  const visibleBottom = drawTop + metrics.bottomRatio * drawHeight
  return {
    topRatio: Math.min(1, Math.max(0, visibleTop / cssHeight)),
    bottomRatio: Math.min(1, Math.max(0, visibleBottom / cssHeight)),
  }
}

function updateHitMask(canvas: HTMLCanvasElement): void {
  const maskCanvas = document.createElement('canvas')
  maskCanvas.width = MASK_SIZE
  maskCanvas.height = MASK_SIZE
  const ctx = maskCanvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return

  ctx.drawImage(canvas, 0, 0, MASK_SIZE, MASK_SIZE)
  const data = ctx.getImageData(0, 0, MASK_SIZE, MASK_SIZE).data
  const mask: number[] = new Array(MASK_SIZE * MASK_SIZE).fill(0)

  for (let index = 0; index < mask.length; index++) {
    mask[index] = (data[index * 4 + 3] ?? 0) >= ALPHA_THRESHOLD ? 255 : 0
  }

  window.vivian?.pet?.updateHitMask({
    width: MASK_SIZE,
    height: MASK_SIZE,
    data: mask,
  })
}

/**
 * 量出形象在画布中的可见范围（alpha 边界），上报给主进程贴气泡。
 * 512×512 只量一次；图片本身带透明边距，不能直接用窗口边缘。
 */
function measureVisualMetrics(image: HTMLImageElement): PetVisualMetrics | null {
  const width = image.naturalWidth
  const height = image.naturalHeight
  if (width === 0 || height === 0) return null

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null

  ctx.drawImage(image, 0, 0)
  const data = ctx.getImageData(0, 0, width, height).data

  const rowVisible = (y: number): boolean => {
    const rowStart = y * width * 4
    for (let x = 0; x < width; x++) {
      if ((data[rowStart + x * 4 + 3] ?? 0) >= ALPHA_THRESHOLD) return true
    }
    return false
  }

  let top = 0
  while (top < height && !rowVisible(top)) top += 1
  if (top >= height) return { topRatio: 0, bottomRatio: 1 }

  let bottom = height - 1
  while (bottom > top && !rowVisible(bottom)) bottom -= 1

  return { topRatio: top / height, bottomRatio: (bottom + 1) / height }
}

/** 落地挤压：以脚底为原点压扁再回弹 */
function playLandAnimation(element: HTMLElement | null): void {
  if (!element) return
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  element.animate(
    [
      { transform: 'scale(1, 1)' },
      { transform: 'scale(1.04, 0.94)', offset: 0.3 },
      { transform: 'scale(0.99, 1.01)', offset: 0.65 },
      { transform: 'scale(1, 1)' },
    ],
    { duration: MOTION.land, easing: MOTION_EASING },
  )
}

/**
 * 没有角色图时保持空白窗口：清空画布并把命中面罩置零。
 * 面罩全零后透明窗口整体点击穿透，不会拦截桌面操作。
 */
function drawEmptyStage(canvas: HTMLCanvasElement): void {
  const cssWidth = window.innerWidth
  const cssHeight = window.innerHeight
  if (cssWidth === 0 || cssHeight === 0) return

  const dpr = window.devicePixelRatio || 1
  canvas.width = Math.round(cssWidth * dpr)
  canvas.height = Math.round(cssHeight * dpr)

  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, cssWidth, cssHeight)

  updateHitMask(canvas)
  window.vivian?.pet?.updateVisualMetrics({ topRatio: 0.5, bottomRatio: 0.5 })
}

/**
 * 静态形象舞台：
 * - 单张透明形象图；可选待机呼吸与轻微摇摆
 * - 点击缩放 Q 弹；双击在形象间循环（可被设置切换为固定模式）
 * - 拖拽后由主进程接手下落与落地；拖拽期间暂停待机动效
 * - 没有角色图时保持空白窗口，不绘制任何占位形象
 */
export function PetStage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLImageElement | null>(null)
  const imageMetricsRef = useRef<PetVisualMetrics | null>(null)
  const draggingRef = useRef(false)
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null)
  const clickTimerRef = useRef<number | null>(null)
  const resizeTimerRef = useRef<number | null>(null)
  const lastClickRef = useRef(0)
  const selectionRef = useRef<ImageSelection>({
    mode: DEFAULT_IMAGE_MODE,
    selectedImageId: DEFAULT_IMAGE?.id ?? '',
  })
  const [selection, setSelection] = useState<ImageSelection>(selectionRef.current)
  const [pressed, setPressed] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [hovered, setHovered] = useState(false)
  // 先静态启动，读到开关后再开启，避免关闭状态下启动时闪一下动效
  const [idleEnabled, setIdleEnabled] = useState(false)

  useEffect(() => {
    selectionRef.current = selection
  }, [selection])

  useEffect(() => {
    let cancelled = false

    void window.vivian?.pet
      ?.getImageSelection()
      .then((next) => {
        if (!cancelled) setSelection(next)
      })
      .catch(() => {})

    const unsubscribe = window.vivian?.pet?.onImageSelectionChanged((next) => {
      if (!cancelled) setSelection(next)
    })

    return () => {
      cancelled = true
      unsubscribe?.()
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    void window.vivian?.pet
      ?.getIdleMotion()
      .then((motion) => {
        if (!cancelled) setIdleEnabled(motion.enabled)
      })
      .catch(() => {})

    const unsubscribe = window.vivian?.pet?.onIdleMotionChanged((motion) => {
      if (!cancelled) setIdleEnabled(motion.enabled)
    })

    return () => {
      cancelled = true
      unsubscribe?.()
    }
  }, [])

  useEffect(() => {
    const unsubscribe = window.vivian?.pet?.onHoverChanged((value) => setHovered(value))
    return () => unsubscribe?.()
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    let cancelled = false
    const selected =
      STATIC_IMAGES.find((image) => image.id === selection.selectedImageId) ?? DEFAULT_IMAGE

    if (!selected) {
      imageRef.current = null
      imageMetricsRef.current = null
      drawEmptyStage(canvas)
      return
    }

    void loadImage(selected.url)
      .then((image) => {
        if (cancelled) return
        imageRef.current = image
        const metrics = measureVisualMetrics(image) ?? { topRatio: 0, bottomRatio: 1 }
        imageMetricsRef.current = metrics

        const visible = drawImage(canvas, image, metrics)
        updateHitMask(canvas)
        if (visible) window.vivian?.pet?.updateVisualMetrics(visible)
      })
      .catch((error) => {
        console.error(error)
        if (!cancelled) {
          imageRef.current = null
          imageMetricsRef.current = null
          drawEmptyStage(canvas)
        }
      })

    // 拖拽时窗口移动可能因 DPI 舍入连续触发 resize；重绘会重建画布，必须防抖
    const onResize = (): void => {
      if (resizeTimerRef.current !== null) window.clearTimeout(resizeTimerRef.current)
      resizeTimerRef.current = window.setTimeout(() => {
        resizeTimerRef.current = null
        const dpr = window.devicePixelRatio || 1
        const width = Math.round(window.innerWidth * dpr)
        const height = Math.round(window.innerHeight * dpr)
        if (canvas.width === width && canvas.height === height) return

        const image = imageRef.current
        const metrics = imageMetricsRef.current
        if (!image || !metrics) return

        const visible = drawImage(canvas, image, metrics)
        updateHitMask(canvas)
        if (visible) window.vivian?.pet?.updateVisualMetrics(visible)
      }, 150)
    }
    window.addEventListener('resize', onResize)

    return () => {
      cancelled = true
      window.removeEventListener('resize', onResize)
      if (resizeTimerRef.current !== null) {
        window.clearTimeout(resizeTimerRef.current)
        resizeTimerRef.current = null
      }
    }
  }, [selection.selectedImageId])

  useEffect(() => {
    const endDrag = (): void => {
      if (!draggingRef.current) return
      draggingRef.current = false
      pointerStartRef.current = null
      setDragging(false)
      setPressed(false)
      window.vivian?.pet?.dragEnd()
    }

    window.addEventListener('blur', endDrag)
    return () => {
      window.removeEventListener('blur', endDrag)
      if (clickTimerRef.current !== null) {
        window.clearTimeout(clickTimerRef.current)
      }
    }
  }, [])

  const clearClickTimer = (): void => {
    if (clickTimerRef.current !== null) {
      window.clearTimeout(clickTimerRef.current)
      clickTimerRef.current = null
    }
  }

  const playBounce = (): void => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const element = stageRef.current
    if (!element) return
    element.animate(
      [
        { transform: 'scale(1.06)' },
        { transform: 'scale(0.98)', offset: 0.55 },
        { transform: 'scale(1)' },
      ],
      { duration: MOTION.bounce, easing: MOTION_EASING },
    )
  }

  useEffect(() => {
    const unsubscribe = window.vivian?.pet?.onLanded(() => {
      playLandAnimation(stageRef.current)
    })
    return () => unsubscribe?.()
  }, [])

  const cycleImage = (): void => {
    if (selectionRef.current.mode !== 'cycle') return
    const ids = STATIC_IMAGES.map((image) => image.id)
    if (ids.length <= 1) return

    const nextId = nextImageId(ids, selectionRef.current.selectedImageId)
    const nextSelection: ImageSelection = { mode: 'cycle', selectedImageId: nextId }
    setSelection(nextSelection)
    void window.vivian?.pet?.setImage(nextId)
  }

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>): void => {
    if (event.button !== 0) return
    event.preventDefault()
    pointerStartRef.current = { x: event.clientX, y: event.clientY }
    draggingRef.current = false
    setPressed(true)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>): void => {
    const start = pointerStartRef.current
    if (!start || draggingRef.current) return
    if ((event.buttons & 1) === 0) return

    const distance = Math.hypot(event.clientX - start.x, event.clientY - start.y)
    if (distance < DRAG_THRESHOLD) return

    draggingRef.current = true
    setDragging(true)
    setPressed(false)
    clearClickTimer()
    window.vivian?.pet?.dragStart()
  }

  const handlePointerEnd = (event: React.PointerEvent<HTMLCanvasElement>): void => {
    if (!pointerStartRef.current) return

    const wasDragging = draggingRef.current
    pointerStartRef.current = null
    draggingRef.current = false
    setDragging(false)
    setPressed(false)

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }

    if (wasDragging) {
      // 落地反馈由主进程触地后发 pet:landed，这里不立即 Q 弹
      window.vivian?.pet?.dragEnd()
      return
    }

    // 先发即时抬起：若气泡正在逐字淡入，主进程会立刻补全全文；
    // 下面的延迟单击仍负责双击判定与新台词抢占。
    window.vivian?.pet?.pointerUp()

    const now = Date.now()
    if (now - lastClickRef.current <= DOUBLE_CLICK_MS) {
      lastClickRef.current = 0
      clearClickTimer()
      if (selectionRef.current.mode === 'cycle' && STATIC_IMAGES.length > 1) {
        playBounce()
        cycleImage()
      }
      return
    }

    lastClickRef.current = now
    playBounce()
    clearClickTimer()
    clickTimerRef.current = window.setTimeout(() => {
      clickTimerRef.current = null
      window.vivian?.pet?.click()
    }, CLICK_DELAY_MS)
  }

  const handleContextMenu = (event: React.MouseEvent<HTMLCanvasElement>): void => {
    event.preventDefault()
    window.vivian?.pet?.openContextMenu()
  }

  const handlePointerCancel = (event: React.PointerEvent<HTMLCanvasElement>): void => {
    // pointerup 释放捕获后也会触发 lostpointercapture；此时不应清掉单击计时器
    if (!pointerStartRef.current) return

    const wasDragging = draggingRef.current
    pointerStartRef.current = null
    draggingRef.current = false
    setDragging(false)
    setPressed(false)

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    if (wasDragging) {
      window.vivian?.pet?.dragEnd()
    }
    clearClickTimer()
  }

  return (
    <div
      className={`pet-idle${idleEnabled ? '' : ' pet-idle--off'}${
        dragging ? ' pet-idle--paused' : ''
      }`}
    >
      <div className="pet-sway">
        <div
          ref={stageRef}
          className={`pet-stage${pressed ? ' pet-stage--pressed' : ''}${
            hovered ? ' pet-stage--hovered' : ''
          }`}
        >
          <canvas
            ref={canvasRef}
            className="pet-canvas"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerEnd}
            onPointerCancel={handlePointerCancel}
            onLostPointerCapture={handlePointerCancel}
            onContextMenu={handleContextMenu}
          />
        </div>
      </div>
    </div>
  )
}
