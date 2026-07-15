import { useCallback, useRef } from 'react'

interface ResizeHandleProps {
  /** 拖拽时回调，参数为本次拖拽从起点到当前的宽度变化量 (px) */
  onResize: (delta: number) => void
  /** 拖拽结束回调 */
  onResizeEnd?: () => void
  /** 被调整的面板位置：左侧面板向右拖变宽，右侧面板向左拖变宽 */
  side?: 'left' | 'right'
}

/**
 * 面板宽度拖拽调整手柄
 *
 * 渲染一个 4px 宽的透明可拖拽区域，hover 时显示蓝色高亮条。
 * 拖拽时实时回调 onResize(delta)，由父组件控制实际宽度。
 */
export function ResizeHandle({ onResize, onResizeEnd, side = 'right' }: ResizeHandleProps): React.ReactElement {
  const dragStartXRef = useRef(0)
  const draggingRef = useRef(false)

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      dragStartXRef.current = e.clientX
      draggingRef.current = true
      document.body.classList.add('is-resizing-panels')

      const handleMouseMove = (moveEvent: MouseEvent): void => {
        if (!draggingRef.current) return
        const delta = moveEvent.clientX - dragStartXRef.current
        // side='left' 时，向右拖 = 正值 = 增大宽度
        // side='right' 时，向右拖 = 正值 = 减小宽度
        onResize(side === 'left' ? delta : -delta)
      }

      const handleMouseUp = (): void => {
        draggingRef.current = false
        document.body.classList.remove('is-resizing-panels')
        onResizeEnd?.()
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }

      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
    },
    [onResize, onResizeEnd, side],
  )

  return (
    <div
      className="resize-handle"
      onMouseDown={handleMouseDown}
    />
  )
}
