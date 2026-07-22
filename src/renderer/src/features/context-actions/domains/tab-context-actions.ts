import type { Command } from '../../../stores/command-store'
import { useAgentStore } from '../../../stores/agent-store'
import { useTabStore } from '../../../stores/tab-store'
import { resolveConversationTab } from '../../../utils/conversation-tab'
import {
  buildHtmlBrowserTabDraft,
  buildHtmlTextTabDraft,
  isHtmlFilePath,
} from '../../../utils/html-files'
import type { CommandContext } from '../context-target'
import type { MenuContribution } from '../menu-contribution-registry'

function tabIdFromContext(context?: CommandContext): string | null {
  return context?.target?.kind === 'tab' ? context.target.tabId : null
}

export function renameWorkbenchTab(tabId: string, requestedTitle: string | null): boolean {
  const title = requestedTitle?.trim()
  if (!title) return false
  const tab = useTabStore.getState().tabs.find((item) => item.id === tabId)
  if (!tab) return false

  useTabStore.getState().updateTabTitle(tabId, title)
  const conversation = resolveConversationTab(tab)
  if (conversation) useAgentStore.getState().renameConversation(conversation.conversationId, title)
  return true
}

export function createTabContextCommands(): Command[] {
  return [
    {
      id: 'workbench.renameTab',
      label: '重命名 Tab',
      contextOnly: true,
      category: 'Tab',
      risk: 'local-write',
      enabled: (context) => Boolean(tabIdFromContext(context)),
      action: (context) => {
        const tabId = tabIdFromContext(context)
        if (!tabId || !renameWorkbenchTab(tabId, context?.inputValue ?? null)) {
          throw new Error('标签页已不存在或名称为空')
        }
      },
    },
    {
      id: 'workbench.openHtmlAlternative',
      label: '切换 HTML 打开方式',
      contextOnly: true,
      category: 'Tab',
      contextLabel: (context) => {
        const tabId = tabIdFromContext(context)
        const tab = useTabStore.getState().tabs.find((item) => item.id === tabId)
        return tab?.type === 'browser' ? '以文本打开' : '用浏览器打开'
      },
      visible: (context) => {
        const tabId = tabIdFromContext(context)
        const tab = useTabStore.getState().tabs.find((item) => item.id === tabId)
        return Boolean(tab && isHtmlFilePath(tab.filePath))
      },
      action: (context) => {
        const tabId = tabIdFromContext(context)
        const tab = useTabStore.getState().tabs.find((item) => item.id === tabId)
        if (!tab?.filePath) throw new Error('HTML 标签页已不存在')
        useTabStore
          .getState()
          .openTab(
            tab.type === 'browser'
              ? buildHtmlTextTabDraft(tab.filePath, tab.title)
              : buildHtmlBrowserTabDraft(tab.filePath, tab.title),
          )
      },
    },
    {
      id: 'workbench.duplicateTab',
      label: '复制此页',
      contextOnly: true,
      category: 'Tab',
      visible: (context) => {
        const tabId = tabIdFromContext(context)
        const tab = useTabStore.getState().tabs.find((item) => item.id === tabId)
        return Boolean(tab && tab.type !== 'terminal' && tab.type !== 'terminal-record')
      },
      enabled: (context) => {
        const tabId = tabIdFromContext(context)
        const tab = useTabStore.getState().tabs.find((item) => item.id === tabId)
        const enabled = tab?.type === 'browser' || tab?.type === 'editor'
        return { enabled, reason: enabled ? undefined : '当前标签页不支持复制' }
      },
      action: (context) => {
        const tabId = tabIdFromContext(context)
        if (!tabId) throw new Error('标签页已不存在')
        useTabStore.getState().duplicateTab(tabId)
      },
    },
  ]
}

export const tabMenuContributions: MenuContribution[] = [
  {
    id: 'tab.rename',
    targetKinds: ['tab'],
    group: '20-edit',
    order: 10,
    commandId: 'workbench.renameTab',
    icon: '✎',
    inlineInput: {
      ariaLabel: '标签页名称',
      initialValue: (context) => {
        const tabId = tabIdFromContext(context)
        return useTabStore.getState().tabs.find((item) => item.id === tabId)?.title ?? ''
      },
    },
  },
  {
    id: 'tab.html-alternative',
    targetKinds: ['tab'],
    group: '30-open',
    order: 10,
    commandId: 'workbench.openHtmlAlternative',
    icon: '</>',
  },
  {
    id: 'tab.duplicate',
    targetKinds: ['tab'],
    group: '40-copy',
    order: 10,
    commandId: 'workbench.duplicateTab',
    icon: '📋',
  },
  {
    id: 'tab.close',
    targetKinds: ['tab'],
    group: '90-manage',
    order: 10,
    commandId: 'workbench.closeTab',
    icon: '✕',
  },
]
