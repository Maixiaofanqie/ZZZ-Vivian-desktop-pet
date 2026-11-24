/// <reference types="vite/client" />

import type { VivianApi } from '../shared/ipc'

declare global {
  interface Window {
    vivian: VivianApi
  }
}
