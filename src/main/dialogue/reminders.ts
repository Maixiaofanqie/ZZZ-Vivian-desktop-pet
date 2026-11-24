import type { DialogueLine } from './lines'

/** 作息提醒台词：由 RoutineReminder 按 idle / sleep 标签显式取用，不进入普通随机池 */
export const REMINDER_LINES: DialogueLine[] = [
  {
    id: 'reminder-idle-01',
    text: '已经坐了一小时了，法厄同大人。站起来走两步，薇薇安替您看着桌面。',
    timeRange: 'any',
    tags: ['reminder', 'idle'],
  },
  {
    id: 'reminder-idle-02',
    text: '法厄同大人，肩膀是不是又僵了？稍微活动一下吧，就一会儿。',
    timeRange: 'any',
    tags: ['reminder', 'idle'],
  },
  {
    id: 'reminder-idle-03',
    text: '一直盯着屏幕的话，眼睛会先抗议的。法厄同大人，歇一下。',
    timeRange: 'any',
    tags: ['reminder', 'idle'],
  },
  {
    id: 'reminder-sleep-01',
    text: '这么晚了……法厄同大人，该休息了。剩下的明天再想，好不好？',
    timeRange: 'any',
    tags: ['reminder', 'sleep'],
  },
  {
    id: 'reminder-sleep-02',
    text: '已经很晚了呢，法厄同大人。薇薇安把灯关小一点，您也去睡吧。',
    timeRange: 'any',
    tags: ['reminder', 'sleep'],
  },
  {
    id: 'reminder-sleep-03',
    text: '法厄同大人，夜里想的事，常常第二天就不一样了。先睡吧。',
    timeRange: 'any',
    tags: ['reminder', 'sleep'],
  },
]
