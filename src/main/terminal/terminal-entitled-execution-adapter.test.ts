import { describe, expect, it, vi } from 'vitest'
import { REMOTE_ERROR_CODE } from '../../shared/remote-error'
import type { TerminalRuntimeRef } from '../../shared/terminal'
import type { TerminalExecutionAdapter } from './terminal-execution-adapter'
import { EntitledTerminalExecutionAdapter } from './terminal-entitled-execution-adapter'
import { TerminalLocalShellError } from './terminal-local-shell-adapter'

const remoteRuntime: TerminalRuntimeRef = {
  location: 'remote',
  transport: 'cclink',
  backend: 'remote-shell',
  endpointId: 'agent-1',
  workspaceRef: {
    kind: 'remote',
    transport: 'cclink',
    endpointId: 'agent-1',
    workspaceId: 'workspace-1',
    path: '/srv/app',
  },
  cwd: '/srv/app',
}

function delegate(): TerminalExecutionAdapter {
  return {
    backend: 'remote-shell',
    start: vi.fn(async (input) => ({ sessionId: input.sessionId, status: 'running' as const })),
    write: vi.fn(async () => undefined),
    resize: vi.fn(async () => undefined),
    terminate: vi.fn(async () => undefined),
    onEvent: vi.fn(() => () => undefined),
  }
}

describe('EntitledTerminalExecutionAdapter', () => {
  it('blocks remote terminal start when entitlement is missing', async () => {
    const wrapped = delegate()
    const adapter = new EntitledTerminalExecutionAdapter(wrapped, {
      featureName: '远程 Terminal',
      entitlement: 'remote_terminal',
      checkAccess: vi.fn(async () => ({ allowed: false, reason: '请升级' })),
      now: () => 1000,
    })
    const listener = vi.fn()
    adapter.onEvent(listener)

    await expect(adapter.start({ sessionId: 'terminal-1', runtime: remoteRuntime })).rejects.toThrow(
      TerminalLocalShellError,
    )
    await expect(adapter.start({ sessionId: 'terminal-1', runtime: remoteRuntime })).rejects.toMatchObject({
      remoteError: {
        layer: 'account',
        code: REMOTE_ERROR_CODE.ENTITLEMENT_REQUIRED,
        message: '请升级',
        retryable: false,
      },
    })
    expect(wrapped.start).not.toHaveBeenCalled()
    expect(listener).toHaveBeenCalledWith({
      kind: 'error',
      sessionId: 'terminal-1',
      message: '请升级',
      remoteError: expect.objectContaining({
        code: REMOTE_ERROR_CODE.ENTITLEMENT_REQUIRED,
      }),
      timestamp: 1000,
    })
  })

  it('delegates start and write when entitlement is available', async () => {
    const wrapped = delegate()
    const checkAccess = vi.fn(async () => ({ allowed: true }))
    const adapter = new EntitledTerminalExecutionAdapter(wrapped, {
      featureName: '远程 Terminal',
      entitlement: 'remote_terminal',
      checkAccess,
    })

    await adapter.start({ sessionId: 'terminal-1', runtime: remoteRuntime })
    await adapter.write({ sessionId: 'terminal-1', data: 'pwd\n', actor: 'user' })

    expect(checkAccess).toHaveBeenCalledTimes(2)
    expect(wrapped.start).toHaveBeenCalledWith({ sessionId: 'terminal-1', runtime: remoteRuntime })
    expect(wrapped.write).toHaveBeenCalledWith({ sessionId: 'terminal-1', data: 'pwd\n', actor: 'user' })
  })
})
