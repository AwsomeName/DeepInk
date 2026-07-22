import { describe, expect, it } from 'vitest'
import { buildKeyboardContextMenuInput, isContextMenuKeyboardEvent } from './context-menu-trigger'

describe('context menu keyboard trigger', () => {
  it('accepts the platform menu key and Shift+F10 only', () => {
    expect(isContextMenuKeyboardEvent({ key: 'ContextMenu', shiftKey: false })).toBe(true)
    expect(isContextMenuKeyboardEvent({ key: 'F10', shiftKey: true })).toBe(true)
    expect(isContextMenuKeyboardEvent({ key: 'F10', shiftKey: false })).toBe(false)
  })

  it('anchors keyboard menus inside the focused target', () => {
    const element = {
      getBoundingClientRect: () => ({ left: 100, top: 50, width: 80, height: 30 }),
    } as HTMLElement
    const target = { kind: 'activity' as const, activityId: 'files' }

    expect(buildKeyboardContextMenuInput(target, element)).toEqual({
      target,
      x: 124,
      y: 74,
      focusReturn: element,
    })
  })
})
