import type { ReactNode } from 'react'

/** 本地图标统一使用线条和 currentColor，与主题、壁纸及字体设置兼容。 */
export type AppIconName = 'clock' | 'memo' | 'tasks' | 'food' | 'fun' | 'badminton' | 'settings' | 'wallpaper'

export function AppIcon({ name }: { name: AppIconName }) {
  const artwork = {
    clock: <>
      <circle cx="12" cy="13" r="8.25" />
      <path d="M12 8.5V13l3 2M9 2h6M12 2v2.75M4.75 5.5 3.5 6.75" />
    </>,
    memo: <>
      <rect x="4.25" y="4.25" width="13.5" height="16" rx="2.25" />
      <path d="M8 3v2.5M11 3v2.5M14 3v2.5M7.5 9.5h6.5M7.5 13h4" />
      <path d="m13.75 17.2 5.4-5.4 1.75 1.75-5.4 5.4-2.75.95z" />
    </>,
    tasks: <>
      <rect x="3" y="4.75" width="18" height="16.25" rx="2.5" />
      <path d="M7.5 3v3.25M16.5 3v3.25M3 9.25h18M7 13.4l1.25 1.25L10 12.9M13 13.8h4M7 18l1.25 1.25L10 17.5M13 18.3h4" />
    </>,
    food: <>
      <path d="M5 3v6a2.5 2.5 0 0 0 5 0V3M7.5 3v18M16.5 21V4.5c2.45 1.35 3.5 3.45 3.5 6.25V14h-3.5" />
      <path d="M14.25 6.25c-.6-1.5-.25-2.5 1.1-3.25.55 1.6.1 2.6-1.1 3.25Z" />
    </>,
    fun: <>
      <path d="M8.25 9h7.5c2.1 0 3.25 1.35 3.75 3.25l1.1 4.45c.4 1.65-.3 2.8-1.65 2.8-1.2 0-2-1.1-3-2.3H8.05c-1 1.2-1.8 2.3-3 2.3-1.35 0-2.05-1.15-1.65-2.8l1.1-4.45C5 10.35 6.15 9 8.25 9Z" />
      <path d="M8.25 12v4M6.25 14h4M15.8 12.5h.1M18 14.5h.1M12 9V7.5c0-1.35 1.05-1.75 2.25-1.75h1.25c1.4 0 2.5-.65 2.5-2.25" />
    </>,
    badminton: <>
      <path d="m7.5 15.8 4-11.4 4.8-.8 4.1 3.9-1 4.7-9.4 6.3M11.5 4.4l5 10.7M16.3 3.6l.3 11.5M20.4 7.5l-8 9M7.5 15.8l2.5 2.7" />
      <path d="M5.1 16.7a2.2 2.2 0 0 1 3.1-.1l1.2 1.2a2.2 2.2 0 0 1-3.1 3.1l-1.2-1.2a2.2 2.2 0 0 1 0-3Z" />
    </>,
    settings: <>
      <path d="M10.1 3.1h3.8l.5 2.1c.5.2.95.45 1.35.8l2-.8 2.7 2.7-.85 2c.3.4.55.85.75 1.3l2.1.55v3.8l-2.1.5c-.2.5-.45.95-.8 1.35l.8 2-2.7 2.7-2-.85c-.4.3-.85.55-1.3.75l-.55 2.1h-3.8l-.5-2.1c-.5-.2-.95-.45-1.35-.8l-2 .8-2.7-2.7.85-2c-.3-.4-.55-.85-.75-1.3l-2.1-.55v-3.8l2.1-.5c.2-.5.45-.95.8-1.35l-.8-2 2.7-2.7 2 .85c.4-.3.85-.55 1.3-.75z" transform="translate(0 -1.5) scale(1 .91)" />
      <circle cx="12" cy="12" r="2.7" />
    </>,
    wallpaper: <>
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <circle cx="16.5" cy="8.5" r="1.3" />
      <path d="m4 17 5-5 3.25 3.25 2.5-2.5L20 18" />
    </>,
  } satisfies Record<AppIconName, ReactNode>

  return (
    <svg className="app-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true" focusable="false">
      {artwork[name]}
    </svg>
  )
}
