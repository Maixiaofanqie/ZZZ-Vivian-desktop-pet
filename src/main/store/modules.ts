import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import { logger } from '../services/logger'
import { createEmptyModulesFile, type ModulesFile, normalizeModulesFile } from './modulesFile'

let cached: ModulesFile | null = null

function modulesFilePath(): string {
  return join(app.getPath('userData'), 'modules.json')
}

function writeFile(file: ModulesFile): void {
  const path = modulesFilePath()
  const tempPath = `${path}.tmp`

  mkdirSync(app.getPath('userData'), { recursive: true })
  writeFileSync(tempPath, JSON.stringify(file, null, 2), { encoding: 'utf8' })

  try {
    renameSync(tempPath, path)
  } catch {
    rmSync(path, { force: true })
    renameSync(tempPath, path)
  }

  cached = file
}

function backupCorrupt(path: string): void {
  try {
    const backupPath = `${path}.corrupt-${Date.now()}`
    copyFileSync(path, backupPath)
    logger.warn(`模块数据损坏，已备份到 ${backupPath}`)
  } catch (error) {
    logger.warn('模块数据损坏，备份失败', error)
  }
}

function readFile(): ModulesFile {
  if (cached) return cached

  const path = modulesFilePath()
  if (!existsSync(path)) {
    cached = createEmptyModulesFile()
    return cached
  }

  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'))
    const normalized = normalizeModulesFile(parsed)
    if (!normalized) {
      backupCorrupt(path)
      cached = createEmptyModulesFile()
    } else {
      cached = normalized
    }
  } catch (error) {
    backupCorrupt(path)
    logger.warn('读取模块数据失败，已回退默认值', error)
    cached = createEmptyModulesFile()
  }

  return cached
}

export function getModuleStates(): Record<string, unknown> {
  return { ...readFile().modules }
}

export function getModuleState<T>(id: string): T | null {
  const value = readFile().modules[id]
  return value === undefined ? null : (value as T)
}

export function setModuleState(id: string, state: unknown): void {
  const file = readFile()
  writeFile({
    ...file,
    modules: { ...file.modules, [id]: state },
  })
}

export function replaceModuleStates(states: Record<string, unknown>): void {
  writeFile({ schemaVersion: 1, modules: { ...states } })
}

export function getModulesFile(): ModulesFile {
  return readFile()
}
