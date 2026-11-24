import type { ClaudeCodeOpenResult } from '../../shared/ipc'
import { claudeSessionUri, vscodeFolderUri } from './claudeCodeLinks'

/** 由主进程注入 shell 能力；这里保持纯逻辑，便于单测降级路径 */
export interface ClaudeCodeOpener {
  openExternal(url: string): Promise<void>
  openPath(path: string): Promise<string>
}

export interface ClaudeOpenContext {
  path: string
  opener: ClaudeCodeOpener
  wait?: (ms: number) => Promise<void>
}

export interface ClaudeSessionOpenContext extends ClaudeOpenContext {
  sessionId: string
}

/** 先等 VSCode 把文件夹窗口拉起来，再请求扩展打开对话 */
export const SESSION_OPEN_DELAY_MS = 800

function defaultWait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

interface FolderOpenResult {
  opened: boolean
  viaVscode: boolean
}

async function openFolder(context: ClaudeOpenContext): Promise<FolderOpenResult> {
  try {
    await context.opener.openExternal(vscodeFolderUri(context.path))
    return { opened: true, viaVscode: true }
  } catch {
    // VSCode 未安装或 vscode:// 协议未注册，退化为资源管理器
  }

  try {
    const error = await context.opener.openPath(context.path)
    return { opened: error === '', viaVscode: false }
  } catch {
    return { opened: false, viaVscode: false }
  }
}

export async function openClaudeProject(context: ClaudeOpenContext): Promise<ClaudeCodeOpenResult> {
  const folder = await openFolder(context)
  if (!folder.opened) {
    return { folderOpened: false, sessionOpened: false, message: '没有找到可打开的项目文件夹。' }
  }

  return {
    folderOpened: true,
    sessionOpened: false,
    message: folder.viaVscode ? '' : '已在资源管理器中打开项目；VSCode 可能未安装或未注册。',
  }
}

export async function openClaudeSession(
  context: ClaudeSessionOpenContext,
): Promise<ClaudeCodeOpenResult> {
  const folder = await openFolder(context)
  if (!folder.opened) {
    return { folderOpened: false, sessionOpened: false, message: '没有找到可打开的项目文件夹。' }
  }

  await (context.wait ?? defaultWait)(SESSION_OPEN_DELAY_MS)

  try {
    await context.opener.openExternal(claudeSessionUri(context.sessionId))
    return {
      folderOpened: true,
      sessionOpened: true,
      message: folder.viaVscode ? '' : '已打开文件夹；请在 VSCode 中确认对话。',
    }
  } catch {
    return {
      folderOpened: true,
      sessionOpened: false,
      message: `已打开文件夹。Claude Code 扩展可能未安装，可在终端运行 claude --resume ${context.sessionId}。`,
    }
  }
}
