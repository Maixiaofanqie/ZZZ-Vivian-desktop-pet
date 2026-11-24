import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app, type BrowserWindow, dialog } from 'electron'
import { logger } from '../services/logger'
import { createBackupPayload, formatBackupTimestamp, parseBackupPayload } from './backupPayload'
import { getModulesFile, replaceModuleStates } from './modules'
import { getProfileFile, replaceProfileFile } from './profile'
import { getSettings, replaceSettings } from './settings'
import { loadWindowPosition, saveWindowPosition } from './state'

const BACKUP_FILES = ['settings.json', 'profile.json', 'modules.json', 'state.json'] as const

export interface ExportResult {
  canceled: boolean
  filePath?: string
  error?: string
}

export interface ImportResult {
  canceled: boolean
  error?: string
  /** 备份中的窗口位置；由调用方夹紧到工作区后应用 */
  position: { x: number; y: number } | null
}

function userDataPath(file: string): string {
  return join(app.getPath('userData'), file)
}

/** 导入前把现有文件复制到 backup-<时间戳>/，便于手动恢复 */
function backupCurrentFiles(now: number): string {
  const dir = join(app.getPath('userData'), `backup-${formatBackupTimestamp(now)}`)
  mkdirSync(dir, { recursive: true })

  for (const file of BACKUP_FILES) {
    const source = userDataPath(file)
    if (existsSync(source)) {
      copyFileSync(source, join(dir, file))
    }
  }

  return dir
}

export async function exportBackup(window: BrowserWindow): Promise<ExportResult> {
  const now = Date.now()
  const payload = createBackupPayload({
    settings: getSettings(),
    profile: getProfileFile(),
    modules: getModulesFile(),
    position: loadWindowPosition(),
    now,
  })

  const result = await dialog.showSaveDialog(window, {
    title: '导出薇薇安的备份',
    defaultPath: join(app.getPath('documents'), `vivian-backup-${formatBackupTimestamp(now)}.json`),
    filters: [{ name: 'JSON 备份', extensions: ['json'] }],
  })

  if (result.canceled || !result.filePath) return { canceled: true }

  try {
    writeFileSync(result.filePath, JSON.stringify(payload, null, 2), { encoding: 'utf8' })
    logger.info('数据备份已导出')
    return { canceled: false, filePath: result.filePath }
  } catch (error) {
    logger.warn('导出备份失败', error)
    return { canceled: false, error: '写入备份文件失败，请换一个保存位置再试一次。' }
  }
}

export async function importBackup(window: BrowserWindow): Promise<ImportResult> {
  const picked = await dialog.showOpenDialog(window, {
    title: '导入薇薇安的备份',
    properties: ['openFile'],
    filters: [{ name: 'JSON 备份', extensions: ['json'] }],
  })

  if (picked.canceled || picked.filePaths.length === 0) {
    return { canceled: true, position: null }
  }

  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(picked.filePaths[0] as string, 'utf8'))
  } catch (error) {
    logger.warn('读取备份文件失败', error)
    return { canceled: false, error: '这个文件不是有效的 JSON 备份。', position: null }
  }

  const payload = parseBackupPayload(raw)
  if (!payload) {
    return { canceled: false, error: '备份内容无法识别，或版本不受支持。', position: null }
  }

  try {
    const backupDir = backupCurrentFiles(Date.now())
    replaceSettings(payload.settings)
    replaceProfileFile(payload.profile)
    replaceModuleStates(payload.modules.modules)
    if (payload.state.pet) {
      saveWindowPosition(payload.state.pet.x, payload.state.pet.y)
    }
    logger.info('数据备份已导入', { backupDir })
    return { canceled: false, position: payload.state.pet }
  } catch (error) {
    logger.warn('导入备份失败', error)
    return {
      canceled: false,
      error: '导入过程中写入失败，请重试，或使用自动备份恢复。',
      position: null,
    }
  }
}
