/**
 * 文件右键上下文菜单
 *
 * 渲染为 fixed 定位的浮层，点击外部 / Escape 关闭。
 * 仅对 .md 文件显示微信相关操作。
 */

import { useEffect, useRef } from 'react'
import { useContextMenuStore } from '../../stores/context-menu-store'
import { useTabStore } from '../../stores/tab-store'
import { useFsStore } from '../../stores/fs-store'
import { useToastStore } from './Toast'

export function ContextMenu(): React.ReactElement | null {
  const open = useContextMenuStore((s) => s.open)
  const x = useContextMenuStore((s) => s.x)
  const y = useContextMenuStore((s) => s.y)
  const node = useContextMenuStore((s) => s.node)
  const hide = useContextMenuStore((s) => s.hide)

  const openTab = useTabStore((s) => s.openTab)
  const showToast = useToastStore((s) => s.show)
  const startEditing = useFsStore((s) => s.startEditing)
  const workspacePath = useFsStore((s) => s.workspacePath)
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

  /** 新建文件夹 */
  const handleNewFolder = (): void => {
    if (!node) return
    const parentPath = node.type === 'directory' ? node.path : (node.path.lastIndexOf('/') > 0 ? node.path.slice(0, node.path.lastIndexOf('/')) : '/')
    startEditing('new-folder', parentPath)
    hide()
  }

  /** 重命名 */
  const handleRename = (): void => {
    if (!node) return
    startEditing(node.path)
    hide()
  }
  const handlePreview = (): void => {
    if (!node) return
    openTab({
      type: 'preview',
      title: `预览: ${node.name}`,
      icon: '👁️',
      filePath: node.path,
    })
    hide()
  }

  /** 导出微信格式：转换 + 复制到剪贴板 */
  const handleExport = async (): Promise<void> => {
    if (!node) return
    hide()
    try {
      const file = await window.deepink.fs.readFile(node.path)
      const content = typeof file === 'string' ? file : file.content
      const result = await window.deepink.wechat.convert(content)
      if (result.error) {
        showToast('转换失败: ' + result.error, 'error')
        return
      }
      if (!result.html) {
        showToast('转换失败: 未生成 HTML', 'error')
        return
      }
      // 复制富文本 HTML 到剪贴板
      const blob = new Blob([result.html], { type: 'text/html' })
      await navigator.clipboard.write([new ClipboardItem({ 'text/html': blob })])
      showToast('已复制，可直接粘贴到公众号', 'success')
    } catch (err) {
      showToast('导出失败: ' + String(err), 'error')
    }
  }

  if (!open || !node) return null

  const isDir = node.type === 'directory'
  const isMd = node.extension === '.md'

  // 确保菜单不超出视口右侧和底部
  const menuStyle: React.CSSProperties = {
    position: 'fixed',
    left: Math.min(x, window.innerWidth - 220),
    top: Math.min(y, window.innerHeight - 200),
    zIndex: 10000,
  }

  return (
    <div className="context-menu" ref={ref} style={menuStyle}>
      <div className="context-menu-items">
        {/* 通用操作 */}
        {isDir && (
          <div className="context-menu-item" onClick={handleNewFolder}>
            <span className="context-menu-icon">📁</span>
            <span>新建文件夹</span>
          </div>
        )}
        <div className="context-menu-item" onClick={handleRename}>
          <span className="context-menu-icon">✏️</span>
          <span>重命名</span>
        </div>
        <div className="context-menu-separator" />

        {/* 微信格式操作 */}
        {isMd ? (
          <>
            <div className="context-menu-item" onClick={handlePreview}>
              <span className="context-menu-icon">👁️</span>
              <span>预览微信格式</span>
            </div>
            <div className="context-menu-item" onClick={handleExport}>
              <span className="context-menu-icon">📋</span>
              <span>导出微信格式</span>
            </div>
          </>
        ) : (
          <div className="context-menu-item disabled">
            <span className="context-menu-icon">ℹ️</span>
            <span>微信格式仅支持 Markdown 文件</span>
          </div>
        )}
      </div>
    </div>
  )
}
