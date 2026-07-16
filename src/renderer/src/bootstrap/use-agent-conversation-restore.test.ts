import { beforeEach, describe, expect, it } from 'vitest'
import { useAgentStore } from '../stores/agent-store'
import { collectRestorableAgentSessions } from './use-agent-conversation-restore'

describe('collectRestorableAgentSessions', () => {
  beforeEach(() => {
    useAgentStore.setState(useAgentStore.getInitialState(), true)
  })

  it('restores active sessions from both assistant panel and workbench tabs', () => {
    const assistantId = useAgentStore.getState().activeConversationId
    useAgentStore.getState().setSessionId('assistant-session', assistantId)
    const workbenchId = useAgentStore.getState().createConversation({
      surface: 'workbench-tab',
      activate: false,
    })
    useAgentStore.getState().setSessionId('workbench-session', workbenchId)

    const state = useAgentStore.getState()
    expect(collectRestorableAgentSessions(state.conversations, state.conversationOrder)).toEqual([
      { conversationId: assistantId, sessionId: 'assistant-session' },
      { conversationId: workbenchId, sessionId: 'workbench-session' },
    ])
  })
})
