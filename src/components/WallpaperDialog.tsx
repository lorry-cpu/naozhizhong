import type { ChangeEvent } from 'react'

export function WallpaperDialog({
  open,
  wallpaper,
  opacity,
  message,
  onClose,
  onImport,
  onOpacityChange,
  onClear,
}: {
  open: boolean
  wallpaper: string | null
  opacity: number
  message: string
  onClose: () => void
  onImport: (file: File) => void
  onOpacityChange: (value: number) => void
  onClear: () => void
}) {
  if (!open) return null
  function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) onImport(file)
  }
  return (
    <div className="dialog-backdrop" role="presentation">
      <section className="dialog wallpaper-dialog" role="dialog" aria-modal="true" aria-labelledby="wallpaper-dialog-title">
        <div className="dialog-header">
          <div>
            <h2 id="wallpaper-dialog-title">设置壁纸</h2>
            <p className="muted-small">壁纸会覆盖导航栏和所有模块页面。</p>
          </div>
          <button className="button-secondary dialog-close" type="button" aria-label="关闭设置壁纸窗口" onClick={onClose}>×</button>
        </div>
        <label htmlFor="wallpaper-file">导入本地壁纸
          <input id="wallpaper-file" type="file" accept="image/*" onChange={chooseFile} />
        </label>
        <label htmlFor="wallpaper-opacity">不透明度：{Math.round(opacity * 100)}%
          <input id="wallpaper-opacity" type="range" min="0" max="100" step="5"
            value={Math.round(opacity * 100)}
            onChange={event => onOpacityChange(Number(event.target.value) / 100)} />
        </label>
        <div className="button-row dialog-actions">
          <button className="button-secondary" type="button" onClick={onClear} disabled={!wallpaper}>清除壁纸</button>
          <button className="button-primary" type="button" onClick={onClose}>完成</button>
        </div>
        {message && <p className="muted-small" role="status">{message}</p>}
      </section>
    </div>
  )
}
