import { createHash } from 'node:crypto'
import type { Dirent } from 'node:fs'
import { type FileHandle, open, readdir, readFile, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, isAbsolute, join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type {
  ClaudeCodeSnapshot,
  ClaudeProjectSummary,
  ClaudeSessionNameSource,
} from '../../shared/ipc'

const DAY_MS = 24 * 60 * 60 * 1000
const CACHE_TTL_MS = 5 * 60 * 1000
/** 只读会话文件开头这么多字节找 cwd，避免把整份对话读进内存 */
const CWD_READ_BYTES = 256 * 1024
/** 最新会话缺少 cwd 时，最多再看最近的几个会话 */
const CWD_SEARCH_SESSIONS = 3
/** 会话注册表文件很小；超过这个大小直接跳过 */
const SESSION_REGISTRY_MAX_BYTES = 64 * 1024
/** VSCode 工作区状态库：只查一个 key，限制数量与大小避免异常目录拖慢扫描 */
const VSCODE_STATE_DB = 'state.vscdb'
const VSCODE_STATE_KEY = 'Anthropic.claude-code'
const VSCODE_MAX_DB_BYTES = 8 * 1024 * 1024
const VSCODE_MAX_DBS = 64

export const DEFAULT_ACTIVE_DAYS = 30
export const DEFAULT_PROJECT_LIMIT = 5
export const DEFAULT_SESSION_LIMIT = 5

export function defaultClaudeProjectsRoot(): string {
  return join(homedir(), '.claude', 'projects')
}

export function defaultClaudeSessionsRoot(): string {
  return join(homedir(), '.claude', 'sessions')
}

export interface ScanClaudeProjectsOptions {
  root: string
  /** 会话注册表目录；只读取 sessionId、name 与 nameSource。未提供时不加会话名 */
  sessionsRoot?: string
  /** VSCode workspaceStorage 目录；只读取页签名。未提供时不加页签名 */
  vscodeStorageRoot?: string
  /** 0 表示不按时间过滤 */
  activeDays?: number
  projectLimit?: number
  sessionLimit?: number
  now?: number
  /** 主进程内部回调：项目 id → 真实 cwd；渲染层永远拿不到 */
  onProjectPath?: (projectId: string, projectPath: string) => void
}

/**
 * 只读扫描 `~/.claude/projects/*`。
 * 只解析会话文件开头的 `cwd` 字段，不读取、不保存、不记录消息内容。
 */
export async function scanClaudeProjects(
  options: ScanClaudeProjectsOptions,
): Promise<ClaudeCodeSnapshot> {
  const now = options.now ?? Date.now()
  const activeDays = options.activeDays ?? DEFAULT_ACTIVE_DAYS
  const projectLimit = Math.max(0, options.projectLimit ?? DEFAULT_PROJECT_LIMIT)
  const sessionLimit = Math.max(0, options.sessionLimit ?? DEFAULT_SESSION_LIMIT)

  let entries: Dirent[]
  try {
    entries = await readdir(options.root, { withFileTypes: true })
  } catch {
    return { scannedAt: now, projects: [] }
  }

  const sessionNames = options.sessionsRoot
    ? await loadSessionNames(options.sessionsRoot)
    : new Map<string, SessionNameRecord>()
  const sessionTitles = options.vscodeStorageRoot
    ? await loadVscodeSessionTitles(options.vscodeStorageRoot)
    : new Map<string, string>()
  const projects: ScannedProject[] = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue

    const project = await scanProject(join(options.root, entry.name), entry.name, {
      activeDays,
      sessionLimit,
      sessionNames,
      sessionTitles,
      now,
    })
    if (project) projects.push(project)
  }

  const selected = projects
    .sort((a, b) => b.summary.lastActiveAt - a.summary.lastActiveAt)
    .slice(0, projectLimit)

  for (const project of selected) {
    if (project.projectPath) {
      options.onProjectPath?.(project.summary.id, project.projectPath)
    }
  }

  return {
    scannedAt: now,
    projects: selected.map((project) => project.summary),
  }
}

interface ScanProjectOptions {
  activeDays: number
  sessionLimit: number
  sessionNames: Map<string, SessionNameRecord>
  sessionTitles: Map<string, string>
  now: number
}

interface ScannedSession {
  id: string
  lastActiveAt: number
}

interface ScannedProject {
  summary: ClaudeProjectSummary
  /** 会话 cwd 指向的真实项目目录；缺失时为 null */
  projectPath: string | null
}

interface ProjectIdentity {
  displayName: string
  projectPath: string | null
}

interface SessionNameRecord {
  name: string
  nameSource: ClaudeSessionNameSource
}

function normalizeNameSource(value: unknown): ClaudeSessionNameSource {
  return value === 'derived' || value === 'auto' || value === 'user' ? value : 'unknown'
}

async function scanProject(
  dirPath: string,
  dirName: string,
  options: ScanProjectOptions,
): Promise<ScannedProject | null> {
  let entries: Dirent[]
  try {
    entries = await readdir(dirPath, { withFileTypes: true })
  } catch {
    return null
  }

  const sessions: ScannedSession[] = []
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.jsonl')) continue

    try {
      const info = await stat(join(dirPath, entry.name))
      if (!info.isFile()) continue

      sessions.push({
        id: entry.name.slice(0, -'.jsonl'.length),
        lastActiveAt: Math.round(info.mtimeMs),
      })
    } catch {
      // 单个损坏/被锁定的会话文件不影响其他项目
    }
  }

  if (sessions.length === 0) return null

  sessions.sort((a, b) => b.lastActiveAt - a.lastActiveAt)
  const lastActiveAt = sessions[0]?.lastActiveAt ?? 0

  if (options.activeDays > 0 && options.now - lastActiveAt > options.activeDays * DAY_MS) {
    return null
  }

  const identity = await resolveProjectIdentity(dirPath, dirName, sessions)

  return {
    projectPath: identity.projectPath,
    summary: {
      id: projectId(dirPath),
      displayName: identity.displayName,
      lastActiveAt,
      sessionCount: sessions.length,
      sessions: sessions.slice(0, options.sessionLimit).map((session) => {
        const tabTitle = options.sessionTitles.get(session.id)
        if (tabTitle) {
          return { ...session, displayName: tabTitle, nameSource: 'tab' }
        }

        const record = options.sessionNames.get(session.id)
        return {
          ...session,
          displayName: record?.name ?? shortSessionId(session.id),
          nameSource: record?.nameSource ?? 'unknown',
        }
      }),
    },
  }
}

function shortSessionId(sessionId: string): string {
  return sessionId.slice(0, 8)
}

/**
 * 会话注册表：只读取 sessionId 与 name。
 * 文件由 Claude Code 自己维护；损坏、过大或字段不合法时跳过。
 */
async function loadSessionNames(sessionsRoot: string): Promise<Map<string, SessionNameRecord>> {
  const names = new Map<string, SessionNameRecord>()

  let entries: Dirent[]
  try {
    entries = await readdir(sessionsRoot, { withFileTypes: true })
  } catch {
    return names
  }

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue

    const filePath = join(sessionsRoot, entry.name)
    try {
      const info = await stat(filePath)
      if (!info.isFile() || info.size > SESSION_REGISTRY_MAX_BYTES) continue

      const parsed: unknown = JSON.parse(await readFile(filePath, 'utf8'))
      if (!parsed || typeof parsed !== 'object') continue

      const { sessionId, name, nameSource } = parsed as {
        sessionId?: unknown
        name?: unknown
        nameSource?: unknown
      }
      if (typeof sessionId !== 'string' || typeof name !== 'string') continue

      const displayName = name.trim()
      if (displayName) {
        names.set(sessionId, {
          name: displayName,
          nameSource: normalizeNameSource(nameSource),
        })
      }
    } catch {
      // 单个损坏的注册表文件不影响其他会话
    }
  }

  return names
}

interface WorkspaceDbCandidate {
  path: string
  mtime: number
}

/**
 * VSCode 页签名：只查 `Anthropic.claude-code` 这个 key 的 panelTabSessions。
 * 数据库被锁定、损坏或字段变化时直接跳过；不读取其他 key 或其他字段。
 */
async function loadVscodeSessionTitles(storageRoot: string): Promise<Map<string, string>> {
  const titles = new Map<string, string>()

  let entries: Dirent[]
  try {
    entries = await readdir(storageRoot, { withFileTypes: true })
  } catch {
    return titles
  }

  const candidates: WorkspaceDbCandidate[] = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue

    const dbPath = join(storageRoot, entry.name, VSCODE_STATE_DB)
    try {
      const info = await stat(dbPath)
      if (!info.isFile() || info.size > VSCODE_MAX_DB_BYTES) continue
      candidates.push({ path: dbPath, mtime: info.mtimeMs })
    } catch {
      // 工作区可能没有状态库
    }
  }

  // 新的状态库优先，避免旧标题覆盖刚更新的页签名
  candidates.sort((a, b) => b.mtime - a.mtime)
  for (const candidate of candidates.slice(0, VSCODE_MAX_DBS)) {
    for (const [sessionId, title] of readVscodeTitles(candidate.path)) {
      if (!titles.has(sessionId)) titles.set(sessionId, title)
    }
  }

  return titles
}

function readVscodeTitles(dbPath: string): Map<string, string> {
  const titles = new Map<string, string>()
  let db: DatabaseSync | null = null

  try {
    db = new DatabaseSync(dbPath, { readOnly: true })
    const row = db.prepare('SELECT value FROM ItemTable WHERE key = ?').get(VSCODE_STATE_KEY) as
      | { value?: unknown }
      | undefined
    const raw = row?.value
    const text = typeof raw === 'string' ? raw : Buffer.isBuffer(raw) ? raw.toString('utf8') : null
    if (!text) return titles

    const parsed: unknown = JSON.parse(text)
    if (!parsed || typeof parsed !== 'object') return titles

    const tabs = (parsed as { panelTabSessions?: unknown }).panelTabSessions
    if (!Array.isArray(tabs)) return titles

    for (const tab of tabs) {
      if (!tab || typeof tab !== 'object') continue

      const { sessionId, title } = tab as { sessionId?: unknown; title?: unknown }
      if (typeof sessionId !== 'string' || typeof title !== 'string') continue

      const displayTitle = title.trim()
      if (sessionId && displayTitle) titles.set(sessionId, displayTitle)
    }
  } catch {
    // VSCode 正在写库、数据库损坏或字段变化：跳过，回退注册表名/短 id
  } finally {
    try {
      db?.close()
    } catch {
      // 关闭失败不影响扫描
    }
  }

  return titles
}

async function resolveProjectIdentity(
  dirPath: string,
  dirName: string,
  sessions: ScannedSession[],
): Promise<ProjectIdentity> {
  for (const session of sessions.slice(0, CWD_SEARCH_SESSIONS)) {
    const cwd = await readSessionCwd(join(dirPath, `${session.id}.jsonl`))
    if (!cwd) continue

    const name = basename(cwd.replace(/[\\/]+$/, ''))
    return { displayName: name || dirName, projectPath: cwd }
  }

  return { displayName: dirName, projectPath: null }
}

/** 只取顶层 cwd；解析失败的行直接跳过，不记录任何内容 */
async function readSessionCwd(filePath: string): Promise<string | null> {
  let handle: FileHandle | null = null

  try {
    handle = await open(filePath, 'r')
    const buffer = Buffer.alloc(CWD_READ_BYTES)
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0)
    const text = buffer.subarray(0, bytesRead).toString('utf8')
    const cleanText = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text

    for (const line of cleanText.split(/\r?\n/)) {
      if (!line.trim()) continue

      try {
        const parsed: unknown = JSON.parse(line)
        if (
          parsed &&
          typeof parsed === 'object' &&
          typeof (parsed as { cwd?: unknown }).cwd === 'string'
        ) {
          return (parsed as { cwd: string }).cwd
        }
      } catch {
        // 文件末尾可能是不完整的一行；忽略
      }
    }
  } catch {
    return null
  } finally {
    await handle?.close()
  }

  return null
}

function projectId(dirPath: string): string {
  return createHash('sha256').update(dirPath).digest('hex').slice(0, 16)
}

export interface ClaudeProjectLocation {
  /** 会话 cwd 指向的真实项目目录；只在主进程使用 */
  path: string
  sessions: string[]
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory()
  } catch {
    return false
  }
}

export interface ClaudeCodeServiceOptions {
  root: string
  /** 会话注册表目录；只读取 sessionId、name 与 nameSource */
  sessionsRoot?: string
  /** VSCode workspaceStorage 目录；只读取页签名 */
  vscodeStorageRoot?: string
  /** 每次扫描时读取，设置变化后自动失效缓存 */
  activeDays: () => number
  cacheTtlMs?: number
  now?: () => number
}

export interface ClaudeCodeSnapshotOptions {
  refresh?: boolean
}

/** 扫描缓存：默认 5 分钟；面板主动刷新时绕过缓存 */
export class ClaudeCodeService {
  private readonly options: ClaudeCodeServiceOptions
  private snapshot: ClaudeCodeSnapshot | null = null
  private projectPaths = new Map<string, string>()
  private cachedRangeDays: number | null = null
  private cachedAt = 0
  private inFlight: Promise<ClaudeCodeSnapshot> | null = null

  constructor(options: ClaudeCodeServiceOptions) {
    this.options = options
  }

  async getSnapshot(input: ClaudeCodeSnapshotOptions = {}): Promise<ClaudeCodeSnapshot> {
    const now = this.options.now?.() ?? Date.now()
    const activeDays = this.options.activeDays()
    const ttl = this.options.cacheTtlMs ?? CACHE_TTL_MS

    if (
      !input.refresh &&
      this.snapshot &&
      this.cachedRangeDays === activeDays &&
      now - this.cachedAt < ttl
    ) {
      return this.snapshot
    }
    if (this.inFlight) return this.inFlight

    const projectPaths = new Map<string, string>()
    this.inFlight = scanClaudeProjects({
      root: this.options.root,
      sessionsRoot: this.options.sessionsRoot,
      vscodeStorageRoot: this.options.vscodeStorageRoot,
      activeDays,
      now,
      onProjectPath: (id, path) => projectPaths.set(id, path),
    })
      .then((snapshot) => {
        this.snapshot = snapshot
        this.projectPaths = projectPaths
        this.cachedRangeDays = activeDays
        this.cachedAt = now
        return snapshot
      })
      .finally(() => {
        this.inFlight = null
      })

    return this.inFlight
  }

  /** 点击台词只读当前缓存，不额外触发扫描 */
  getCachedSnapshot(): ClaudeCodeSnapshot | null {
    return this.snapshot
  }

  /** 面板点击时用项目 id 换取真实 cwd；同时校验目录存在且会话仍属于最近列表 */
  async getProjectLocation(projectIdValue: string): Promise<ClaudeProjectLocation | null> {
    const project = this.snapshot?.projects.find((item) => item.id === projectIdValue)
    if (!project) return null

    const path = this.projectPaths.get(projectIdValue)
    if (!path || !isAbsolute(path) || !(await isDirectory(path))) return null

    return { path, sessions: project.sessions.map((session) => session.id) }
  }
}
