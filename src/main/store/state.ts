import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import { STATE_SCHEMA_VERSION } from '../../shared/constants'

interface PersistedState {
  schemaVersion: number
  pet?: { x: number; y: number }
}

let cached: PersistedState | null = null

function stateFilePath(): string {
  return join(app.getPath('userData'), 'state.json')
}

function isFinitePosition(value: unknown): value is { x: number; y: number } {
  if (!value || typeof value !== 'object') return false
  const position = value as { x?: unknown; y?: unknown }
  return (
    typeof position.x === 'number' &&
    typeof position.y === 'number' &&
    Number.isFinite(position.x) &&
    Number.isFinite(position.y)
  )
}

function readState(): PersistedState {
  if (cached) return cached

  const path = stateFilePath()
  if (!existsSync(path)) {
    cached = { schemaVersion: STATE_SCHEMA_VERSION }
    return cached
  }

  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as PersistedState
    if (parsed.schemaVersion !== STATE_SCHEMA_VERSION || !isFinitePosition(parsed.pet)) {
      cached = { schemaVersion: STATE_SCHEMA_VERSION }
    } else {
      cached = parsed
    }
  } catch {
    cached = { schemaVersion: STATE_SCHEMA_VERSION }
  }

  return cached
}

function writeState(state: PersistedState): void {
  const path = stateFilePath()
  const tempPath = `${path}.tmp`

  mkdirSync(app.getPath('userData'), { recursive: true })
  writeFileSync(tempPath, JSON.stringify(state, null, 2), { encoding: 'utf8' })

  try {
    renameSync(tempPath, path)
  } catch {
    // Windows 下覆盖已存在文件可能失败，退化为先删除再重命名
    rmSync(path, { force: true })
    renameSync(tempPath, path)
  }

  cached = state
}

export function loadWindowPosition(): { x: number; y: number } | null {
  const state = readState()
  return isFinitePosition(state.pet) ? state.pet : null
}

export function saveWindowPosition(x: number, y: number): void {
  const state = readState()
  writeState({
    ...state,
    schemaVersion: STATE_SCHEMA_VERSION,
    pet: { x: Math.round(x), y: Math.round(y) },
  })
}
