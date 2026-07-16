import { beforeEach, describe, expect, it } from 'vitest'
import { useAgentStore } from '../../stores/agent-store'
import { buildAgentSendPayload } from './payload'

describe('buildAgentSendPayload', () => {
  beforeEach(() => {
    useAgentStore.setState(useAgentStore.getInitialState(), true)
  })

  it('includes the persisted SDK session and conversation workspace', () => {
    const conversationId = useAgentStore.getState().createConversation({
      runtime: {
        location: 'local',
        transport: 'local',
        backend: 'cclink-studio-agent',
        workspaceRef: { kind: 'local', path: '/Users/apple/Desktop/previous-project' },
      },
    })
    useAgentStore.getState().setSessionId('session-123', conversationId)

    const conversation = useAgentStore.getState().conversations[conversationId]
    expect(buildAgentSendPayload('继续', conversation)).toMatchObject({
      message: '继续',
      sessionId: 'session-123',
      workspaceRef: { kind: 'local', path: '/Users/apple/Desktop/previous-project' },
    })
  })
})
