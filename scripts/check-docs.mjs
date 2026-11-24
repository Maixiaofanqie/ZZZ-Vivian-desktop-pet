#!/usr/bin/env node
/**
 * 文档完整性检查：
 * 1. 扫描 docs/、public/、README.md、CLAUDE.md、devlog/ 中的 Markdown 相对链接，确认目标存在。
 * 2. 检查 CLAUDE.md 中反引号包裹的文档路径是否存在（仅私有仓库有该文件）。
 *
 * 用法：node scripts/check-docs.mjs
 * 有失效链接时退出码为 1。
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const MARKDOWN_EXT = /\.md$/i

function collectMarkdownFiles(dir, result = []) {
  if (!existsSync(dir)) return result
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      collectMarkdownFiles(full, result)
    } else if (MARKDOWN_EXT.test(entry)) {
      result.push(full)
    }
  }
  return result
}

const files = [
  ...collectMarkdownFiles(join(ROOT, 'docs')),
  ...collectMarkdownFiles(join(ROOT, 'public')),
  ...collectMarkdownFiles(join(ROOT, 'devlog')),
  join(ROOT, 'README.md'),
  join(ROOT, 'CLAUDE.md'),
].filter((file) => existsSync(file))

const broken = []
const LINK_PATTERN = /\[[^\]]*\]\(([^)\s]+)\)/g
const SKIP_PREFIX = /^(https?:|mailto:|tel:|#)/i

const PUBLIC_DIR = join(ROOT, 'public')

for (const file of files) {
  const content = readFileSync(file, 'utf8')
  const isPublicTemplate = file === PUBLIC_DIR || file.startsWith(`${PUBLIC_DIR}${sep}`)
  for (const match of content.matchAll(LINK_PATTERN)) {
    const target = match[1].replace(/^<|>$/g, '')
    if (SKIP_PREFIX.test(target)) continue
    const clean = target.split('#')[0].split('?')[0]
    if (!clean) continue
    const absolute = resolve(dirname(file), clean)
    // public/ 只是目标仓库的覆盖模板：指向根级素材/构建文件的链接按私有仓库根校验
    const rootFallback = isPublicTemplate ? resolve(ROOT, clean) : null
    if (!existsSync(absolute) && !(rootFallback && existsSync(rootFallback))) {
      broken.push(`${relative(ROOT, file)} -> ${target}`)
    }
  }
}

// CLAUDE.md 反引号内的文档路径
const claudeMd = join(ROOT, 'CLAUDE.md')
if (existsSync(claudeMd)) {
  const content = readFileSync(claudeMd, 'utf8')
  for (const match of content.matchAll(/`([^`\n]+)`/g)) {
    const token = match[1].trim()
    if (!token.includes('/')) continue
    if (token.includes('YYYY')) continue
    if (/[\s*<>|]/.test(token)) continue
    if (!/^(docs|devlog|src|scripts|assets)\//.test(token)) continue
    const absolute = resolve(ROOT, token.replace(/\/$/, ''))
    if (!existsSync(absolute)) {
      broken.push(`CLAUDE.md -> ${token}`)
    }
  }
}

if (broken.length > 0) {
  console.error(`[docs:check] 发现 ${broken.length} 个失效路径：`)
  for (const item of broken) console.error(`- ${item}`)
  process.exit(1)
}

console.log(`[docs:check] 通过：检查了 ${files.length} 个 Markdown 文件，未发现失效链接。`)
