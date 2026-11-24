import { describe, expect, it, vi } from 'vitest'
import { claudeSessionUri, vscodeFolderUri } from '../src/main/services/claudeCodeLinks'
import {
  type ClaudeCodeOpener,
  openClaudeProject,
  openClaudeSession,
  SESSION_OPEN_DELAY_MS,
} from '../src/main/services/claudeCodeOpen'

const PROJECT_PATH = 'H:\\work\\Alpha'
const SESSION_ID = 'c2adc827-eb63-4bd5-b4cb-2343f669f132'

interface FakeOpener extends ClaudeCodeOpener {
  openExternal: ReturnType<typeof vi.fn>
  openPath: ReturnType<typeof vi.fn>
}

function createOpener(): FakeOpener {
  return {
    openExternal: vi.fn().mockResolvedValue(undefined),
    openPath: vi.fn().mockResolvedValue(''),
  }
}

function createWait(): ReturnType<typeof vi.fn> {
  return vi.fn().mockResolvedValue(undefined)
}

describe('Claude Code 打开动作', () => {
  it('用 VSCode 文件夹 URI 打开项目', async () => {
    const opener = createOpener()
    const result = await openClaudeProject({ path: PROJECT_PATH, opener })

    expect(opener.openExternal).toHaveBeenCalledWith(vscodeFolderUri(PROJECT_PATH))
    expect(opener.openPath).not.toHaveBeenCalled()
    expect(result).toEqual({ folderOpened: true, sessionOpened: false, message: '' })
  })

  it('VSCode 协议失败时回退资源管理器', async () => {
    const opener = createOpener()
    opener.openExternal.mockRejectedValueOnce(new Error('no handler'))

    const result = await openClaudeProject({ path: PROJECT_PATH, opener })

    expect(opener.openPath).toHaveBeenCalledWith(PROJECT_PATH)
    expect(result.folderOpened).toBe(true)
    expect(result.message).toContain('资源管理器')
  })

  it('文件夹与回退都失败时返回失败结果', async () => {
    const opener = createOpener()
    opener.openExternal.mockRejectedValueOnce(new Error('no handler'))
    opener.openPath.mockResolvedValueOnce('找不到文件夹')

    const result = await openClaudeProject({ path: PROJECT_PATH, opener })

    expect(result).toEqual({
      folderOpened: false,
      sessionOpened: false,
      message: '没有找到可打开的项目文件夹。',
    })
  })

  it('会话先开文件夹，等 800ms 再开对话', async () => {
    const opener = createOpener()
    const wait = createWait()

    const result = await openClaudeSession({
      path: PROJECT_PATH,
      sessionId: SESSION_ID,
      opener,
      wait,
    })

    expect(wait).toHaveBeenCalledWith(SESSION_OPEN_DELAY_MS)
    expect(opener.openExternal).toHaveBeenNthCalledWith(1, vscodeFolderUri(PROJECT_PATH))
    expect(opener.openExternal).toHaveBeenNthCalledWith(2, claudeSessionUri(SESSION_ID))
    expect(result).toEqual({ folderOpened: true, sessionOpened: true, message: '' })
  })

  it('扩展缺失或会话 URI 失败时提示 claude --resume', async () => {
    const opener = createOpener()
    opener.openExternal
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('extension not installed'))

    const result = await openClaudeSession({
      path: PROJECT_PATH,
      sessionId: SESSION_ID,
      opener,
      wait: createWait(),
    })

    expect(result.folderOpened).toBe(true)
    expect(result.sessionOpened).toBe(false)
    expect(result.message).toContain(`claude --resume ${SESSION_ID}`)
  })

  it('文件夹走资源管理器回退后，对话仍可打开', async () => {
    const opener = createOpener()
    opener.openExternal
      .mockRejectedValueOnce(new Error('no handler'))
      .mockResolvedValueOnce(undefined)
    opener.openPath.mockResolvedValueOnce('')

    const result = await openClaudeSession({
      path: PROJECT_PATH,
      sessionId: SESSION_ID,
      opener,
      wait: createWait(),
    })

    expect(result.folderOpened).toBe(true)
    expect(result.sessionOpened).toBe(true)
    expect(result.message).toContain('请在 VSCode 中确认')
  })
})
