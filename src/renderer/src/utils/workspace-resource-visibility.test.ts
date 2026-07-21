import { describe, expect, it } from 'vitest'
import { localWorkspaceRef } from '@shared/workspace-ref'
import {
  isAgentConfirmationVisible,
  isTerminalConfirmationVisible,
} from './workspace-resource-visibility'

describe('workspace resource visibility', () => {
  it('shows agent confirmations only in their owning conversation', () => {
    expect(isAgentConfirmationVisible({ conversationId: 'agent-a' }, 'agent-a')).toBe(true)
    expect(isAgentConfirmationVisible({ conversationId: 'agent-a' }, 'agent-b')).toBe(false)
  })

  it('shows terminal confirmations only in their owning workspace', () => {
    const request = {
      workspaceKey: '/workspace/a',
      runtime: {
        location: 'local' as const,
        transport: 'local' as const,
        backend: 'local-shell' as const,
        workspaceRef: localWorkspaceRef('/workspace/a'),
      },
    }
    expect(isTerminalConfirmationVisible(request, '/workspace/a')).toBe(true)
    expect(isTerminalConfirmationVisible(request, '/workspace/b')).toBe(false)
  })

  it('falls back to the terminal runtime workspace for legacy requests', () => {
    const request = {
      runtime: {
        location: 'local' as const,
        transport: 'local' as const,
        backend: 'local-shell' as const,
        workspaceRef: localWorkspaceRef('/workspace/a'),
      },
    }
    expect(isTerminalConfirmationVisible(request, '/workspace/a')).toBe(true)
  })
})
