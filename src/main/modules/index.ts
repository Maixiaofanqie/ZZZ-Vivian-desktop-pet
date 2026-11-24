import { chimeModule } from './chime'
import { claudeCodeModule } from './claudeCode'
import { pomodoroModule } from './pomodoro'
import { remindersModule } from './reminders'
import type { PetModule } from './types'
import { weatherModule } from './weather'

/**
 * 编译期模块清单。
 * 新增模块时在这里静态 import 并加入数组；不加载外部代码。
 */
export const APP_MODULES: PetModule[] = [
  pomodoroModule,
  remindersModule,
  chimeModule,
  claudeCodeModule,
  weatherModule,
]
