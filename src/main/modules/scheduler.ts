import type { ModuleScheduler } from './types'

/** 模块专用定时器集合；stop/dispose 时一次清空，避免残留 */
export function createModuleScheduler(): ModuleScheduler {
  const timeouts = new Set<ReturnType<typeof setTimeout>>()
  const intervals = new Set<ReturnType<typeof setInterval>>()

  return {
    setTimeout(callback, ms) {
      const handle = setTimeout(() => {
        timeouts.delete(handle)
        callback()
      }, ms)
      timeouts.add(handle)
      return handle
    },
    setInterval(callback, ms) {
      const handle = setInterval(callback, ms)
      intervals.add(handle)
      return handle
    },
    clearTimeout(handle) {
      clearTimeout(handle)
      timeouts.delete(handle)
    },
    clearInterval(handle) {
      clearInterval(handle)
      intervals.delete(handle)
    },
    clearAll() {
      for (const handle of timeouts) clearTimeout(handle)
      for (const handle of intervals) clearInterval(handle)
      timeouts.clear()
      intervals.clear()
    },
  }
}
