export type TextTone = 'light' | 'dark' | 'warm' | 'cool'

export const textToneOptions: ReadonlyArray<{ value: TextTone; label: string }> = [
  { value: 'light', label: '\u4eae\u8272\u5b57' },
  { value: 'dark', label: '\u6697\u8272\u5b57' },
  { value: 'warm', label: '\u6696\u91d1\u5b57' },
  { value: 'cool', label: '\u51b7\u84dd\u5b57' },
]

export function normalizeTextTone(value: string | number | boolean | undefined): TextTone {
  return value === 'dark' || value === 'warm' || value === 'cool' ? value : 'light'
}

export function normalizeTextSize(value: string | number | boolean | undefined, fallback = 100) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(130, Math.max(80, value)) : fallback
}
