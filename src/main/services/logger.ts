import { join } from 'node:path'
import { app } from 'electron'
import { FileLogger } from './fileLogger'

let fileLogger: FileLogger | null = null

function defaultLogDir(): string {
  return join(app.getPath('userData'), 'logs')
}

/**
 * 文件日志延迟初始化：app ready 前也能尽量拿到 userData，
 * 失败时只保留控制台输出，不因为日志影响启动。
 */
function getFileLogger(): FileLogger | null {
  if (fileLogger) return fileLogger

  try {
    fileLogger = new FileLogger({ logDir: defaultLogDir() })
    return fileLogger
  } catch (error) {
    console.warn('[main] 文件日志初始化失败，仅输出到控制台', error)
    return null
  }
}

/** app ready 后调用，确保日志目录使用最终 userData 路径 */
export function configureFileLogger(logDir = defaultLogDir()): void {
  try {
    fileLogger = new FileLogger({ logDir })
  } catch (error) {
    fileLogger = null
    console.warn('[main] 配置文件日志失败，仅输出到控制台', error)
  }
}

/** 测试用：清空单例，避免跨用例共享文件句柄 */
export function resetFileLoggerForTests(): void {
  fileLogger = null
}

export const logger = {
  info(message: string, ...args: unknown[]): void {
    console.info(`[main] ${message}`, ...args)
    getFileLogger()?.info(message, ...args)
  },
  warn(message: string, ...args: unknown[]): void {
    console.warn(`[main] ${message}`, ...args)
    getFileLogger()?.warn(message, ...args)
  },
  error(message: string, ...args: unknown[]): void {
    console.error(`[main] ${message}`, ...args)
    getFileLogger()?.error(message, ...args)
  },
  crash(kind: string, error: unknown, details?: Record<string, unknown>): void {
    console.error(`[main] 崩溃记录：${kind}`, details ?? '', error)
    getFileLogger()?.crash(kind, error, details)
  },
}
