import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { FileLogger, localDayKey } from '../src/main/services/fileLogger'

const FIXED = new Date(2026, 9, 26, 20, 15, 30, 123).getTime()
const DAY_MS = 24 * 60 * 60 * 1000
const tempDirs: string[] = []

function createTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'vivian-log-'))
  tempDirs.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true })
  }
  tempDirs.length = 0
})

describe('文件日志', () => {
  it('按本地日期写入主日志，并保留级别与结构化参数', () => {
    const dir = createTempDir()
    const logger = new FileLogger({ logDir: dir, now: () => FIXED })

    logger.info('应用启动', { version: '1.0.0', packaged: true })
    logger.warn('天气更新失败')

    const path = join(dir, `main-${localDayKey(FIXED)}.log`)
    const text = readFileSync(path, 'utf8')

    expect(text).toContain('[INFO] 应用启动')
    expect(text).toContain('"version":"1.0.0"')
    expect(text).toContain('"packaged":true')
    expect(text).toContain('[WARN] 天气更新失败')
  })

  it('崩溃单独写入 crash 日志，并带进程、堆栈与详情', () => {
    const dir = createTempDir()
    const logger = new FileLogger({ logDir: dir, now: () => FIXED })

    logger.crash('renderer', new Error('渲染进程挂了'), {
      window: 'pet',
      reason: 'crashed',
      exitCode: 133,
    })

    const crashPath = join(dir, `crash-${localDayKey(FIXED)}.log`)
    const crashText = readFileSync(crashPath, 'utf8')
    const mainText = readFileSync(join(dir, `main-${localDayKey(FIXED)}.log`), 'utf8')

    expect(crashText).toContain('[renderer]')
    expect(crashText).toContain('Error: 渲染进程挂了')
    expect(crashText).toContain('"window":"pet"')
    expect(crashText).toContain('"exitCode":133')
    expect(mainText).toContain('崩溃记录：renderer')
  })

  it('清理超过保留天数的主日志，保留仍在保留期内的崩溃日志', () => {
    const dir = createTempDir()
    const oldDay = localDayKey(FIXED - 10 * DAY_MS)
    const oldMain = join(dir, `main-${oldDay}.log`)
    const oldCrash = join(dir, `crash-${oldDay}.log`)
    writeFileSync(oldMain, 'old main')
    writeFileSync(oldCrash, 'old crash')

    new FileLogger({
      logDir: dir,
      now: () => FIXED,
      mainRetentionDays: 7,
      crashRetentionDays: 14,
    })

    expect(existsSync(oldMain)).toBe(false)
    expect(existsSync(oldCrash)).toBe(true)
  })

  it('循环引用、普通字符串与未知类型不会让日志写入抛错', () => {
    const dir = createTempDir()
    const logger = new FileLogger({ logDir: dir, now: () => FIXED })
    const circular: Record<string, unknown> = {}
    circular.self = circular

    expect(() => logger.info('循环引用', circular)).not.toThrow()
    expect(() => logger.crash('renderer', '非 Error 崩溃', { circular })).not.toThrow()

    const mainText = readFileSync(join(dir, `main-${localDayKey(FIXED)}.log`), 'utf8')
    const crashText = readFileSync(join(dir, `crash-${localDayKey(FIXED)}.log`), 'utf8')
    expect(mainText).toContain('[Circular]')
    expect(crashText).toContain('非 Error 崩溃')
    expect(crashText).toContain('[Circular]')
  })
})
