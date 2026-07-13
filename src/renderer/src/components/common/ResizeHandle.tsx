import { useCallback, useRef } from 'react'

interface ResizeHandleProps {
  /** 拖拽时回调，参数为宽度变化量 (px) */
  onResize: (delta: number) => void
  /** 拖拽结束回调 */
  onResizeEnd?: () => void
  /** 方向：'left' 手柄在面板左侧，'right' 在右侧 */
  side?: 'left' | 'right'
}

/**
 * 面板宽度拖拽调整手柄
 *
 * 渲染一个 4px 宽的透明可拖拽区域，hover 时显示蓝色高亮条。
 * 拖拽时实时回调 onResize(delta)，由父组件控制实际宽度。
 */
export function ResizeHandle({ onResize, onResizeEnd, side = 'right' }: ResizeHandleProps): React.ReactElement {
  const startPosRef = useRef(0)
  const draggingRef = useRef(false)

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      startPosRef.current = e.clientX
      draggingRef.current = true

      const handleMouseMove = (moveEvent: MouseEvent): void => {
        if (!draggingRef.current) return
        const delta = moveEvent.clientX - startPosRef.current
        // side='left' 时，向右拖 = 正值 = 增大宽度
        // side='right' 时，向右拖 = 正值 = 减小宽度（由父组件处理符号）
        onResize(side === 'left' ? delta : -delta)
        startPosRef.current = moveEvent.clientX
      }

      const handleMouseUp = (): void => {
        draggingRef.current = false
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
