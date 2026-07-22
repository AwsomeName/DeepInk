import { useEffect } from 'react'
import { useCommandStore } from '../../stores/command-store'
import { useToastStore } from '../../components/common/Toast'
import { useContextMenuStore } from './context-menu-store'

function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    Boolean(target.closest('input, textarea, [contenteditable="true"]'))
  )
}

function closestCopySurface(node: Node): Element | null {
  const element = node instanceof Element ? node : node.parentElement
  return element?.closest('.conversation-copy-surface') ?? null
}

function getConversationSelection(): string | null {
  const selection = window.getSelection()
  const text = selection?.toString() ?? ''
  if (!selection || !text.trim() || !selection.anchorNode || !selection.focusNode) return null
  const anchorSurface = closestCopySurface(selection.anchorNode)
  const focusSurface = closestCopySurface(selection.focusNode)
  return anchorSurface && anchorSurface === focusSurface ? text : null
}

export function useConversationSelectionMenu(): void {
  useEffect(() => {
    const handleContextMenu = (event: MouseEvent): void => {
      if (isEditableTarget(event.target)) return
      const text = getConversationSelection()
      if (!text) return
      event.preventDefault()
      event.stopPropagation()
      useContextMenuStore.getState().show({
        target: { kind: 'conversation-selection', text },
        x: event.clientX,
        y: event.clientY,
        focusReturn: event.target instanceof HTMLElement ? event.target : null,
      })
    }
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (!(event.metaKey || event.ctrlKey) || event.shiftKey || event.key.toLowerCase() !== 'c')
        return
      if (isEditableTarget(event.target)) return
      const text = getConversationSelection()
      if (!text) return
      event.preventDefault()
      void useCommandStore
        .getState()
        .executeCommand('conversation.copySelection', {
          source: 'shortcut',
          target: { kind: 'conversation-selection', text },
        })
        .then((result) => {
          if (!result.ok) {
            useToastStore.getState().show(`复制失败: ${result.message ?? '未知错误'}`, 'error')
          }
        })
    }
    document.addEventListener('contextmenu', handleContextMenu, true)
    document.addEventListener('keydown', handleKeyDown, true)
    return () => {
      document.removeEventListener('contextmenu', handleContextMenu, true)
      document.removeEventListener('keydown', handleKeyDown, true)
    }
  }, [])
}
