import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import type { Plugin } from 'vite'

// 某些 IDE / 代理环境会注入 ELECTRON_RUN_AS_NODE=1，使 Electron 以纯 Node 模式启动
// （此时 require('electron') 只返回路径，app 为 undefined）。在 electron-vite 启动
// 子进程前清除它，确保 npm run dev 始终拉起真正的 Electron。
Reflect.deleteProperty(process.env, 'ELECTRON_RUN_AS_NODE')

const PRODUCTION_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self'",
].join('; ')

// Vite HMR 需要内联脚本与 WebSocket；仅开发环境放宽，生产环境保持严格策略
const DEV_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self' ws://localhost:* http://localhost:*",
].join('; ')

/**
 * 按环境注入 CSP：开发环境允许 HMR 所需能力，生产环境使用严格策略。
 */
const cspPlugin: Plugin = {
  name: 'vivian-inject-csp',
  transformIndexHtml(html, ctx) {
    const policy = ctx.server ? DEV_CSP : PRODUCTION_CSP
    return html.replace(
      '<!-- CSP -->',
      `<meta http-equiv="Content-Security-Policy" content="${policy}" />`,
    )
  },
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/main/index.ts') },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/preload/index.ts') },
      },
    },
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    plugins: [react(), cspPlugin],
    resolve: {
      dedupe: ['react', 'react-dom'],
    },
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/renderer/index.html') },
      },
    },
  },
})
