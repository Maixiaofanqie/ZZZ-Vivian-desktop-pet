import { BUBBLE_CHAR_FADE_MS, BUBBLE_CHAR_STAGGER_MS } from './constants'

/** 逐字淡入完成所需时间（毫秒），按 Unicode 码点计数 */
export function bubbleRevealMs(text: string): number {
  return Array.from(text).length * BUBBLE_CHAR_STAGGER_MS + BUBBLE_CHAR_FADE_MS
}
