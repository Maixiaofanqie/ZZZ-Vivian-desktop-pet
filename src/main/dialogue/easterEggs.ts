import type { DialogueLine } from './lines'

export interface EasterEggLine extends DialogueLine {
  /** 对应里程碑 id；纪念日按 anniversary 前缀匹配 */
  milestone: string
}

/** P5 内置彩蛋台词；由里程碑一次性触发，不进入普通随机池 */
export const EASTER_EGG_LINES: EasterEggLine[] = [
  {
    id: 'egg-anniversary-01',
    milestone: 'anniversary',
    text: '法厄同大人，今天……是薇薇安第一次来到您桌面的日子呢。薇薇安记得很清楚。',
    timeRange: 'any',
    tags: ['easter-egg'],
  },
  {
    id: 'egg-anniversary-02',
    milestone: 'anniversary',
    text: '一年前的今天，薇薇安来到了法厄同大人的桌面。……今年也能陪在您身边，真好。',
    timeRange: 'any',
    tags: ['easter-egg'],
  },
  {
    id: 'egg-interactions-100',
    milestone: 'interactions-100',
    text: '法厄同大人，第一百次了呢。……每一次叫薇薇安的时候，我都有好好记着。',
    timeRange: 'any',
    tags: ['easter-egg'],
  },
]

/** 按里程碑 id 选择彩蛋台词；没有对应彩蛋时返回 null */
export function selectEasterEggLine(
  milestoneId: string,
  random: () => number = Math.random,
): EasterEggLine | null {
  const key = milestoneId.startsWith('anniversary-') ? 'anniversary' : milestoneId
  const candidates = EASTER_EGG_LINES.filter((line) => line.milestone === key)
  if (candidates.length === 0) return null

  const index = Math.min(
    candidates.length - 1,
    Math.floor(Math.max(0, random()) * candidates.length),
  )
  return candidates[index] ?? null
}
