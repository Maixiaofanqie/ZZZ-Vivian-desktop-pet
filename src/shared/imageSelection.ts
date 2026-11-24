import type { ImageMode } from './ipc'

export const DEFAULT_IMAGE_MODE: ImageMode = 'cycle'
export const DEFAULT_IMAGE_ID = 'vivian_static_07'

/** 在已知形象列表中循环到下一张；当前 id 不存在时回到第一张 */
export function nextImageId(ids: string[], current: string): string {
  if (ids.length === 0) return current
  const index = ids.indexOf(current)
  return ids[(index + 1 + ids.length) % ids.length] ?? ids[0]
}
