import { z } from 'zod'

/** 校验开机自启设置 */
export const autoLaunchSchema = z.boolean()

/** 校验待机微动效开关 */
export const idleAnimationSchema = z.boolean()

/** 校验定时主动问候开关 */
export const proactiveLinesSchema = z.boolean()

/** 校验久坐提醒开关 */
export const idleReminderSchema = z.boolean()

/** 校验深夜催睡开关 */
export const sleepReminderSchema = z.boolean()

/** 校验彩蛋开关 */
export const easterEggsSchema = z.boolean()

/** 校验夜间互动总开关 */
export const nightInteractionSchema = z.boolean()

/** 校验夜间定时问候子开关 */
export const nightProactiveSchema = z.boolean()

/** 校验模块 id */
export const moduleIdSchema = z.enum(['pomodoro', 'reminders', 'chime', 'claude-code', 'weather'])

/** 校验模块开关 */
export const moduleSetEnabledSchema = z.object({
  id: moduleIdSchema,
  enabled: z.boolean(),
})

/** 校验模块参数更新 */
export const moduleUpdateSettingsSchema = z.object({
  id: moduleIdSchema,
  patch: z.record(z.string(), z.unknown()),
})

/** 校验形象切换模式 */
export const imageModeSchema = z.enum(['cycle', 'fixed'])

/** 校验形象 id，只允许 assets/source/static 下的文件名格式 */
export const imageIdSchema = z.string().regex(/^vivian_static_\d{2}$/)

/** 校验渲染层上报的命中面罩，防止异常尺寸或数据污染主进程 */
export const hitMaskSchema = z
  .object({
    width: z.number().int().min(8).max(256),
    height: z.number().int().min(8).max(256),
    data: z.array(z.number().int().min(0).max(255)),
  })
  .refine((mask) => mask.data.length === mask.width * mask.height, {
    message: '命中面罩的数据长度与宽高不匹配',
  })

/** 校验形象可见范围（alpha 边界比例） */
export const visualMetricsSchema = z
  .object({
    topRatio: z.number().min(0).max(1),
    bottomRatio: z.number().min(0).max(1),
  })
  .refine((metrics) => metrics.topRatio <= metrics.bottomRatio, {
    message: '形象可见范围的顶部不能低于底部',
  })
