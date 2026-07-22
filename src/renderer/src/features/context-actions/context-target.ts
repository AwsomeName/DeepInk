import type { MarkdownSourceRange } from '../markdown/markdown-codec'

export type ContextTarget =
  | {
      kind: 'file'
      workspaceKey: string | null
      path: string
      name: string
      fileType: 'file' | 'directory'
      extension?: string
      expanded?: boolean
    }
  | {
      kind: 'tab'
      workspaceKey: string | null
      tabId: string
      tabType: string
    }
  | {
      kind: 'project'
      workspaceKey: string
      path: string
    }
  | {
      kind: 'activity'
      activityId: string
    }
  | {
      kind: 'sidebar'
      workspaceKey: string | null
      panelId: string
    }
  | {
      kind: 'status-item'
      workspaceKey: string | null
      itemId: string
    }
  | {
      kind: 'layout'
      workspaceKey: string | null
      area: 'sidebar' | 'agent'
    }
  | {
      kind: 'thread'
      workspaceKey: string | null
      conversationId: string
    }
  | {
      kind: 'conversation-selection'
      text: string
    }
  | {
      kind: 'markdown-selection'
      workspaceKey: string | null
      tabId: string
      filePath: string
      range: MarkdownSourceRange
      dirty: boolean
    }

export type ContextTargetKind = ContextTarget['kind']

export type CommandSource = 'palette' | 'shortcut' | 'toolbar' | 'context-menu'

export interface CommandContext {
  source: CommandSource
  target?: ContextTarget
  inputValue?: string
}

export function targetMatchesWorkspace(
  target: ContextTarget,
  workspaceKey: string | null,
): boolean {
  if (target.kind === 'project') return true
  if (!('workspaceKey' in target)) return true
  return target.workspaceKey === workspaceKey
}
