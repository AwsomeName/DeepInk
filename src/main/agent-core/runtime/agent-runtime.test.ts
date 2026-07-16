import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { IAgentBackend } from '../backends/types'
import { AgentRuntime } from './agent-runtime'

const backends = vi.hoisted(() => [] as TestBackend[])

class TestBackend implements IAgentBackend {
  sessionId: string | null = null
  scope: unknown = null
  destroy = vi.fn(async () => {})
  sendMessage = vi.fn(async () => {})
  abort = vi.fn(async () => {})

  getStatus() {
    return { connected: false, sessionId: this.sessionId }
  }

  resetSession(): void {
    this.sessionId = null
  }

  getSessionId(): string | null {
    return this.sessionId
  }

  setSessionId(sessionId: string | null): void {
    this.sessionId = sessionId
  }

  setScope(scope: unknown): void {
    this.scope = scope
  }

  onEvent(): void {}
}

vi.mock('../backends/backend-factory.js', () => ({
  createBackend: vi.fn(() => {
    const backend = new TestBackend()
    backends.push(backend)
    return backend
  }),
}))

describe('AgentRuntime session continuity', () => {
  beforeEach(() => {
    backends.length = 0
  })

  it('preserves session id and scope when backend settings are reconfigured', () => {
    const runtime = new AgentRuntime({
      config: { type: 'local-claude-code' },
      deps: {} as never,
    })
    runtime.restoreConversation('conversation-1', 'session-1')
    runtime.setScope({ kind: 'editor' }, 'conversation-1')

    runtime.switchBackend({
      type: 'local-claude-code',
      claudeCode: { modelName: 'next-model' },
    })

    expect(runtime.getStatus('conversation-1').sessionId).toBe('session-1')
    expect(runtime.getScope('conversation-1')).toEqual({ kind: 'editor' })
  })
})
