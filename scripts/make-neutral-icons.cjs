/**
 * 生成公开仓库的原创中性图标：暮紫伞面 + 金色微光，不依赖任何角色素材。
 * 输出 build/icon.svg、build/icon.png、build/icon.ico 与 assets/icons/tray.png。
 * 用法：npm run neutral-icons
 */
const { app, BrowserWindow, nativeImage } = require('electron')
const { mkdirSync, writeFileSync } = require('node:fs')
const { join, resolve } = require('node:path')

const ROOT = resolve(__dirname, '..')
const SIZES = [16, 24, 32, 48, 64, 128, 256]
const RENDER_SIZE = 512

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <title>Vivian Desktop Pet</title>
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#7d5cae"/>
      <stop offset="1" stop-color="#322148"/>
    </linearGradient>
    <linearGradient id="canopy" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#f6f0ff"/>
      <stop offset="1" stop-color="#d8c6f2"/>
    </linearGradient>
  </defs>
  <rect x="20" y="20" width="472" height="472" rx="116" fill="url(#bg)"/>
  <path d="M96 244 C112 148 184 104 256 104 C328 104 400 148 416 244 Z" fill="url(#canopy)" stroke="#c9b3ea" stroke-width="8"/>
  <path d="M96 244 Q136 276 176 244 Q216 276 256 244 Q296 276 336 244 Q376 276 416 244" fill="none" stroke="#c9b3ea" stroke-width="8" stroke-linecap="round"/>
  <path d="M256 244 V366 Q256 400 292 400 Q324 400 324 370" fill="none" stroke="#f6f0ff" stroke-width="14" stroke-linecap="round"/>
  <circle cx="360" cy="160" r="20" fill="#e8c56a" opacity="0.18"/>
  <circle cx="360" cy="160" r="10" fill="#e8c56a"/>
</svg>`

/** 把多张 PNG 组装成 ICO（Vista+ 支持 PNG 负载） */
function buildIco(images) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(images.length, 4)

  let offset = 6 + images.length * 16
  const entries = images.map(({ size, data }) => {
    const entry = Buffer.alloc(16)
    entry.writeUInt8(size >= 256 ? 0 : size, 0)
    entry.writeUInt8(size >= 256 ? 0 : size, 1)
    entry.writeUInt8(0, 2)
    entry.writeUInt8(0, 3)
    entry.writeUInt16LE(1, 4)
    entry.writeUInt16LE(32, 6)
    entry.writeUInt32LE(data.length, 8)
    entry.writeUInt32LE(offset, 12)
    offset += data.length
    return entry
  })

  return Buffer.concat([header, ...entries, ...images.map((image) => image.data)])
}

async function renderIcon() {
  const win = new BrowserWindow({
    width: RENDER_SIZE,
    height: RENDER_SIZE,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    webPreferences: { offscreen: true, sandbox: true },
  })

  // 用画布绘制 SVG 后再导出 PNG，确保透明通道不被窗口背景覆盖
  const html = `<!doctype html><html><body style="margin:0;background:transparent;overflow:hidden">
<canvas id="icon" width="${RENDER_SIZE}" height="${RENDER_SIZE}"></canvas>
<script>
const svg = ${JSON.stringify(SVG)}
const image = new Image()
image.onload = () => {
  const canvas = document.getElementById('icon')
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
  window.__iconReady = true
}
image.onerror = () => {
  window.__iconError = true
}
image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
</script>
</body></html>`

  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
  await win.webContents.executeJavaScript(`
    new Promise((resolve, reject) => {
      const started = Date.now()
      const timer = setInterval(() => {
        if (window.__iconReady) {
          clearInterval(timer)
          resolve(true)
        } else if (window.__iconError) {
          clearInterval(timer)
          reject(new Error('SVG 渲染失败'))
        } else if (Date.now() - started > 5000) {
          clearInterval(timer)
          reject(new Error('SVG 渲染超时'))
        }
      }, 20)
    })
  `)

  const dataUrl = await win.webContents.executeJavaScript(
    "document.getElementById('icon').toDataURL('image/png')",
  )
  win.destroy()

  const image = nativeImage.createFromDataURL(dataUrl)
  if (image.isEmpty()) throw new Error('无法从画布生成图标')
  return image
}

app.whenReady().then(async () => {
  try {
    const image = await renderIcon()
    const images = SIZES.map((size) => ({
      size,
      data: image.resize({ width: size, height: size, quality: 'best' }).toPNG(),
    }))
    const png256 = images.find((item) => item.size === 256)
    if (!png256) throw new Error('缺少 256×256 图标')

    mkdirSync(join(ROOT, 'build'), { recursive: true })
    mkdirSync(join(ROOT, 'assets', 'icons'), { recursive: true })

    writeFileSync(join(ROOT, 'build', 'icon.svg'), SVG)
    writeFileSync(join(ROOT, 'build', 'icon.png'), png256.data)
    writeFileSync(join(ROOT, 'build', 'icon.ico'), buildIco(images))
    writeFileSync(
      join(ROOT, 'assets', 'icons', 'tray.png'),
      image.resize({ width: 32, height: 32, quality: 'best' }).toPNG(),
    )

    console.log('已生成 build/icon.svg、build/icon.png、build/icon.ico 与 assets/icons/tray.png')
    app.quit()
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    app.exit(1)
  }
})
