import { PERSONA } from '../../shared/persona'

/** 台词模板可用的上下文；数值来自记忆与共处记录 */
export interface DialogueContext {
  daysTogether: number
  interactions: number
  /** 对用户的称呼；缺省使用人设中的固定称呼 */
  address?: string
}

export const DEFAULT_DIALOGUE_CONTEXT: DialogueContext = {
  daysTogether: 1,
  interactions: 0,
}

/** 渲染台词模板；未知占位符原样保留，便于测试发现拼写错误 */
export function renderDialogueText(text: string, context: DialogueContext): string {
  const address = context.address ?? PERSONA.address
  const days = Math.max(1, Math.floor(context.daysTogether))
  const interactions = Math.max(0, Math.floor(context.interactions))

  return text
    .replaceAll('{days}', String(days))
    .replaceAll('{interactions}', String(interactions))
    .replaceAll('{address}', address)
}
