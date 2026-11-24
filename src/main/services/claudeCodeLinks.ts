/**
 * VSCode 链接构造。只生成 URI，不直接打开；便于单测编码结果。
 * 文件夹使用官方 vscode://file 协议，会话使用 Claude Code 扩展的 open 命令。
 */
export function vscodeFolderUri(folderPath: string): string {
  const normalized = folderPath.replace(/\\/g, '/')
  const encoded = normalized
    .split('/')
    .map((segment, index) => {
      if (!segment) return ''
      // Windows 盘符（H:）保留冒号；其余段逐段编码，避免空格、中文与 #? 破坏 URI
      if (index === 0 && /^[a-zA-Z]:$/.test(segment)) return segment
      return encodeURIComponent(segment)
    })
    .join('/')

  const prefix = normalized.startsWith('//') ? 'vscode://file' : 'vscode://file/'
  return `${prefix}${encoded}`
}

export function claudeSessionUri(sessionId: string): string {
  return `vscode://anthropic.claude-code/open?session=${encodeURIComponent(sessionId)}`
}
