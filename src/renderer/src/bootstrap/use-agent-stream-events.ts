import { useEffect } from 'react'
import { useAgentStore } from '../stores/agent-store'
import type { ContentBlock, PermissionMode, ToolConfirmationRequest } from '../types'

type AgentStoreSnapshot = ReturnType<typeof useAgentStore.getState>

type AgentStreamEventPayload = {
  type?: string
  subtype?: string
  session_id?: string
  conversationId?: string
  event?: {
    type?: string
    message?: { id?: string }
    content_block?: {
      type?: string
      text?: string
      id?: string
      name?: string
      input?: Record<string, unknown>
    }
    delta?: {
      type?: string
      text?: string
      thinking?: string
      partial_json?: string
    }
  }
}

type AgentCompletePayload = {
  conversationId?: string
  total_cost_usd?: number
}

type AgentErrorPayload = {
  conversationId?: string
  message: string
}

export function applyAgentStreamEventToStore(
  event: AgentStreamEventPayload,
  store: AgentStoreSnapshot = useAgentStore.getState(),
): void {
  const conversationId = event.conversationId

  switch (event.type) {
    case 'system': {
      if (event.subtype === 'init' && event.session_id) {
        store.setSessionId(event.session_id, conversationId)
        store.setBackendState('connected', conversationId)
      }
      break
    }

    case 'stream_event': {
      const innerEvent = event.event
      if (!innerEvent) break

      if (innerEvent.type === 'message_start' && innerEvent.message?.id) {
        store.startStreamingMessage(innerEvent.message.id, conversationId)
      }

      if (innerEvent.type === 'content_block_start' && innerEvent.content_block) {
        const block = innerEvent.content_block
        if (block.type === 'text') {
          store.appendContentBlock({ type: 'text', text: block.text ?? '' } as ContentBlock, conversationId)
        } else if (block.type === 'thinking') {
          store.appendContentBlock({ type: 'thinking', thinking: '' } as ContentBlock, conversationId)
        } else if (block.type === 'tool_use') {
          store.appendContentBlock(
            {
              type: 'tool_use',
              id: block.id ?? '',
              name: block.name ?? '',
              input: block.input ?? {},
            } as ContentBlock,
            conversationId,
          )
        }
      }

      if (innerEvent.type === 'content_block_delta') {
        const delta = innerEvent.delta
        if (!delta) break

        if (delta.type === 'text_delta') {
          store.appendStreamDelta(delta.text ?? '', conversationId)
        } else if (delta.type === 'thinking_delta') {
          store.appendStreamDelta(delta.thinking ?? '', conversationId)
        } else if (delta.type === 'input_json_delta') {
          store.appendStreamDelta(delta.partial_json ?? '', conversationId)
        }
      }
      break
    }

    case 'assistant':
      break
  }
}

export function applyAgentCompleteToStore(
  result: AgentCompletePayload,
  store: AgentStoreSnapshot = useAgentStore.getState(),
): void {
  const conversationId = result.conversationId
  store.finishStreamingMessage(conversationId)
  if (result.total_cost_usd !== undefined) {
    store.setLastCost(result.total_cost_usd, conversationId)
  }
}

export function applyAgentErrorToStore(
  error: AgentErrorPayload,
  store: AgentStoreSnapshot = useAgentStore.getState(),
): void {
  const conversationId = error.conversationId
  store.cancelStreaming(conversationId)
  store.addSystemMessage(`连接错误: ${error.message}`, conversationId)
  store.setBackendState('error', conversationId)
}

/** 全局订阅 Agent 后端事件，并写入会话 store。 */
export function useAgentStreamEvents(): void {
  useEffect(() => {
    const offStream = window.cclinkStudio.agent.onStreamEvent((event) => {
      applyAgentStreamEventToStore(event)
    })

    const offComplete = window.cclinkStudio.agent.onComplete((result) => {
      applyAgentCompleteToStore(result)
    })

    const offError = window.cclinkStudio.agent.onError((error) => {
      applyAgentErrorToStore(error)
    })

    const offConfirmation = window.cclinkStudio.agent.onRequestConfirmation(
      (request: ToolConfirmationRequest) => {
        useAgentStore.getState().addPendingConfirmation(request)
      },
    )

    window.cclinkStudio.agent.getPermissionMode().then((mode: string) => {
      useAgentStore.getState().setPermissionMode(mode as PermissionMode)
    })

    return () => {
      offStream()
      offComplete()
      offError()
      offConfirmation()
    }
  }, [])
}
