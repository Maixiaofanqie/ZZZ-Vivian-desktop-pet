import { join } from 'node:path'
import { app, shell } from 'electron'
import { z } from 'zod'
import type { ClaudeCodeOpenResult, ClaudeCodeSnapshot } from '../../../shared/ipc'
import type { ClaudeCodeSettings } from '../../../shared/modules'
import {
  ClaudeCodeService,
  defaultClaudeProjectsRoot,
  defaultClaudeSessionsRoot,
} from '../../services/claudeCode'
import {
  type ClaudeCodeOpener,
  openClaudeProject,
  openClaudeSession,
} from '../../services/claudeCodeOpen'
import { recordWorkSnapshot } from '../../store/memory'
import { updateMemory } from '../../store/profile'
import { registerModuleClickLine, unregisterModuleClickLine } from '../lines'
import type { ModuleContext, PetModule } from '../types'
import {
  buildMentionText,
  mentionTimestampsAfter,
  normalizeMentionTimestamps,
  shouldMention,
} from './mentions'

const settingsSchema = z.object({
  enabled: z.boolean(),
  rangeDays: z.union([z.literal(0), z.literal(7), z.literal(30)]),
  mentionFrequency: z.enum(['off', 'low', 'medium', 'high']),
})

const projectIdSchema = z.string().regex(/^[0-9a-f]{16}$/)
const openProjectSchema = z.object({ projectId: projectIdSchema })
const openSessionSchema = z.object({
  projectId: projectIdSchema,
  sessionId: z
    .string()
    .min(8)
    .max(128)
    .regex(/^[A-Za-z0-9-]+$/),
})

interface ClaudeCodeState {
  mentionTimestamps?: unknown
}

let ctx: ModuleContext | null = null
let service: ClaudeCodeService | null = null
let running = false
let mentionTimestamps: number[] = []

function loadMentionState(): void {
  mentionTimestamps = normalizeMentionTimestamps(
    ctx?.getState<ClaudeCodeState>()?.mentionTimestamps,
  )
}

function persistMentionState(): void {
  ctx?.setState({ mentionTimestamps })
}

/** 开发期强制命中概率，便于验收台词；打包版忽略，冷却仍生效 */
function mentionRandom(): number {
  if (!app.isPackaged && process.env.VIVIAN_CLAUDE_MENTION_TEST === '1') return 0
  return Math.random()
}

function recordWork(snapshot: ClaudeCodeSnapshot): void {
  if (snapshot.projects.length === 0) return

  updateMemory((memory) => recordWorkSnapshot(memory, snapshot))
}

/** 启动时先扫一次，给工作台词与记忆一个初始快照 */
function refreshWorkMemory(): void {
  if (!service) return

  void service
    .getSnapshot()
    .then((snapshot) => {
      if (service && running) recordWork(snapshot)
    })
    .catch((error) => {
      ctx?.logger.warn('Claude Code 工作记录更新失败', error)
    })
}

/** 每次点击由核心询问一次；这里负责概率、冷却与台词文本 */
function provideMentionLine(): { text: string; lineId?: string } | null {
  if (!running || !ctx || !service) return null

  const settings = ctx.getSettings<ClaudeCodeSettings>()
  if (settings.mentionFrequency === 'off') return null

  const project = service.getCachedSnapshot()?.projects[0]
  if (!project) return null

  const now = Date.now()
  if (
    !shouldMention({
      frequency: settings.mentionFrequency,
      timestamps: mentionTimestamps,
      now,
      random: mentionRandom(),
    })
  ) {
    return null
  }

  mentionTimestamps = mentionTimestampsAfter(mentionTimestamps, now)
  persistMentionState()

  return { text: buildMentionText(project, now), lineId: 'claude-code-work' }
}

/** 开发期 dry-run：只记录动作，不真的拉起 VSCode；打包版忽略 */
function createOpener(context: ModuleContext): ClaudeCodeOpener {
  if (!app.isPackaged && process.env.VIVIAN_CLAUDE_DRY_RUN === '1') {
    return {
      openExternal: async (url) => {
        const kind = url.startsWith('vscode://anthropic.claude-code') ? '会话' : '文件夹'
        context.logger.info(`Claude Code 打开动作（dry-run）：${kind}`)
      },
      openPath: async () => '',
    }
  }

  return {
    openExternal: (url) => shell.openExternal(url),
    openPath: (path) => shell.openPath(path),
  }
}

/** 开发期可用 VIVIAN_CLAUDE_PROJECTS_DIR 指向测试夹具；打包版忽略 */
function projectsRoot(): string {
  if (!app.isPackaged) {
    const override = process.env.VIVIAN_CLAUDE_PROJECTS_DIR?.trim()
    if (override) return override
  }
  return defaultClaudeProjectsRoot()
}

/** 开发期可用 VIVIAN_CLAUDE_SESSIONS_DIR 指向测试夹具；打包版忽略 */
function sessionsRoot(): string {
  if (!app.isPackaged) {
    const override = process.env.VIVIAN_CLAUDE_SESSIONS_DIR?.trim()
    if (override) return override
  }
  return defaultClaudeSessionsRoot()
}

/** 开发期可用 VIVIAN_CLAUDE_VSCODE_STORAGE_DIR 指向测试夹具；打包版忽略 */
function vscodeStorageRoot(): string | null {
  if (!app.isPackaged) {
    const override = process.env.VIVIAN_CLAUDE_VSCODE_STORAGE_DIR?.trim()
    if (override) return override
  }
  if (process.platform !== 'win32') return null

  try {
    return join(app.getPath('appData'), 'Code', 'User', 'workspaceStorage')
  } catch {
    return null
  }
}

function emptySnapshot(): ClaudeCodeSnapshot {
  return { scannedAt: 0, projects: [] }
}

function failedOpen(message: string): ClaudeCodeOpenResult {
  return { folderOpened: false, sessionOpened: false, message }
}

async function setup(context: ModuleContext): Promise<void> {
  ctx = context
  loadMentionState()
  registerModuleClickLine('claude-code', provideMentionLine)

  const opener = createOpener(context)
  service = new ClaudeCodeService({
    root: projectsRoot(),
    sessionsRoot: sessionsRoot(),
    vscodeStorageRoot: vscodeStorageRoot() ?? undefined,
    activeDays: () => context.getSettings<ClaudeCodeSettings>().rangeDays ?? 30,
  })

  context.ipc.handle(
    'claude-code:get-snapshot',
    z.object({ refresh: z.boolean().optional() }),
    async (payload) => {
      if (!service) return emptySnapshot()

      try {
        const snapshot = await service.getSnapshot({ refresh: payload.refresh === true })
        if (running) recordWork(snapshot)
        return snapshot
      } catch (error) {
        context.logger.warn('Claude Code 扫描失败', error)
        return emptySnapshot()
      }
    },
  )

  context.ipc.handle('claude-code:open-project', openProjectSchema, async (payload) => {
    if (!service) return failedOpen('Claude Code 联动尚未就绪，请稍后重试。')

    const location = await service.getProjectLocation(payload.projectId)
    if (!location) return failedOpen('项目记录已过期或文件夹不可用，请刷新后再试。')

    return openClaudeProject({ path: location.path, opener })
  })

  context.ipc.handle('claude-code:open-session', openSessionSchema, async (payload) => {
    if (!service) return failedOpen('Claude Code 联动尚未就绪，请稍后重试。')

    const location = await service.getProjectLocation(payload.projectId)
    if (!location) return failedOpen('项目记录已过期或文件夹不可用，请刷新后再试。')

    if (!location.sessions.includes(payload.sessionId)) {
      return failedOpen('这个会话已经不在最近列表中，请刷新后再试。')
    }

    return openClaudeSession({
      path: location.path,
      sessionId: payload.sessionId,
      opener,
    })
  })
}

async function startModule(): Promise<void> {
  if (running) return

  running = true
  loadMentionState()
  refreshWorkMemory()
}

async function stopModule(): Promise<void> {
  running = false
}

async function dispose(): Promise<void> {
  running = false
  unregisterModuleClickLine('claude-code')
  service = null
  ctx = null
}

export const claudeCodeModule: PetModule = {
  id: 'claude-code',
  title: 'Claude Code 联动',
  description: '只读查看本机 Claude Code 项目与最近会话；不读取对话内容',
  defaultEnabled: false,
  panelPage: {
    id: 'claude-code',
    title: 'Claude Code · 最近项目',
    description: '本机项目的最后活跃时间、会话数与最近会话；只读元数据',
    order: 10,
  },
  settingsSchema,
  setup,
  start: startModule,
  stop: stopModule,
  dispose,
}
