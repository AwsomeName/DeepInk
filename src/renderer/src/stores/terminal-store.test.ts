import { beforeEach, describe, expect, it } from 'vitest'
import type { TerminalCommandConfirmationRequest } from '../types'
import { useTerminalStore } from './terminal-store'

function createRequest(id: string, command = 'rm -rf dist'): TerminalCommandConfirmationRequest {
  return {
    id,
    createdAt: 1_000,
    expiresAt: 61_000,
    terminalSessionId: 'terminal-1',
    workspaceKey: '/Users/apple/Desktop/DeepInk',
    command,
    actor: 'agent',
    risk: 'destructive',
    reason: '命令风险需要确认',
    cwd: '/Users/apple/Desktop/DeepInk',
    runtime: {
      location: 'local',
      transport: 'local',
      backend: 'local-shell',
      workspaceRef: {
        kind: 'local',
        path: '/Users/apple/Desktop/DeepInk',
      },
    },
  }
}

beforeEach(() => {
  useTerminalStore.getState().clearPendingConfirmations()
})

describe('useTerminalStore', () => {
  it('adds and removes terminal confirmation requests', () => {
    const store = useTerminalStore.getState()

    store.addPendingConfirmation(createRequest('terminal-confirmation-1'))
    expect(useTerminalStore.getState().pendingConfirmations).toHaveLength(1)

    store.removePendingConfirmation('terminal-confirmation-1')
    expect(useTerminalStore.getState().pendingConfirmations).toEqual([])
  })

  it('replaces duplicate confirmation requests by id', () => {
    const store = useTerminalStore.getState()

    store.addPendingConfirmation(createRequest('terminal-confirmation-1', 'rm -rf dist'))
    store.addPendingConfirmation(createRequest('terminal-confirmation-1', 'sudo reboot'))

    expect(useTerminalStore.getState().pendingConfirmations).toHaveLength(1)
    expect(useTerminalStore.getState().pendingConfirmations[0].command).toBe('sudo reboot')
  })
})
