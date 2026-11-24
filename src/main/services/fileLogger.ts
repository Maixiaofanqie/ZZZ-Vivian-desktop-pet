import { appendFileSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'

export type LogLevel = 'info' | 'warn' | 'error'

export interface FileLoggerOptions {
  logDir: string
  now?: () => number
  /** 主日志保留天数，含当天 */
  mainRetentionDays?: number
  /** 崩溃日志保留天数，含当天 */
  crashRetentionDays?: number
}

const DAY_MS = 24 * 60 * 60 * 1000
const MAIN_PREFIX = 'main-'
const CRASH_PREFIX = 'crash-'
const LOG_SUFFIX = '.log'

export const DEFAULT_MAIN_RETENTION_DAYS = 7
export const DEFAULT_CRASH_RETENTION_DAYS = 14

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

/** 本地自然日键；与日志文件名的日期部分一致 */
export function localDayKey(now: number): string {
  const date = new Date(now)
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

export function formatLogTimestamp(now: number): string {
  const date = new Date(now)
  return `${localDayKey(now)} ${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(
    date.getSeconds(),
  )}.${String(date.getMilliseconds()).padStart(3, '0')}`
}

function safeJson(value: unknown): string {
  const seen = new WeakSet<object>()

  try {
    return (
      JSON.stringify(value, (_key, item: unknown) => {
        if (typeof item === 'bigint') return `${item}n`
        if (typeof item === 'object' && item !== null) {
          if (seen.has(item)) return '[Circular]'
          seen.add(item)
        }
        return item
      }) ?? String(value)
    )
  } catch {
    return String(value)
  }
}

/** 把日志参数转成可读文本；Error 带堆栈，循环引用不抛错 */
export function serializeLogArgs(args: readonly unknown[]): string {
  if (args.length === 0) return ''

  return args
    .map((arg) => {
      if (arg instanceof Error) {
        const cause =
          arg.cause instanceof Error
            ? `\nCaused by: ${arg.cause.stack ?? `${arg.cause.name}: ${arg.cause.message}`}`
            : ''
        // stack 已包含「Error: message」首行，避免重复
        return `${arg.stack ?? `${arg.name}: ${arg.message}`}${cause}`
      }

      if (typeof arg === 'string') return arg
      if (arg === null || arg === undefined) return String(arg)
      if (typeof arg === 'number' || typeof arg === 'boolean') return String(arg)
      return safeJson(arg)
    })
    .join(' ')
}

export function formatLogLine(
  level: LogLevel,
  message: string,
  args: readonly unknown[],
  now: number,
): string {
  const extra = serializeLogArgs(args)
  return `[${formatLogTimestamp(now)}] [${level.toUpperCase()}] ${message}${
    extra ? ` ${extra}` : ''
  }\n`
}

export function formatCrashEntry(
  kind: string,
  error: unknown,
  details: Record<string, unknown> | undefined,
  now: number,
): string {
  const errorText =
    error instanceof Error
      ? (error.stack ?? `${error.name}: ${error.message}`)
      : serializeLogArgs([error])
  const detailText = details ? `\n详情: ${safeJson(details)}` : ''

  return `=== ${formatLogTimestamp(now)} [${kind}] ===\n${errorText}${detailText}\n\n`
}

/**
 * 主进程文件日志。
 * 写入采用同步 append：日志量小，崩溃时也能保证最后一条落盘。
 * 文件写入失败只回退到控制台，不影响应用运行。
 */
export class FileLogger {
  private readonly logDir: string
  private readonly now: () => number
  private readonly mainRetentionDays: number
  private readonly crashRetentionDays: number
  private lastCleanupDay: string | null = null

  constructor(options: FileLoggerOptions) {
    this.logDir = options.logDir
    this.now = options.now ?? Date.now
    this.mainRetentionDays = Math.max(
      1,
      Math.floor(options.mainRetentionDays ?? DEFAULT_MAIN_RETENTION_DAYS),
    )
    this.crashRetentionDays = Math.max(
      1,
      Math.floor(options.crashRetentionDays ?? DEFAULT_CRASH_RETENTION_DAYS),
    )
    this.cleanup()
  }

  info(message: string, ...args: unknown[]): void {
    this.writeMain('info', message, args)
  }

  warn(message: string, ...args: unknown[]): void {
    this.writeMain('warn', message, args)
  }

  error(message: string, ...args: unknown[]): void {
    this.writeMain('error', message, args)
  }

  /** 崩溃单独落盘，同时写一条 error 到主日志，便于按时间线排查 */
  crash(kind: string, error: unknown, details?: Record<string, unknown>): void {
    const now = this.now()
    this.cleanupForDay(localDayKey(now))
    this.append(this.crashPath(now), formatCrashEntry(kind, error, details, now))
    this.append(
      this.mainPath(now),
      formatLogLine('error', `崩溃记录：${kind}`, details ? [details] : [], now),
    )
  }

  /** 清理超过保留天数的日志；可在启动或日期切换时调用 */
  cleanup(): void {
    const now = this.now()
    this.cleanupByPrefix(MAIN_PREFIX, now, this.mainRetentionDays)
    this.cleanupByPrefix(CRASH_PREFIX, now, this.crashRetentionDays)
    this.lastCleanupDay = localDayKey(now)
  }

  private writeMain(level: LogLevel, message: string, args: readonly unknown[]): void {
    const now = this.now()
    this.cleanupForDay(localDayKey(now))
    this.append(this.mainPath(now), formatLogLine(level, message, args, now))
  }

  private cleanupForDay(day: string): void {
    if (this.lastCleanupDay === day) return

    this.cleanupByPrefix(MAIN_PREFIX, this.now(), this.mainRetentionDays)
    this.cleanupByPrefix(CRASH_PREFIX, this.now(), this.crashRetentionDays)
    this.lastCleanupDay = day
  }

  private append(path: string, text: string): void {
    try {
      mkdirSync(this.logDir, { recursive: true })
      appendFileSync(path, text, { encoding: 'utf8' })
    } catch (error) {
      console.error('[logger] 文件日志写入失败', error)
    }
  }

  private mainPath(now: number): string {
    return join(this.logDir, `${MAIN_PREFIX}${localDayKey(now)}${LOG_SUFFIX}`)
  }

  private crashPath(now: number): string {
    return join(this.logDir, `${CRASH_PREFIX}${localDayKey(now)}${LOG_SUFFIX}`)
  }

  private cleanupByPrefix(prefix: string, now: number, retentionDays: number): void {
    let names: string[]

    try {
      names = readdirSync(this.logDir)
    } catch {
      return
    }

    const cutoff = localDayKey(now - (retentionDays - 1) * DAY_MS)
    for (const name of names) {
      if (!name.startsWith(prefix) || !name.endsWith(LOG_SUFFIX)) continue

      const day = name.slice(prefix.length, -LOG_SUFFIX.length)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue
      if (day >= cutoff) continue

      try {
        unlinkSync(join(this.logDir, name))
      } catch (error) {
        console.warn(`[logger] 旧日志清理失败：${name}`, error)
      }
    }
  }
}
