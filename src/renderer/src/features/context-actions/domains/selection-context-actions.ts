import { workspaceRefKey } from '@shared/workspace-ref'
import type { AgentMountedResource } from '../../../types'
import { useAgentStore } from '../../../stores/agent-store'
import { useUIStore } from '../../../stores/ui-store'
import type { Command } from '../../../stores/command-store'
import { useToastStore } from '../../../components/common/Toast'
import { copyTextToClipboard } from '../../../utils/clipboard'
import { MAX_FILE_RANGE_BYTES, MAX_FILE_RANGE_LINES } from '../../agent-conversations/payload'
import { hashMarkdownSnapshot } from '../../markdown/markdown-codec'
import { focusAgentComposer } from '../../markdown/markdown-navigation'
import type { MenuContribution } from '../menu-contribution-registry'

export function createSelectionContextCommands(): Command[] {
  return [
    {
      id: 'conversation.copySelection',
      label: '复制',
      contextOnly: true,
      category: '会话',
      enabled: (context) =>
        Boolean(context.target?.kind === 'conversation-selection' && context.target.text.trim()),
      action: async (context) => {
        if (context?.target?.kind !== 'conversation-selection') throw new Error('选区已失效')
        await copyTextToClipboard(context.target.text)
        useToastStore.getState().show('已复制选中文本', 'success')
      },
    },
    {
      id: 'markdown.sendSelectionToConversation',
      label: '带行号发送给会话',
      contextOnly: true,
      category: '编辑器',
      enabled: (context) => {
        if (context.target?.kind !== 'markdown-selection') return false
        const lineCount = context.target.range.endLine - context.target.range.startLine + 1
        const bytes = new TextEncoder().encode(context.target.range.sourceSnapshot).byteLength
        return {
          enabled: lineCount <= MAX_FILE_RANGE_LINES && bytes <= MAX_FILE_RANGE_BYTES,
          reason: `选区最多 ${MAX_FILE_RANGE_LINES} 行且不超过 ${MAX_FILE_RANGE_BYTES / 1024}KB`,
        }
      },
      action: (context) => {
        if (context?.target?.kind !== 'markdown-selection') throw new Error('Markdown 选区已失效')
        const { filePath, tabId, range, dirty, workspaceKey } = context.target
        const agentStore = useAgentStore.getState()
        const activeConversation = agentStore.conversations[agentStore.activeConversationId]
        const activeWorkspaceKey = activeConversation?.runtime.workspaceRef
          ? workspaceRefKey(activeConversation.runtime.workspaceRef)
          : null
        if (workspaceKey !== activeWorkspaceKey) throw new Error('当前会话已切换到其他项目')
        const name = filePath.split('/').pop() ?? '未命名.md'
        const resource: AgentMountedResource = {
          id: `file-range:${filePath || tabId}:${range.startLine}:${range.endLine}:${Date.now()}`,
          kind: 'file-range',
          label: `${name}:L${range.startLine}-L${range.endLine}`,
          detail: `${filePath || '未保存文档'} 第 ${range.startLine}-${range.endLine} 行`,
          ref: {
            type: 'file-range',
            path: filePath || undefined,
            tabId,
            format: 'markdown',
            startLine: range.startLine,
            endLine: range.endLine,
            startColumn: range.startColumn,
            endColumn: range.endColumn,
            selectedText: range.selectedText,
            sourceSnapshot: range.sourceSnapshot,
            snapshotHash: hashMarkdownSnapshot(range.sourceSnapshot),
            dirty,
          },
        }
        agentStore.addMountedResource(resource, agentStore.activeConversationId)
        useUIStore.getState().setAgentPanelMode('right', 'user')
        useToastStore.getState().show('已将带行号的 Markdown 选区挂到当前会话', 'success')
        requestAnimationFrame(focusAgentComposer)
      },
    },
  ]
}

export const selectionMenuContributions: MenuContribution[] = [
  {
    id: 'conversation-selection.copy',
    targetKinds: ['conversation-selection'],
    group: '40-copy',
    order: 10,
    commandId: 'conversation.copySelection',
    icon: '▣',
  },
  {
    id: 'markdown-selection.send',
    targetKinds: ['markdown-selection'],
    group: '40-send',
    order: 10,
    commandId: 'markdown.sendSelectionToConversation',
    icon: '↗',
  },
]
