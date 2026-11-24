import { describe, expect, it } from 'vitest'
import { claudeSessionUri, vscodeFolderUri } from '../src/main/services/claudeCodeLinks'

describe('VSCode 链接构造', () => {
  it('文件夹路径保留盘符，编码中文与空格', () => {
    expect(vscodeFolderUri('C:\\work\\Project')).toBe('vscode://file/C:/work/Project')
    expect(vscodeFolderUri('C:\\work\\示例文件\\学校 项目')).toBe(
      'vscode://file/C:/work/%E7%A4%BA%E4%BE%8B%E6%96%87%E4%BB%B6/%E5%AD%A6%E6%A0%A1%20%E9%A1%B9%E7%9B%AE',
    )
  })

  it('编码会破坏 URI 的字符', () => {
    expect(vscodeFolderUri('H:\\work\\a#b?c')).toBe('vscode://file/H:/work/a%23b%3Fc')
  })

  it('UNC 路径不额外加斜杠', () => {
    expect(vscodeFolderUri('\\\\server\\share\\项目')).toBe(
      'vscode://file//server/share/%E9%A1%B9%E7%9B%AE',
    )
  })

  it('会话 URI 编码 session id', () => {
    expect(claudeSessionUri('c2adc827-eb63-4bd5-b4cb-2343f669f132')).toBe(
      'vscode://anthropic.claude-code/open?session=c2adc827-eb63-4bd5-b4cb-2343f669f132',
    )
    expect(claudeSessionUri('a&b c')).toBe('vscode://anthropic.claude-code/open?session=a%26b%20c')
  })
})
