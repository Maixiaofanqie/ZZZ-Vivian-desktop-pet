/**
 * 渲染层 JS 动效参数。
 * CSS 的通用时长与缓动在 styles.css 的 --dur-* / --ease 中；
 * 这里只放 Web Animations API 用到的角色交互时长，避免散落魔法数字。
 */
export const MOTION = {
  /** 落地挤压 */
  land: 320,
  /** 点击 / 双击 Q 弹 */
  bounce: 260,
} as const

export const MOTION_EASING = 'ease-out'
