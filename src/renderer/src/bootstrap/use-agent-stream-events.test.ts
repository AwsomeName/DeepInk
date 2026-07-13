import { beforeEach, describe, expect, it } from 'vitest'
import { useAgentStore } from '../stores/agent-store'
import { useUIStore } from '../stores/ui-store'
import {
  applyAgentCompleteToStore,
  applyAgentErrorToStore,
  applyAgentStreamEventToStore,
} from './use-agent-stream-events'

beforeEach(() => {
  useAgentStore.setState(useAgentStore.getInitialState(), true)
  useUIStore.setState(useUIStore.getInitialState(), true)
})

describe('applyAgentStreamEventToStore', () => {
  it('Agent 面板隐藏时，流式消息仍写入当前会话', () => {
    useUIStore.getState().setAgentPanelMode('hidden', 'user')
    const conversationId = useAgentStore.getState().activeConversationId

    applyAgentStreamEventToStore({
      type: 'stream_event',
      conversationId,
      event: {
        type: 'message_start',
        message: { id: 'msg-hidden-panel' },
      },
    })
    applyAgentStreamEventToStore({
      type: 'stream_event',
      conversationId,
      event: {
        type: 'content_block_delta',
        delta: { type: 'text_delta', text: '隐藏面板下继续响应' },
      },
    })
    applyAgentCompleteToStore({ conversationId, total_cost_usd: 0.01 })

    const state = useAgentStore.getState()
    const message = state.conversations[conversationId].messages.find(
      (item) => item.id === 'msg-hidden-panel',
    )

    expect(useUIStore.getState().agentPanelMode).toBe('hidden')
    expect(state.conversations[conversationId].backendState).toBe('connected')
    expect(state.conversations[conversationId].lastCost).toBe(0.01)
    expect(message?.rawText).toBe('隐藏面板下继续响应')
    expect(message?.isStreaming).toBe(false)
  })

  it('Agent 面板隐藏时，错误事件仍写入系统消息', () => {
    useUIStore.getState().setAgentPanelMode('hidden', 'user')
    const conversationId = useAgentStore.getState().activeConversationId

    applyAgentStreamEventToStore({
      type: 'stream_event',
      conversationId,
      event: {
        type: 'message_start',
        message: { id: 'msg-error-hidden-panel' },
      },
    })
    applyAgentErrorToStore({ conversationId, message: 'network down' })

    const conversation = useAgentStore.getState().conversations[conversationId]
    const lastMessage = conversation.messages[conversation.messages.length - 1]

    expect(useUIStore.getState().agentPanelMode).toBe('hidden')
    expect(conversation.backendState).toBe('error')
    expect(lastMessage.role).toBe('system')
    expect(lastMessage.rawText).toBe('连接错误: network down')
  })
})
