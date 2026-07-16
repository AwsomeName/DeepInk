import { useAndroidStore } from '../../stores/android-store'

/**
 * Android 工具栏
 *
 * 提供常用 Android 控制按钮：Home、Back、Recent、音量等。
 * 对标 Workbench 中的浏览器工具栏。
 */
export function AndroidToolbar(): React.JSX.Element {
  const deviceMode = useAndroidStore((s) => s.deviceMode)
  const mirrorConnected = useAndroidStore((s) => s.mirrorConnected)
  const isConnected = deviceMode === 'physical' && mirrorConnected

  const handleKey = async (key: string) => {
    if (!isConnected) return
    try {
      await window.cclinkStudio.android.pressKey(key)
    } catch (err) {
      console.error(`按键 ${key} 失败:`, err)
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        padding: '4px 8px',
        borderBottom: '1px solid var(--border-color, #3c3c3c)',
        backgroundColor: 'var(--toolbar-bg, #252526)',
        height: '36px',
        flexShrink: 0,
      }}
    >
      {/* Android 导航按钮 */}
      <ToolbarButton title="返回 (Back)" onClick={() => handleKey('back')} disabled={!isConnected}>
        ◀
      </ToolbarButton>
      <ToolbarButton title="桌面 (Home)" onClick={() => handleKey('home')} disabled={!isConnected}>
        ●
      </ToolbarButton>
      <ToolbarButton
        title="最近任务 (Recent)"
        onClick={() => handleKey('recent')}
        disabled={!isConnected}
      >
        ■
      </ToolbarButton>

      <div style={{ width: '1px', height: '20px', background: '#444', margin: '0 4px' }} />

      {/* 音量控制 */}
      <ToolbarButton title="音量+" onClick={() => handleKey('volume_up')} disabled={!isConnected}>
        🔊+
      </ToolbarButton>
      <ToolbarButton title="音量-" onClick={() => handleKey('volume_down')} disabled={!isConnected}>
        🔉-
      </ToolbarButton>
      <ToolbarButton title="电源" onClick={() => handleKey('power')} disabled={!isConnected}>
        ⏻
      </ToolbarButton>

      <div style={{ flex: 1 }} />

      {/* 状态指示 */}
      <span
        style={{
          fontSize: '11px',
          color: isConnected ? '#4ec9b0' : '#888',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
        }}
      >
        <span
          style={{
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            backgroundColor: isConnected ? '#4ec9b0' : '#666',
            display: 'inline-block',
          }}
        />
        {isConnected ? '已连接' : '未连接'}
      </span>
    </div>
  )
}

/** 工具栏按钮 */
function ToolbarButton({
  children,
  title,
  onClick,
  disabled,
}: {
  children: React.ReactNode
  title: string
  onClick: () => void
  disabled?: boolean
}): React.JSX.Element {
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={disabled}
      style={{
        background: 'transparent',
        border: 'none',
        color: disabled ? '#555' : '#ccc',
        cursor: disabled ? 'default' : 'pointer',
        padding: '4px 8px',
        borderRadius: '3px',
        fontSize: '13px',
        lineHeight: 1,
        minWidth: '28px',
        textAlign: 'center',
      }}
      onMouseEnter={(e) => {
        if (!disabled) (e.target as HTMLElement).style.background = '#333'
      }}
      onMouseLeave={(e) => {
        ;(e.target as HTMLElement).style.background = 'transparent'
      }}
    >
      {children}
    </button>
  )
}
