import type { ConversationTabRef, Tab } from '../types'

export type ResolvedConversationTab = {
  kind: 'local-agent'
  tabId: string
  conversationId: string
}

function resolveConversationRef(
  tabId: string,
  conversation: ConversationTabRef,
): ResolvedConversationTab {
  return {
    kind: 'local-agent',
    tabId,
    conversationId: conversation.sessionId,
  }
}

export function resolveConversationTab(tab: Tab): ResolvedConversationTab | null {
  if (tab.type === 'conversation' && tab.conversation) {
    return resolveConversationRef(tab.id, tab.conversation)
  }

  return null
}
