export type ConversationRuntimeProviderKind = 'local-agent' | 'remote-cclink'

export interface ConversationRuntimeProvider {
  kind: ConversationRuntimeProviderKind
  load?: () => Promise<void>
  send: (content: string) => Promise<boolean>
  abort?: () => Promise<boolean>
}

interface LocalAgentConversationProviderOptions {
  conversationId: string
  isBusy: () => boolean
  setInput: (text: string, conversationId?: string) => void
  addUserMessage: (content: string, conversationId?: string) => void
  addSystemMessage: (content: string, conversationId?: string) => void
  cancelStreaming: (conversationId?: string) => void
  sendMessage: (conversationId: string, content: string) => Promise<unknown>
  abortMessage: (conversationId: string) => Promise<void>
}

interface CclinkConversationProviderOptions {
  sessionId: string
  load: () => Promise<void>
  loadMessages: (sessionId: string) => Promise<void>
  sendLocalMessage: (sessionId: string, content: string) => Promise<void>
}

export function createLocalAgentConversationProvider({
  conversationId,
  isBusy,
  setInput,
  addUserMessage,
  addSystemMessage,
  cancelStreaming,
  sendMessage,
  abortMessage,
}: LocalAgentConversationProviderOptions): ConversationRuntimeProvider {
  return {
    kind: 'local-agent',
    send: async (content) => {
      const text = content.trim()
      if (!text || isBusy()) return false
      setInput('', conversationId)
      addUserMessage(text, conversationId)
      try {
        await sendMessage(conversationId, text)
        return true
      } catch (error) {
        addSystemMessage(`发送失败: ${String(error)}`, conversationId)
        return false
      }
    },
    abort: async () => {
      await abortMessage(conversationId)
      cancelStreaming(conversationId)
      addSystemMessage('已手动中止当前任务', conversationId)
      return true
    },
  }
}

export function createCclinkConversationProvider({
  sessionId,
  load,
  loadMessages,
  sendLocalMessage,
}: CclinkConversationProviderOptions): ConversationRuntimeProvider {
  return {
    kind: 'remote-cclink',
    load: async () => {
      try {
        await Promise.all([load(), loadMessages(sessionId)])
      } catch {
        return
      }
    },
    send: async (content) => {
      const text = content.trim()
      if (!text) return false
      try {
        await sendLocalMessage(sessionId, text)
        return true
      } catch {
        return false
      }
    },
  }
}
