/** 应用显示名 */
export const APP_NAME = '薇薇安桌宠'

/** 应用标识（与 electron-builder appId 保持一致） */
export const APP_ID = 'com.vivian.desktop-pet'

/** 当前开发阶段 */
export const CURRENT_PHASE = 'v1.0'

/** 当前阶段标题 */
export const PHASE_TITLE = '正式版'

/** 宠物的逻辑尺寸（DIP）；P3.0 Q 版半身形象 */
export const PET_WINDOW_WIDTH = 320
export const PET_WINDOW_HEIGHT = 320

/** 本地状态文件 schema 版本 */
export const STATE_SCHEMA_VERSION = 1

/** 共处记录文件 schema 版本；v2 起包含 memory，v3 起包含 work 聚合 */
export const PROFILE_SCHEMA_VERSION = 3

/** 设置文件 schema 版本 */
export const SETTINGS_SCHEMA_VERSION = 1

/** 备份文件格式版本 */
export const BACKUP_FORMAT_VERSION = 1

/** 气泡窗口尺寸（DIP）；P11.2 中等调整：304×132；退回轻量时改回 280×120 */
export const BUBBLE_WIDTH = 304
export const BUBBLE_HEIGHT = 132
export const BUBBLE_GAP = 8

/** 气泡淡出时长；主进程在隐藏窗口前预留这段时间 */
export const BUBBLE_FADE_OUT_MS = 180

/** 气泡逐字淡入：每个字的错开间隔与淡入时长 */
export const BUBBLE_CHAR_STAGGER_MS = 40
export const BUBBLE_CHAR_FADE_MS = 140

/** 点击宠物补全气泡文字后，保留的阅读时长 */
export const BUBBLE_COMPLETE_READ_MS = 2500
