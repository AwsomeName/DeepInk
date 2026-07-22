import type { ContextTarget } from './context-target'
import type { ShowContextMenuInput } from './context-menu-store'

type ContextMenuTriggerElement = HTMLElement

export function isContextMenuKeyboardEvent(
  event: Pick<KeyboardEvent, 'key' | 'shiftKey'>,
): boolean {
  return event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')
}

export function buildKeyboardContextMenuInput(
  target: ContextTarget,
  element: ContextMenuTriggerElement,
): ShowContextMenuInput {
  const rect = element.getBoundingClientRect()
  return {
    target,
    x: rect.left + Math.min(24, rect.width / 2),
    y: rect.top + Math.min(24, rect.height),
    focusReturn: element,
  }
}
