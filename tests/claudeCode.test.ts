import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import { ClaudeCodeService, scanClaudeProjects } from '../src/main/services/claudeCode'

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS
const NOW = Date.UTC(2026, 9, 24, 12, 0, 0)
const roots: string[] = []

interface SessionFixture {
  id: string
  ageMs: number
  cwd?: string
  content?: string
  firstLineWithoutCwd?: boolean
}

function createRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'vivian-claude-'))
  roots.push(root)
  return root
}

function createSessionsRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'vivian-claude-sessions-'))
  roots.push(root)
  return root
}

function writeSessionName(
  sessionsRoot: string,
  sessionId: string,
  name: string,
  extra: Record<string, unknown> = {},
): void {
  mkdirSync(sessionsRoot, { recursive: true })
  writeFileSync(
    join(sessionsRoot, `${sessionId}.json`),
    JSON.stringify({ pid: 1, sessionId, name, ...extra }),
    'utf8',
  )
}

function createVscodeStorageRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'vivian-claude-vscode-'))
  roots.push(root)
  return root
}

interface VscodeTabFixture {
  sessionId: string
  title: string
  [key: string]: unknown
}

function writeVscodeTitles(
  storageRoot: string,
  workspaceName: string,
  tabs: VscodeTabFixture[],
  extraState: Record<string, unknown> = {},
): string {
  const dir = join(storageRoot, workspaceName)
  mkdirSync(dir, { recursive: true })

  const dbPath = join(dir, 'state.vscdb')
  const db = new DatabaseSync(dbPath)
  try {
    db.exec('CREATE TABLE ItemTable (key TEXT PRIMARY KEY, value TEXT)')
    db.prepare('INSERT INTO ItemTable (key, value) VALUES (?, ?)').run(
      'Anthropic.claude-code',
      JSON.stringify({ panelTabSessions: tabs, ...extraState }),
    )
  } finally {
    db.close()
  }

  return dbPath
}

function writeSession(root: string, dirName: string, session: SessionFixture): void {
  const dir = join(root, dirName)
  mkdirSync(dir, { recursive: true })

  const file = join(dir, `${session.id}.jsonl`)
  const lines = [
    ...(session.firstLineWithoutCwd
      ? [JSON.stringify({ type: 'summary', sessionId: session.id })]
      : []),
    JSON.stringify({
      type: 'user',
      cwd: session.cwd,
      message: { role: 'user', content: session.content ?? '普通消息' },
    }),
  ]

  writeFileSync(file, `${lines.join('\n')}\n`, 'utf8')
  const time = new Date(NOW - session.ageMs)
  utimesSync(file, time, time)
}

function writeCorruptSession(root: string, dirName: string, id: string, ageMs: number): void {
  const dir = join(root, dirName)
  mkdirSync(dir, { recursive: true })

  const file = join(dir, `${id}.jsonl`)
  writeFileSync(file, '{"type":"user", broken\n', 'utf8')
  const time = new Date(NOW - ageMs)
  utimesSync(file, time, time)
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe('Claude Code 扫描', () => {
  it('读取项目名、最后活跃时间、会话数与最近会话', async () => {
    const root = createRoot()
    writeSession(root, 'h--work-Alpha', {
      id: 'session-old',
      ageMs: 2 * DAY_MS,
      cwd: 'H:\\work\\Alpha',
      content: 'TOP-SECRET-MESSAGE',
    })
    writeSession(root, 'h--work-Alpha', {
      id: 'session-new',
      ageMs: HOUR_MS,
      cwd: 'H:\\work\\Alpha',
    })
    writeSession(root, 'h--other-Beta', {
      id: 'beta-session',
      ageMs: 3 * HOUR_MS,
      cwd: 'H:\\other\\Beta',
    })

    const snapshot = await scanClaudeProjects({ root, now: NOW, activeDays: 30 })

    expect(snapshot.scannedAt).toBe(NOW)
    expect(snapshot.projects).toHaveLength(2)

    const alpha = snapshot.projects[0]
    expect(alpha?.displayName).toBe('Alpha')
    expect(alpha?.sessionCount).toBe(2)
    expect(alpha?.sessions.map((session) => session.id)).toEqual(['session-new', 'session-old'])
    expect(Math.abs((alpha?.lastActiveAt ?? 0) - (NOW - HOUR_MS))).toBeLessThan(2000)

    const beta = snapshot.projects[1]
    expect(beta?.displayName).toBe('Beta')
    expect(beta?.sessionCount).toBe(1)

    // 完整路径与消息内容都不进入快照
    const serialized = JSON.stringify(snapshot)
    expect(serialized).not.toContain(root)
    expect(serialized).not.toContain('H:')
    expect(serialized).not.toContain('TOP-SECRET-MESSAGE')

    // 项目 id 是内部哈希，不暴露目录名或路径
    expect(alpha?.id).toMatch(/^[0-9a-f]{16}$/)
    expect(alpha?.id).not.toBe('h--work-Alpha')
  })

  it('会话注册表名优先，缺失时回退短 id', async () => {
    const root = createRoot()
    const sessionsRoot = createSessionsRoot()
    writeSession(root, 'project', {
      id: 'named-session',
      ageMs: HOUR_MS,
      cwd: 'H:\\work\\Project',
    })
    writeSession(root, 'project', {
      id: 'unnamed-session',
      ageMs: 2 * HOUR_MS,
      cwd: 'H:\\work\\Project',
    })
    writeSession(root, 'project', {
      id: 'auto-session',
      ageMs: 3 * HOUR_MS,
      cwd: 'H:\\work\\Project',
    })
    writeSessionName(sessionsRoot, 'named-session', 'P6.5 联动', {
      cwd: 'H:\\private\\path',
      status: 'busy',
      nameSource: 'derived',
    })
    writeSessionName(sessionsRoot, 'auto-session', '自动标题', {
      nameSource: 'auto',
    })
    writeFileSync(join(sessionsRoot, 'broken.json'), '{"name":', 'utf8')
    writeSessionName(sessionsRoot, 'blank-session', '   ')

    const snapshot = await scanClaudeProjects({ root, sessionsRoot, now: NOW })
    const sessions = snapshot.projects[0]?.sessions ?? []

    expect(sessions.find((session) => session.id === 'named-session')?.displayName).toBe(
      'P6.5 联动',
    )
    expect(sessions.find((session) => session.id === 'named-session')?.nameSource).toBe('derived')
    expect(sessions.find((session) => session.id === 'unnamed-session')?.displayName).toBe(
      'unnamed-',
    )
    expect(sessions.find((session) => session.id === 'unnamed-session')?.nameSource).toBe('unknown')
    expect(sessions.find((session) => session.id === 'auto-session')?.displayName).toBe('自动标题')
    expect(sessions.find((session) => session.id === 'auto-session')?.nameSource).toBe('auto')

    // 注册表里的 cwd/status 等字段不进入快照
    const serialized = JSON.stringify(snapshot)
    expect(serialized).not.toContain('H:')
    expect(serialized).not.toContain('busy')
  })

  it('会话注册表缺失时不影响扫描', async () => {
    const root = createRoot()
    writeSession(root, 'project', {
      id: 'session',
      ageMs: HOUR_MS,
      cwd: 'H:\\work\\Project',
    })

    const snapshot = await scanClaudeProjects({
      root,
      sessionsRoot: join(root, 'missing-sessions'),
      now: NOW,
    })

    expect(snapshot.projects[0]?.sessions[0]?.displayName).toBe('session')
  })

  it('VSCode 页签名优先于注册表名与短 id', async () => {
    const root = createRoot()
    const sessionsRoot = createSessionsRoot()
    const vscodeRoot = createVscodeStorageRoot()

    writeSession(root, 'project', {
      id: 'tab-session',
      ageMs: HOUR_MS,
      cwd: 'H:\\work\\Project',
    })
    writeSession(root, 'project', {
      id: 'registry-session',
      ageMs: 2 * HOUR_MS,
      cwd: 'H:\\work\\Project',
    })
    writeSession(root, 'project', {
      id: 'fallback-session',
      ageMs: 3 * HOUR_MS,
      cwd: 'H:\\work\\Project',
    })
    writeSessionName(sessionsRoot, 'tab-session', '注册表名 A', { nameSource: 'derived' })
    writeSessionName(sessionsRoot, 'registry-session', '注册表名 B', { nameSource: 'user' })
    writeVscodeTitles(
      vscodeRoot,
      'workspace-a',
      [
        {
          sessionId: 'tab-session',
          title: 'P6.5 Claude Code 联动',
          messages: 'TOP-SECRET-MESSAGE',
        },
      ],
      { secret: 'TOP-SECRET-TOP' },
    )

    const snapshot = await scanClaudeProjects({
      root,
      sessionsRoot,
      vscodeStorageRoot: vscodeRoot,
      now: NOW,
    })
    const sessions = snapshot.projects[0]?.sessions ?? []

    expect(sessions.find((session) => session.id === 'tab-session')).toMatchObject({
      displayName: 'P6.5 Claude Code 联动',
      nameSource: 'tab',
    })
    expect(sessions.find((session) => session.id === 'registry-session')).toMatchObject({
      displayName: '注册表名 B',
      nameSource: 'user',
    })
    expect(sessions.find((session) => session.id === 'fallback-session')).toMatchObject({
      displayName: 'fallback',
      nameSource: 'unknown',
    })

    const serialized = JSON.stringify(snapshot)
    expect(serialized).not.toContain('TOP-SECRET-MESSAGE')
    expect(serialized).not.toContain('TOP-SECRET-TOP')
  })

  it('同一会话取最新状态库的页签名', async () => {
    const root = createRoot()
    const vscodeRoot = createVscodeStorageRoot()
    writeSession(root, 'project', {
      id: 'session',
      ageMs: HOUR_MS,
      cwd: 'H:\\work\\Project',
    })

    const oldDb = writeVscodeTitles(vscodeRoot, 'old-workspace', [
      { sessionId: 'session', title: '旧标题' },
    ])
    const newDb = writeVscodeTitles(vscodeRoot, 'new-workspace', [
      { sessionId: 'session', title: '新标题' },
    ])
    utimesSync(oldDb, new Date(NOW - 10_000), new Date(NOW - 10_000))
    utimesSync(newDb, new Date(NOW), new Date(NOW))

    const snapshot = await scanClaudeProjects({
      root,
      vscodeStorageRoot: vscodeRoot,
      now: NOW,
    })

    expect(snapshot.projects[0]?.sessions[0]?.displayName).toBe('新标题')
    expect(snapshot.projects[0]?.sessions[0]?.nameSource).toBe('tab')
  })

  it('VSCode 状态库损坏或缺失时回退注册表名', async () => {
    const root = createRoot()
    const sessionsRoot = createSessionsRoot()
    const vscodeRoot = createVscodeStorageRoot()
    writeSession(root, 'project', {
      id: 'session',
      ageMs: HOUR_MS,
      cwd: 'H:\\work\\Project',
    })
    writeSessionName(sessionsRoot, 'session', '注册表名', { nameSource: 'auto' })

    const brokenDir = join(vscodeRoot, 'broken-workspace')
    mkdirSync(brokenDir, { recursive: true })
    writeFileSync(join(brokenDir, 'state.vscdb'), 'not a sqlite database', 'utf8')

    const snapshot = await scanClaudeProjects({
      root,
      sessionsRoot,
      vscodeStorageRoot: vscodeRoot,
      now: NOW,
    })

    expect(snapshot.projects[0]?.sessions[0]).toMatchObject({
      displayName: '注册表名',
      nameSource: 'auto',
    })
  })

  it('最近会话按 mtime 倒序，最多 5 个', async () => {
    const root = createRoot()
    for (let index = 0; index < 7; index += 1) {
      writeSession(root, 'project', {
        id: `session-${index}`,
        ageMs: (index + 1) * HOUR_MS,
        cwd: 'H:\\work\\Project',
      })
    }

    const snapshot = await scanClaudeProjects({ root, now: NOW })
    const project = snapshot.projects[0]

    expect(project?.sessionCount).toBe(7)
    expect(project?.sessions.map((session) => session.id)).toEqual([
      'session-0',
      'session-1',
      'session-2',
      'session-3',
      'session-4',
    ])
  })

  it('最新会话缺少 cwd 时，从最近的会话继续查找', async () => {
    const root = createRoot()
    writeSession(root, 'fallback-dir', {
      id: 'older-session',
      ageMs: 2 * HOUR_MS,
      cwd: 'H:\\work\\NamedProject',
    })
    writeSession(root, 'fallback-dir', {
      id: 'latest-session',
      ageMs: HOUR_MS,
      cwd: undefined,
    })

    const snapshot = await scanClaudeProjects({ root, now: NOW })
    expect(snapshot.projects[0]?.displayName).toBe('NamedProject')
  })

  it('按活跃天数过滤，并限制项目数量', async () => {
    const root = createRoot()
    for (let index = 0; index < 6; index += 1) {
      writeSession(root, `active-${index}`, {
        id: `session-${index}`,
        ageMs: (index + 1) * HOUR_MS,
        cwd: `H:\\work\\Active${index}`,
      })
    }
    writeSession(root, 'old-project', {
      id: 'old-session',
      ageMs: 40 * DAY_MS,
      cwd: 'H:\\work\\Old',
    })

    const snapshot = await scanClaudeProjects({ root, now: NOW, activeDays: 30 })
    expect(snapshot.projects).toHaveLength(5)
    expect(snapshot.projects.map((project) => project.displayName)).toEqual([
      'Active0',
      'Active1',
      'Active2',
      'Active3',
      'Active4',
    ])

    const all = await scanClaudeProjects({
      root,
      now: NOW,
      activeDays: 0,
      projectLimit: 10,
    })
    expect(all.projects.map((project) => project.displayName)).toContain('Old')
  })

  it('目录缺失或会话损坏时不崩溃', async () => {
    const missing = await scanClaudeProjects({
      root: join(tmpdir(), 'vivian-claude-does-not-exist'),
      now: NOW,
    })
    expect(missing).toEqual({ scannedAt: NOW, projects: [] })

    const root = createRoot()
    writeCorruptSession(root, 'broken-project', 'broken-session', HOUR_MS)

    const snapshot = await scanClaudeProjects({ root, now: NOW })
    expect(snapshot.projects).toHaveLength(1)
    expect(snapshot.projects[0]?.displayName).toBe('broken-project')
    expect(snapshot.projects[0]?.sessionCount).toBe(1)
    expect(snapshot.projects[0]?.sessions[0]?.id).toBe('broken-session')
  })

  it('项目 id 在多次扫描间保持稳定', async () => {
    const root = createRoot()
    writeSession(root, 'project', {
      id: 'session',
      ageMs: HOUR_MS,
      cwd: 'H:\\work\\Project',
    })

    const first = await scanClaudeProjects({ root, now: NOW })
    const second = await scanClaudeProjects({ root, now: NOW + 1000 })
    expect(first.projects[0]?.id).toBe(second.projects[0]?.id)
  })

  it('按项目 id 解析真实 cwd，而不是 .claude 元数据目录', async () => {
    const root = createRoot()
    const realProject = mkdtempSync(join(tmpdir(), 'vivian-real-project-'))
    roots.push(realProject)
    writeSession(root, 'metadata-project', {
      id: 'session',
      ageMs: HOUR_MS,
      cwd: realProject,
    })

    const service = new ClaudeCodeService({
      root,
      activeDays: () => 30,
      now: () => NOW,
    })
    const snapshot = await service.getSnapshot()
    const location = await service.getProjectLocation(snapshot.projects[0]?.id ?? '')

    expect(location?.path).toBe(realProject)
    expect(location?.path).not.toBe(join(root, 'metadata-project'))
    expect(location?.sessions).toEqual(['session'])
    expect(await service.getProjectLocation('0000000000000000')).toBeNull()
  })

  it('真实 cwd 缺失或目录已移动时拒绝打开', async () => {
    const root = createRoot()
    writeSession(root, 'metadata-project', {
      id: 'missing-cwd',
      ageMs: HOUR_MS,
      cwd: undefined,
    })
    writeSession(root, 'metadata-project', {
      id: 'moved-cwd',
      ageMs: 2 * HOUR_MS,
      cwd: 'H:\\work\\AlreadyMoved',
    })

    const service = new ClaudeCodeService({
      root,
      activeDays: () => 30,
      now: () => NOW,
    })
    const snapshot = await service.getSnapshot()

    expect(await service.getProjectLocation(snapshot.projects[0]?.id ?? '')).toBeNull()
  })

  it('扫描回调只在主进程内提供真实 cwd', async () => {
    const root = createRoot()
    const realProject = mkdtempSync(join(tmpdir(), 'vivian-real-project-'))
    roots.push(realProject)
    writeSession(root, 'metadata-project', {
      id: 'session',
      ageMs: HOUR_MS,
      cwd: realProject,
    })

    const paths = new Map<string, string>()
    const snapshot = await scanClaudeProjects({
      root,
      now: NOW,
      onProjectPath: (id, path) => paths.set(id, path),
    })

    expect(paths.get(snapshot.projects[0]?.id ?? '')).toBe(realProject)
    expect(JSON.stringify(snapshot)).not.toContain(realProject)
  })
})

describe('Claude Code 扫描缓存', () => {
  it('默认复用 5 分钟缓存，refresh 绕过缓存', async () => {
    const root = createRoot()
    writeSession(root, 'project-a', {
      id: 'session-a',
      ageMs: HOUR_MS,
      cwd: 'H:\\work\\A',
    })

    let now = NOW
    const service = new ClaudeCodeService({
      root,
      activeDays: () => 30,
      now: () => now,
    })

    const first = await service.getSnapshot()
    expect(first.projects).toHaveLength(1)

    writeSession(root, 'project-b', {
      id: 'session-b',
      ageMs: 0,
      cwd: 'H:\\work\\B',
    })
    now += 1000

    const cached = await service.getSnapshot()
    expect(cached.projects).toHaveLength(1)

    const refreshed = await service.getSnapshot({ refresh: true })
    expect(refreshed.projects).toHaveLength(2)
  })

  it('项目范围变化后缓存自动失效', async () => {
    const root = createRoot()
    writeSession(root, 'recent', {
      id: 'recent-session',
      ageMs: HOUR_MS,
      cwd: 'H:\\work\\Recent',
    })
    writeSession(root, 'ten-days-old', {
      id: 'old-session',
      ageMs: 10 * DAY_MS,
      cwd: 'H:\\work\\TenDays',
    })

    let rangeDays = 30
    const service = new ClaudeCodeService({
      root,
      activeDays: () => rangeDays,
      now: () => NOW,
    })

    expect((await service.getSnapshot()).projects).toHaveLength(2)

    rangeDays = 7
    expect((await service.getSnapshot()).projects.map((project) => project.displayName)).toEqual([
      'Recent',
    ])
  })
})
