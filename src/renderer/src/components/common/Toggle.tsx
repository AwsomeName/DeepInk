/**
 * Toggle — VSCode 风格滑动开关组件
 *
 * 替代原生 checkbox，用于所有布尔设置。
 * 支持无障碍（role="switch", aria-checked）。
 */

interface ToggleProps {
  /** 当前状态 */
  checked: boolean
  /** 状态变更回调 */
  onChange: (checked: boolean) => void
  /** 是否禁用 */
  disabled?: boolean
  /** 额外 CSS 类名 */
  className?: string
}

export function Toggle({
  checked,
  onChange,
  disabled = false,
  className = '',
}: ToggleProps): React.ReactElement {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      className={`toggle ${checked ? 'checked' : ''} ${disabled ? 'disabled' : ''} ${className}`}
      onClick={() => !disabled && onChange(!checked)}
    >
      <span className="toggle-track">
        <span className="toggle-thumb" />
      </span>
    </button>
  )
}
