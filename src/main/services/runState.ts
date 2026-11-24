import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

export interface RunState {
  startedAt: number
  cleanExit: boolean
  endedAt?: number
}

export interface BeginRunResult {
  previous: RunState | null
  /** 上一次运行没有写正常退出标记 */
  crashed: boolean
  state: RunState
}

export function runStatePath(userDataDir: string): string {
  return join(userDataDir, 'run-state.json')
}

function isFinitePositive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function isRunState(value: unknown): value is RunState {
  if (!value || typeof value !== 'object') return false

  const record = value as Partial<RunState>
  return (
    isFinitePositive(record.startedAt) &&
    typeof record.cleanExit === 'boolean' &&
    (record.endedAt === undefined || isFinitePositive(record.endedAt))
  )
}

export function readRunState(path: string): RunState | null {
  try {
    if (!existsSync(path)) return null
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'))
    return isRunState(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function writeRunState(path: string, state: RunState): void {
  mkdirSync(dirname(path), { recursive: true })
  const tempPath = `${path}.tmp`
  writeFileSync(tempPath, JSON.stringify(state, null, 2), { encoding: 'utf8' })

  try {
    renameSync(tempPath, path)
  } catch {
    rmSync(path, { force: true })
    renameSync(tempPath, path)
  }
}

/**
 * 启动时写 cleanExit=false；只有正常退出才会覆盖为 true。
 * 下次启动读到 false 即说明上次没有走正常退出流程。
 */
export function beginRun(path: string, now = Date.now()): BeginRunResult {
  const previous = readRunState(path)
  const state: RunState = { startedAt: now, cleanExit: false }
  writeRunState(path, state)

  return {
    previous,
    crashed: previous !== null && previous.cleanExit === false,
    state,
  }
}

export function endRun(path: string, startedAt: number, now = Date.now()): RunState {
  const state: RunState = { startedAt, cleanExit: true, endedAt: now }
  writeRunState(path, state)
  return state
}
