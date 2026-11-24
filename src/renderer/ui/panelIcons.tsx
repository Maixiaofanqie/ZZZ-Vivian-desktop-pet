import type { ReactNode } from 'react'

/**
 * 功能面板的内联图标。
 * 统一 24 视口、1.6 描边、currentColor；不引入图标库，也不新增图像素材。
 */
export type UiIconName =
  | 'refresh'
  | 'folder'
  | 'chevron'
  | 'trash'
  | 'plus'
  | 'external'
  | 'alert'
  | 'umbrella'

const UI_ICONS: Record<UiIconName, ReactNode> = {
  refresh: (
    <>
      <path d="M20 4.8v4.4h-4.4" />
      <path d="M19.7 9.2A8 8 0 1 0 20 12" />
    </>
  ),
  folder: (
    <path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2Z" />
  ),
  chevron: <path d="m9.5 6 6 6-6 6" />,
  trash: (
    <>
      <path d="M4.5 7h15" />
      <path d="M9.5 7V5.2a1.7 1.7 0 0 1 1.7-1.7h1.6a1.7 1.7 0 0 1 1.7 1.7V7" />
      <path d="m6.5 7 .8 11.2a2 2 0 0 0 2 1.8h5.4a2 2 0 0 0 2-1.8L17.5 7" />
      <path d="M10.5 11v5M13.5 11v5" />
    </>
  ),
  plus: <path d="M12 5.5v13M5.5 12h13" />,
  external: (
    <>
      <path d="M7 17 17 7" />
      <path d="M9 7h8v8" />
    </>
  ),
  alert: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.8v5.4" />
      <path d="M12 16.4h.01" />
    </>
  ),
  umbrella: (
    <>
      <path d="M20.5 12a8.5 8.5 0 0 0-17 0Z" />
      <path d="M12 12v6.2a2.2 2.2 0 0 0 4.4 0" />
      <path d="M12 2.8v.7" />
    </>
  ),
}

export function UiIcon({ name, size = 16 }: { name: UiIconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {UI_ICONS[name]}
    </svg>
  )
}

const PAGE_ICONS: Record<string, ReactNode> = {
  'claude-code': (
    <>
      <rect x="3" y="4.5" width="18" height="15" rx="3" />
      <path d="m7.5 9.5 3 2.5-3 2.5" />
      <path d="M12.5 14.5h4" />
    </>
  ),
  weather: (
    <>
      <circle cx="8.5" cy="8.5" r="2.7" />
      <path d="M8.5 3.4v1.3M3.4 8.5h1.3M4.9 4.9l.9.9M12.1 4.9l-.9.9" />
      <path d="M9 19h6.8a3 3 0 0 0 .4-5.97 4.4 4.4 0 0 0-8.2-.8A3.1 3.1 0 0 0 9 19Z" />
    </>
  ),
  reminders: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="3" />
      <path d="M3.5 9.5h17M8 3v3.4M16 3v3.4" />
      <path d="m8.3 14.6 1.7 1.7 3.2-3.6" />
    </>
  ),
}

/** 侧栏图标：未知页面回退到阳伞，避免出现空白占位 */
export function PageIcon({ id, size = 18 }: { id: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PAGE_ICONS[id] ?? UI_ICONS.umbrella}
    </svg>
  )
}

const SUN: ReactNode = (
  <>
    <circle cx="12" cy="12" r="4.2" />
    <path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M18.5 5.5l-1.7 1.7M7.2 16.8l-1.7 1.7" />
  </>
)

const MOON: ReactNode = <path d="M19.5 14.2A8 8 0 0 1 9.8 4.5a8 8 0 1 0 9.7 9.7Z" />

const PARTLY: ReactNode = (
  <>
    <circle cx="9" cy="9.2" r="3" />
    <path d="M9 3.4v1.5M3.4 9.2h1.5M4.9 5.1l1 1M13.1 5.1l-1 1" />
    <path d="M9.5 19.5h7.2a3.2 3.2 0 0 0 .4-6.37 4.6 4.6 0 0 0-8.55-.83 3.3 3.3 0 0 0 .95 7.2Z" />
  </>
)

const MOON_CLOUD: ReactNode = (
  <>
    <path d="M16.8 10.4A5.6 5.6 0 0 1 9.6 3.2a5.6 5.6 0 1 0 7.2 7.2Z" />
    <path d="M8.5 19.5h8.9a3.1 3.1 0 0 0 .4-6.18 4.5 4.5 0 0 0-8.35-.8A3.2 3.2 0 0 0 8.5 19.5Z" />
  </>
)

const CLOUD: ReactNode = (
  <path d="M7 17.5h10a3.5 3.5 0 0 0 .45-6.97A5.1 5.1 0 0 0 7.9 9.5 3.6 3.6 0 0 0 7 17.5Z" />
)

const FOG: ReactNode = (
  <>
    <path d="M8 14h9a3 3 0 0 0 .3-5.98A4.5 4.5 0 0 0 8.7 7.1 3.2 3.2 0 0 0 8 14Z" />
    <path d="M5 17.5h14M7 20.8h10" />
  </>
)

const RAIN: ReactNode = (
  <>
    <path d="M7 14.5h10a3.4 3.4 0 0 0 .4-6.78A5 5 0 0 0 7.9 6.9 3.5 3.5 0 0 0 7 14.5Z" />
    <path d="M8.5 17.8 7.6 20M12.5 17.8 11.6 20M16.5 17.8 15.6 20" />
  </>
)

const SNOW: ReactNode = (
  <>
    <path d="M7 14.5h10a3.4 3.4 0 0 0 .4-6.78A5 5 0 0 0 7.9 6.9 3.5 3.5 0 0 0 7 14.5Z" />
    <path d="M8.6 17.6v3.2M7.2 18.4l2.8 1.6M10 18.4l-2.8 1.6" />
    <path d="M15.4 17.6v3.2M14 18.4l2.8 1.6M16.8 18.4l-2.8 1.6" />
  </>
)

const THUNDER: ReactNode = (
  <>
    <path d="M7 14h10a3.4 3.4 0 0 0 .4-6.78A5 5 0 0 0 7.9 6.4 3.5 3.5 0 0 0 7 14Z" />
    <path d="m13.2 16.2-2.6 4h2.6l-1.4 3" />
  </>
)

function weatherGlyph(code: number, isDay: boolean): ReactNode {
  if (code === 0) return isDay ? SUN : MOON
  if (code === 1 || code === 2) return isDay ? PARTLY : MOON_CLOUD
  if (code === 3) return CLOUD
  if (code === 45 || code === 48) return FOG
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return RAIN
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return SNOW
  if (code >= 95) return THUNDER
  return CLOUD
}

/** 天气图形：按 WMO weatherCode 与昼夜选择，纯装饰，文字仍提供完整信息 */
export function WeatherGlyph({
  code,
  isDay,
  size = 48,
}: {
  code: number
  isDay: boolean
  size?: number
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.3}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {weatherGlyph(code, isDay)}
    </svg>
  )
}
