import { useEffect, useRef } from 'react'
import { useAgentStore, type AgentConversationState } from '../stores/agent-store'

export function collectRestorableAgentSessions(
  conversations: Record<string, AgentConversationState>,
  conversationOrder: string[],
): Array<{ conversationId: string; sessionId: string }> {
  return conversationOrder.flatMap((conversationId) => {
    const conversation = conversations[conversationId]
    return conversation?.sessionId && !conversation.archivedAt
      ? [{ conversationId, sessionId: conversation.sessionId }]
      : []
  })
}

/** 在 WorkspaceState hydrate 后预热所有 Claude SDK 会话，不依赖某个面板是否挂载。 */
export function useAgentConversationRestore(enabled: boolean): void {
  const conversations = useAgentStore((state) => state.conversations)
  const conversationOrder = useAgentStore((state) => state.conversationOrder)
  const restoredSessionsRef = useRef<Map<string, string>>(new Map())

  useEffect(() => {
    if (!enabled) return

    const sessions = collectRestorableAgentSessions(conversations, conversationOrder)
    const liveConversationIds = new Set(sessions.map((session) => session.conversationId))
    for (const conversationId of restoredSessionsRef.current.keys()) {
      if (!liveConversationIds.has(conversationId)) {
        restoredSessionsRef.current.delete(conversationId)
      }
    }

    for (const session of sessions) {
      if (restoredSessionsRef.current.get(session.conversationId) === session.sessionId) continue
      restoredSessionsRef.current.set(session.conversationId, session.sessionId)
      void window.cclinkStudio.agent
        .restoreConversation(session.conversationId, session.sessionId)
        .catch(() => {
          if (restoredSessionsRef.current.get(session.conversationId) === session.sessionId) {
            restoredSessionsRef.current.delete(session.conversationId)
          }
        })
    }
  }, [conversationOrder, conversations, enabled])
}
