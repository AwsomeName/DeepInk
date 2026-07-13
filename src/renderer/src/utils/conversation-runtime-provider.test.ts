import { describe, expect, it, vi } from 'vitest'
import {
  createCclinkConversationProvider,
  createLocalAgentConversationProvider,
} from './conversation-runtime-provider'

describe('conversation-runtime-provider', () => {
  it('本地 Agent provider 发送消息时写入用户消息并调用后端', async () => {
    const setInput = vi.fn()
    const addUserMessage = vi.fn()
    const addSystemMessage = vi.fn()
    const sendMessage = vi.fn().mockResolvedValue({ ok: true })
    const provider = createLocalAgentConversationProvider({
      conversationId: 'agent-1',
      isBusy: () => false,
      setInput,
      addUserMessage,
      addSystemMessage,
      cancelStreaming: vi.fn(),
      sendMessage,
      abortMessage: vi.fn(),
    })

    await expect(provider.send('  你好  ')).resolves.toBe(true)
    expect(setInput).toHaveBeenCalledWith('', 'agent-1')
    expect(addUserMessage).toHaveBeenCalledWith('你好', 'agent-1')
    expect(sendMessage).toHaveBeenCalledWith('agent-1', '你好')
    expect(addSystemMessage).not.toHaveBeenCalled()
  })

  it('本地 Agent provider 忙碌或空消息时跳过发送', async () => {
    const sendMessage = vi.fn()
    const provider = createLocalAgentConversationProvider({
      conversationId: 'agent-1',
      isBusy: () => true,
      setInput: vi.fn(),
      addUserMessage: vi.fn(),
      addSystemMessage: vi.fn(),
      cancelStreaming: vi.fn(),
      sendMessage,
      abortMessage: vi.fn(),
    })

    await expect(provider.send('hello')).resolves.toBe(false)
    await expect(provider.send('   ')).resolves.toBe(false)
    expect(sendMessage).not.toHaveBeenCalled()
  })

  it('本地 Agent provider 发送失败时写系统消息', async () => {
    const addSystemMessage = vi.fn()
    const provider = createLocalAgentConversationProvider({
      conversationId: 'agent-1',
      isBusy: () => false,
      setInput: vi.fn(),
      addUserMessage: vi.fn(),
      addSystemMessage,
      cancelStreaming: vi.fn(),
      sendMessage: vi.fn().mockRejectedValue(new Error('boom')),
      abortMessage: vi.fn(),
    })

    await expect(provider.send('hello')).resolves.toBe(false)
    expect(addSystemMessage).toHaveBeenCalledWith('发送失败: Error: boom', 'agent-1')
  })

  it('本地 Agent provider 中止时调用后端并写系统消息', async () => {
    const cancelStreaming = vi.fn()
    const addSystemMessage = vi.fn()
    const abortMessage = vi.fn().mockResolvedValue(undefined)
    const provider = createLocalAgentConversationProvider({
      conversationId: 'agent-1',
      isBusy: () => false,
      setInput: vi.fn(),
      addUserMessage: vi.fn(),
      addSystemMessage,
      cancelStreaming,
      sendMessage: vi.fn(),
      abortMessage,
    })

    await expect(provider.abort?.()).resolves.toBe(true)
    expect(abortMessage).toHaveBeenCalledWith('agent-1')
    expect(cancelStreaming).toHaveBeenCalledWith('agent-1')
    expect(addSystemMessage).toHaveBeenCalledWith('已手动中止当前任务', 'agent-1')
  })

  it('CCLink provider 加载会话并发送消息', async () => {
    const load = vi.fn().mockResolvedValue(undefined)
    const loadMessages = vi.fn().mockResolvedValue(undefined)
    const sendLocalMessage = vi.fn().mockResolvedValue(undefined)
    const provider = createCclinkConversationProvider({
      sessionId: 'remote-1',
      load,
      loadMessages,
      sendLocalMessage,
    })

    await provider.load?.()
    await expect(provider.send('  远程你好  ')).resolves.toBe(true)
    await expect(provider.send('   ')).resolves.toBe(false)

    expect(load).toHaveBeenCalled()
    expect(loadMessages).toHaveBeenCalledWith('remote-1')
    expect(sendLocalMessage).toHaveBeenCalledWith('remote-1', '远程你好')
  })

  it('CCLink provider 发送失败时返回 false', async () => {
    const provider = createCclinkConversationProvider({
      sessionId: 'remote-1',
      load: vi.fn(),
      loadMessages: vi.fn(),
      sendLocalMessage: vi.fn().mockRejectedValue(new Error('remote send failed')),
    })

    await expect(provider.send('远程你好')).resolves.toBe(false)
  })

  it('CCLink provider 加载失败时不打断页面渲染', async () => {
    const provider = createCclinkConversationProvider({
      sessionId: 'remote-1',
      load: vi.fn().mockResolvedValue(undefined),
      loadMessages: vi.fn().mockRejectedValue(new Error('remote load failed')),
      sendLocalMessage: vi.fn(),
    })

    await expect(provider.load?.()).resolves.toBeUndefined()
  })
})
