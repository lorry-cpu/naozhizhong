import type { ChangeEvent } from 'react'

/** 今日计划卡片插画的可选项：内置插画 + 用户导入的自定义图片。 */
export const builtInPlanArts: ReadonlyArray<{ src: string; label: string }> = [
  { src: '/cards/plan-poster.jpg', label: '樱花草原' },
  { src: '/cards/plan.svg', label: '远山淡彩' },
]

/** 默认插画，也是清除自定义图片后回退到的图片。 */
export const defaultPlanArt = builtInPlanArts[0].src

/** 把任意来源的值收敛成可用的插画地址；空值回退到默认插画。 */
export function normalizePlanArt(value: string | number | boolean | undefined): string {
  return typeof value === 'string' && value.trim() ? value : defaultPlanArt
}

export function PlanArtDialog({
  open,
  current,
  message,
  onSelect,
  onImport,
  onReset,
  onClose,
}: {
  open: boolean
  current: string
  message: string
  onSelect: (src: string) => void
  onImport: (file: File) => void
  onReset: () => void
  onClose: () => void
}) {
  if (!open) return null
  function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) onImport(file)
  }
  const isCustom = !builtInPlanArts.some(item => item.src === current)
  return (
    <div className="dialog-backdrop" role="presentation">
      <section className="dialog plan-art-dialog" role="dialog" aria-modal="true" aria-labelledby="plan-art-dialog-title">
        <div className="dialog-header">
          <div>
            <h2 id="plan-art-dialog-title">选择首页插画</h2>
            <p className="muted-small">只影响首页「今日计划」卡片上的图片。</p>
          </div>
          <button className="button-secondary dialog-close" type="button" aria-label="关闭选择插画窗口" onClick={onClose}>×</button>
        </div>

        <div className="plan-art-options" role="radiogroup" aria-label="内置插画">
          {builtInPlanArts.map(item => (
            <button
              key={item.src}
              type="button"
              role="radio"
              aria-checked={current === item.src}
              className={`plan-art-option ${current === item.src ? 'is-current' : ''}`}
              onClick={() => onSelect(item.src)}
            >
              <img src={item.src} alt="" />
              <span>{item.label}</span>
            </button>
          ))}
        </div>

        <label htmlFor="plan-art-file">导入本地图片
          <input id="plan-art-file" type="file" accept="image/*" onChange={chooseFile} />
        </label>
        <p className="muted-small">
          {isCustom ? '当前使用你导入的图片。' : '当前使用内置插画。'}
        </p>

        <div className="button-row dialog-actions">
          <button className="button-secondary" type="button" onClick={onReset} disabled={current === defaultPlanArt}>
            恢复默认插画
          </button>
          <button className="button-primary" type="button" onClick={onClose}>完成</button>
        </div>
        {message && <p className="muted-small" role="status">{message}</p>}
      </section>
    </div>
  )
}
