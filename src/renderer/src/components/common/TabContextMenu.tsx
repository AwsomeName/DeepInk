/**
 * Tab 右键上下文菜单
 *
 * 复用 .context-menu* 样式，与文件树右键菜单（ContextMenu）并存。
 * 菜单项：复制此页（浏览器克隆 URL / 编辑器克隆内容）、关闭。
 */

import { useEffect, useRef } from 'react'
import { useTabContextMenuStore } from '../../stores/tab-context-menu-store'
import { useTabStore } from '../../stores/tab-store'
import { closeTabWithDraftPolicy } from '../../utils/close-tab'

export function TabContextMenu(): React.ReactElement | null {
  const open = useTabContextMenuStore((s) => s.open)
  const x = useTabContextMenuStore((s) => s.x)
  const y = useTabContextMenuStore((s) => s.y)
  const tabId = useTabContextMenuStore((s) => s.tabId)
  const hide = useTabContextMenuStore((s) => s.hide)

  const tabs = useTabStore((s) => s.tabs)
  const duplicateTab = useTabStore((s) => s.duplicateTab)
  const ref = useRef<HTMLDivElement>(null)

  // 点击外部或 Escape 关闭
  useEffect(() => {
    if (!open) return

    const handleClickOutside = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        hide()
      }
    }

    const handleEscape = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') hide()
    }

    // 延迟绑定，避免触发菜单的右键事件立即关闭
    const timer = requestAnimationFrame(() => {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('keydown', handleEscape)
    })

    return () => {
      cancelAnimationFrame(timer)
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [open, hide])

  if (!open || !tabId) return null

  const tab = tabs.find((t) => t.id === tabId)
  if (!tab) return null

  // 仅浏览器 / 编辑器可复制（其余类型无独立内容）
  const canDuplicate = tab.type === 'browser' || tab.type === 'editor'
  const canClose = tabs.length > 0

  const handleDuplicate = (): void => {
    duplicateTab(tabId)
    hide()
  }

  const handleClose = (): void => {
    void closeTabWithDraftPolicy(tabId)
    hide()
  }

  // 确保菜单不超出视口右侧和底部
  const menuStyle: React.CSSProperties = {
    position: 'fixed',
    left: Math.min(x, window.innerWidth - 180),
    top: Math.min(y, window.innerHeight - 100),
    zIndex: 10000,
  }

  return (
    <div className="context-menu" ref={ref} style={menuStyle}>
      <div className="context-menu-items">
        <div
          className={`context-menu-item ${canDuplicate ? '' : 'disabled'}`}
          onClick={canDuplicate ? handleDuplicate : undefined}
        >
          <span className="context-menu-icon">📋</span>
          <span>复制此页</span>
        </div>
        <div className="context-menu-separator" />
        <div
          className={`context-menu-item ${canClose ? '' : 'disabled'}`}
          onClick={canClose ? handleClose : undefined}
        >
          <span className="context-menu-icon">✕</span>
          <span>关闭</span>
        </div>
      </div>
    </div>
  )
}
