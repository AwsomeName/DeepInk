import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TerminalTabRef } from '@shared/terminal'
import { recordTerminalLifecycleEvent } from './terminal-lifecycle'

const terminal: TerminalTabRef = {
  runtime: {
    location: 'local',
    transport: 'local',
    backend: 'local-shell',
    workspaceRef: { kind: 'local', path: '/workspace' },
    cwd: '/workspace',
  },
  permissionPolicy: {
    mode: 'ask-risky-command',
    requireConfirmationFor: ['write', 'destructive', 'privileged', 'unknown'],
  },
  status: 'idle',
  closePolicy: 'terminate-process',
  sessionId: 'terminal-session-1',
}

beforeEach(() => {
  vi.restoreAllMocks()
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  vi.stubGlobal('window', {
    deepink: {
      terminal: {
        recordLifecycleEvent: vi.fn().mockResolvedValue({ success: true }),
      },
    },
  })
})

describe('recordTerminalLifecycleEvent', () => {
  it('records lifecycle event with session id and workspace key', async () => {
    await recordTerminalLifecycleEvent(terminal, 'created', 'created')

    expect(window.deepink.terminal.recordLifecycleEvent).toHaveBeenCalledWith({
      terminalSessionId: 'terminal-session-1',
      workspaceKey: '/workspace',
      kind: 'created',
      message: 'created',
      runtime: terminal.runtime,
    })
  })

  it('skips terminals without a session id', async () => {
    await recordTerminalLifecycleEvent({ ...terminal, sessionId: undefined }, 'closed')

    expect(window.deepink.terminal.recordLifecycleEvent).not.toHaveBeenCalled()
  })

  it('does not throw when audit recording fails', async () => {
    vi.mocked(window.deepink.terminal.recordLifecycleEvent).mockRejectedValueOnce(new Error('boom'))

    await expect(recordTerminalLifecycleEvent(terminal, 'terminated')).resolves.toBeUndefined()
  })
})
