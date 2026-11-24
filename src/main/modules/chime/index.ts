import { app } from 'electron'
import { z } from 'zod'
import type { ChimeSettings } from '../../../shared/modules'
import type { ModuleContext, PetModule } from '../types'
import {
  type ChimeState,
  chimeText,
  createChimeState,
  markChimed,
  normalizeChimeState,
  shouldChime,
} from './state'

const CHECK_INTERVAL_MS = 15_000
const settingsSchema = z.object({ enabled: z.boolean() })

let ctx: ModuleContext | null = null
let running = false
let state: ChimeState = createChimeState()
let checkTimer: ReturnType<typeof setInterval> | null = null

function persist(): void {
  ctx?.setState(state)
}

function checkChime(force = false): void {
  if (!running || !ctx) return

  const now = Date.now()
  if (!force && !shouldChime(state, now)) return
  const settings = ctx.getSettings<ChimeSettings>()
  if (ctx.isNightSuppressed(now, settings.nightEnabled !== false)) return
  if (ctx.isAmbientQuiet(now)) return

  const hour = new Date(now).getHours()
  if (!ctx.notify(chimeText(hour))) return

  state = markChimed(state, now)
  persist()
  ctx.logger.info('整点报时', { hour })
}

async function setup(context: ModuleContext): Promise<void> {
  ctx = context

  context.ipc.handle('chime:get-state', z.object({}), () => ({
    enabled: running,
    lastChimeKey: state.lastChimeKey,
  }))
}

async function startModule(): Promise<void> {
  if (running) return
  running = true

  state = normalizeChimeState(ctx?.getState<ChimeState>())
  checkTimer = ctx?.scheduler.setInterval(() => checkChime(), CHECK_INTERVAL_MS) ?? null

  // 开发期延迟强制报时，等气泡窗口加载完成；打包版不生效
  if (!app.isPackaged && process.env.VIVIAN_CHIME_TEST === '1') {
    ctx?.scheduler.setTimeout(() => checkChime(true), 5000)
  } else {
    checkChime()
  }
}

async function stopModule(): Promise<void> {
  if (!running) return

  running = false
  if (checkTimer && ctx) {
    ctx.scheduler.clearInterval(checkTimer)
    checkTimer = null
  }
  persist()
}

async function dispose(): Promise<void> {
  await stopModule()
  ctx = null
}

export const chimeModule: PetModule = {
  id: 'chime',
  title: '整点报时',
  description: '全天 24 小时整点轻声报时；夜间受夜间互动总开关管理',
  defaultEnabled: true,
  settingsSchema,
  setup,
  start: startModule,
  stop: stopModule,
  dispose,
}
