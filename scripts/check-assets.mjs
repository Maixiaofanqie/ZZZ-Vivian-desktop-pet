#!/usr/bin/env node
/**
 * 素材检查：
 * - 源码仓库可以没有角色美术，此时宠物窗口保持空白。
 * - VIVIAN_REQUIRE_CHARACTER_ART=1 时，assets/characters/<set>/ 必须正好有 7 张角色图。
 * - 应用图标、托盘图标、字体与 OFL 文件必须存在。
 *
 * 用法：node scripts/check-assets.mjs
 */

import { existsSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const REQUIRED_FILES = [
  'build/icon.ico',
  'build/icon.png',
  'assets/icons/tray.png',
  'assets/fonts/NotoSerifSC-VF.ttf',
  'assets/fonts/OFL.txt',
]
const IMAGE_PATTERN = /^vivian_static_\d{2}\.png$/i

function findCharacterImages() {
  const base = join(ROOT, 'assets', 'characters')
  if (!existsSync(base)) return []

  const images = []
  for (const entry of readdirSync(base)) {
    const dir = join(base, entry)
    if (!statSync(dir).isDirectory()) continue
    for (const file of readdirSync(dir)) {
      if (IMAGE_PATTERN.test(file)) images.push(join(dir, file))
    }
  }
  return images
}

const errors = []
for (const file of REQUIRED_FILES) {
  if (!existsSync(join(ROOT, file))) errors.push(`缺少文件：${file}`)
}

const images = findCharacterImages()
const requireArt = process.env.VIVIAN_REQUIRE_CHARACTER_ART === '1'

if (requireArt && images.length !== 7) {
  errors.push(`VIVIAN_REQUIRE_CHARACTER_ART=1，但找到 ${images.length} 张角色图（需要 7 张）`)
}
if (!requireArt && images.length > 0 && images.length !== 7) {
  errors.push(`角色图不完整：找到 ${images.length} 张（应为 0 张占位或完整 7 张）`)
}

if (errors.length > 0) {
  console.error('[check-assets] 失败：')
  for (const error of errors) console.error(`- ${error}`)
  process.exit(1)
}

if (images.length === 0) {
  console.log('[check-assets] 通过：源码模式（无角色美术，宠物窗口留空）。')
} else {
  console.log(`[check-assets] 通过：角色美术 ${images.length} 张，图标与字体齐全。`)
}
