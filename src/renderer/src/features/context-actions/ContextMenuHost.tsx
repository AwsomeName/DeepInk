import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { workspaceRefKey } from '@shared/workspace-ref'
import { useCommandStore, type CommandAvailability } from '../../stores/command-store'
import { useWorkspaceStore } from '../../stores/workspace-store'
import { IconCheck } from '../../components/common/Icons'
import { useToastStore } from '../../components/common/Toast'
import { useContextMenuStore } from './context-menu-store'
import {
  resolveMenuContributions,
  useMenuContributionRegistry,
  type MenuContribution,
} from './menu-contribution-registry'
import { findBoundaryEnabledIndex, findNextEnabledIndex, fitMenuPosition } from './menu-position'
import { targetMatchesWorkspace, type CommandContext } from './context-target'

interface ResolvedMenuItem {
  contribution: MenuContribution
  commandId: string
  label: string
  enabled: boolean
  disabledReason?: string
  risk?: string
  checked?: boolean
}

function resolveAvailability(value: CommandAvailability | undefined): {
  enabled: boolean
  reason?: string
} {
  if (value === undefined) return { enabled: true }
  if (typeof value === 'boolean') return { enabled: value }
  return { enabled: value.enabled, reason: value.reason }
}

export function ContextMenuHost(): React.ReactElement | null {
  const open = useContextMenuStore((state) => state.open)
  const menuId = useContextMenuStore((state) => state.menuId)
  const x = useContextMenuStore((state) => state.x)
  const y = useContextMenuStore((state) => state.y)
  const target = useContextMenuStore((state) => state.target)
  const editingContributionId = useContextMenuStore((state) => state.editingContributionId)
  const inputValue = useContextMenuStore((state) => state.inputValue)
  const workspaceKeyAtOpen = useContextMenuStore((state) => state.workspaceKeyAtOpen)
  const hide = useContextMenuStore((state) => state.hide)
  const beginInlineEdit = useContextMenuStore((state) => state.beginInlineEdit)
  const setInputValue = useContextMenuStore((state) => state.setInputValue)
  const cancelInlineEdit = useContextMenuStore((state) => state.cancelInlineEdit)
  const commands = useCommandStore((state) => state.commands)
  const executeCommand = useCommandStore((state) => state.executeCommand)
  const contributions = useMenuContributionRegistry((state) => state.contributions)
  const activeWorkspaceRef = useWorkspaceStore((state) => state.activeWorkspaceRef)
  const menuRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [position, setPosition] = useState({ left: x, top: y })
  const [selectedIndex, setSelectedIndex] = useState(0)

  const context = useMemo<CommandContext | null>(
    () => (target ? { source: 'context-menu', target } : null),
    [target],
  )

  const items = useMemo<ResolvedMenuItem[]>(() => {
    if (!context) return []
    return resolveMenuContributions(contributions, context).flatMap((contribution) => {
      const command = commands.find((item) => item.id === contribution.commandId)
      if (!command || (command.visible && !command.visible(context))) return []
      const availability = resolveAvailability(command.enabled?.(context))
      return [
        {
          contribution,
          commandId: command.id,
          label: command.contextLabel?.(context) ?? command.label,
          enabled: availability.enabled,
          disabledReason: availability.reason,
          risk: command.risk,
          checked: command.checked?.(context),
        },
      ]
    })
  }, [commands, context, contributions])

  useLayoutEffect(() => {
    if (!open || !menuRef.current) return
    const rect = menuRef.current.getBoundingClientRect()
    setPosition(
      fitMenuPosition({
        x,
        y,
        menuWidth: rect.width,
        menuHeight: rect.height,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
      }),
    )
  }, [editingContributionId, items.length, menuId, open, x, y])

  useEffect(() => {
    if (!open) return
    const currentWorkspaceKey = workspaceRefKey(activeWorkspaceRef)
    if (
      currentWorkspaceKey !== workspaceKeyAtOpen ||
      (target && !targetMatchesWorkspace(target, currentWorkspaceKey))
    ) {
      hide('workspace-switch')
      return
    }
    const firstEnabled = items.findIndex((item) => item.enabled)
    setSelectedIndex(firstEnabled >= 0 ? firstEnabled : 0)
    requestAnimationFrame(() => {
      const first = menuRef.current?.querySelector<HTMLElement>('[role^="menuitem"]:not(:disabled)')
      first?.focus()
    })
  }, [activeWorkspaceRef, hide, items, menuId, open, target, workspaceKeyAtOpen])

  useEffect(() => {
    if (editingContributionId) requestAnimationFrame(() => inputRef.current?.select())
  }, [editingContributionId])

  useEffect(() => {
    if (!open) return
    const handlePointerDown = (event: MouseEvent): void => {
      if (!menuRef.current?.contains(event.target as Node)) hide('outside')
    }
    const handleBlur = (): void => hide('blur')
    document.addEventListener('mousedown', handlePointerDown)
    window.addEventListener('blur', handleBlur)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      window.removeEventListener('blur', handleBlur)
    }
  }, [hide, open])

  if (!open || !context || !target || items.length === 0) return null

  const execute = async (item: ResolvedMenuItem, value?: string): Promise<void> => {
    if (!item.enabled) return
    hide('execute')
    const result = await executeCommand(item.commandId, {
      ...context,
      inputValue: value,
    })
    if (!result.ok) {
      useToastStore.getState().show(result.message ?? '操作无法完成', 'error')
    }
  }

  const moveSelection = (direction: 1 | -1): void => {
    const next = findNextEnabledIndex(
      items.map((item) => item.enabled),
      selectedIndex,
      direction,
    )
    if (next < 0) return
    setSelectedIndex(next)
    menuRef.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]')[next]?.focus()
  }

  const handleKeyDown = (event: React.KeyboardEvent): void => {
    if (editingContributionId) {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        cancelInlineEdit()
        requestAnimationFrame(() => {
          menuRef.current
            ?.querySelectorAll<HTMLElement>('[role^="menuitem"]')
            [selectedIndex]?.focus()
        })
      }
      return
    }
    switch (event.key) {
      case 'Escape':
        event.preventDefault()
        hide('escape')
        break
      case 'ArrowDown':
        event.preventDefault()
        moveSelection(1)
        break
      case 'ArrowUp':
        event.preventDefault()
        moveSelection(-1)
        break
      case 'Home': {
        event.preventDefault()
        const index = findBoundaryEnabledIndex(
          items.map((item) => item.enabled),
          'start',
        )
        if (index >= 0) {
          setSelectedIndex(index)
          menuRef.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]')[index]?.focus()
        }
        break
      }
      case 'End': {
        event.preventDefault()
        const index = findBoundaryEnabledIndex(
          items.map((item) => item.enabled),
          'end',
        )
        if (index >= 0) {
          setSelectedIndex(index)
          menuRef.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]')[index]?.focus()
        }
        break
      }
      case 'Enter': {
        event.preventDefault()
        const item = items[selectedIndex]
        if (!item?.enabled) break
        if (item.contribution.inlineInput) {
          beginInlineEdit(item.contribution.id, item.contribution.inlineInput.initialValue(context))
        } else {
          void execute(item)
        }
        break
      }
    }
  }

  let previousGroup: string | null = null
  return (
    <div
      ref={menuRef}
      className={`context-menu unified-context-menu ${editingContributionId ? 'renaming' : ''}`}
      role="menu"
      aria-label="上下文菜单"
      style={{ position: 'fixed', left: position.left, top: position.top, zIndex: 10000 }}
      onKeyDown={handleKeyDown}
    >
      <div className="context-menu-items">
        {items.map((item, index) => {
          const separator = previousGroup !== null && previousGroup !== item.contribution.group
          previousGroup = item.contribution.group
          const editing = editingContributionId === item.contribution.id
          return (
            <div key={item.contribution.id}>
              {separator && <div className="context-menu-separator" role="separator" />}
              {editing ? (
                <form
                  className="tab-context-rename"
                  onSubmit={(event) => {
                    event.preventDefault()
                    if (inputValue.trim()) void execute(item, inputValue)
                  }}
                >
                  <input
                    ref={inputRef}
                    value={inputValue}
                    onChange={(event) => setInputValue(event.target.value)}
                    aria-label={item.contribution.inlineInput?.ariaLabel}
                  />
                  <button type="submit" title="确认重命名" disabled={!inputValue.trim()}>
                    <IconCheck size={14} />
                  </button>
                </form>
              ) : (
                <button
                  type="button"
                  role={item.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
                  aria-checked={item.checked}
                  data-context-action={item.contribution.id}
                  className={`context-menu-item ${index === selectedIndex ? 'selected' : ''} ${item.risk === 'destructive' ? 'danger' : ''}`}
                  disabled={!item.enabled}
                  title={item.disabledReason}
                  onFocus={() => setSelectedIndex(index)}
                  onMouseEnter={() => setSelectedIndex(index)}
                  onClick={() => {
                    if (item.contribution.inlineInput) {
                      beginInlineEdit(
                        item.contribution.id,
                        item.contribution.inlineInput.initialValue(context),
                      )
                    } else {
                      void execute(item)
                    }
                  }}
                >
                  {item.contribution.icon && (
                    <span className="context-menu-icon">{item.contribution.icon}</span>
                  )}
                  <span>{item.label}</span>
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
