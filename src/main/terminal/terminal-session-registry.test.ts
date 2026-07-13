import { describe, expect, it } from 'vitest'
import type { TerminalRuntimeRef } from '../../shared/terminal'
import { TerminalSessionRegistry } from './terminal-session-registry'

const runtime: TerminalRuntimeRef = {
  location: 'remote',
  transport: 'cclink',
  backend: 'remote-shell',
  workspaceRef: {
    kind: 'remote',
    transport: 'cclink',
    endpointId: 'agent-1',
    workspaceId: 'workspace-1',
    path: '/data/research',
    endpointName: 'supermicro',
  },
  cwd: '/data/research',
  endpointId: 'agent-1',
}

describe('TerminalSessionRegistry', () => {
  it('registers and lists terminal sessions', () => {
    const registry = new TerminalSessionRegistry()

    const session = registry.register({
      sessionId: 'terminal-remote-1',
      runtime,
      now: 100,
    })

    expect(session.status).toBe('idle')
    expect(registry.get('terminal-remote-1')).toBe(session)
    expect(registry.list()).toEqual([session])
  })

  it('rejects duplicate session ids', () => {
    const registry = new TerminalSessionRegistry()

    registry.register({ sessionId: 'terminal-1', runtime })

    expect(() => registry.register({ sessionId: 'terminal-1', runtime })).toThrow(
      'Terminal session 已存在：terminal-1',
    )
  })

  it('updates sessions through the guarded state machine', () => {
    const registry = new TerminalSessionRegistry()

    registry.register({ sessionId: 'terminal-1', runtime, now: 100 })
    registry.transition('terminal-1', 'starting', { now: 110 })
    const runningSession = registry.transition('terminal-1', 'running', {
      now: 120,
      processId: 'remote-process-1',
    })

    expect(runningSession).toMatchObject({
      status: 'running',
      processId: 'remote-process-1',
      updatedAt: 120,
    })
    expect(registry.get('terminal-1')).toBe(runningSession)
  })

  it('rejects unknown sessions and invalid transitions', () => {
    const registry = new TerminalSessionRegistry()

    expect(() => registry.transition('missing', 'running')).toThrow(
      'Terminal session 不存在：missing',
    )

    registry.register({ sessionId: 'terminal-1', runtime })
    expect(() => registry.transition('terminal-1', 'running')).toThrow(
      '非法 Terminal 状态迁移：idle -> running',
    )
  })

  it('removes and clears sessions', () => {
    const registry = new TerminalSessionRegistry()

    registry.register({ sessionId: 'terminal-1', runtime })
    registry.register({ sessionId: 'terminal-2', runtime })

    expect(registry.remove('terminal-1')).toBe(true)
    expect(registry.get('terminal-1')).toBeNull()
    expect(registry.list()).toHaveLength(1)

    registry.clear()
    expect(registry.list()).toEqual([])
  })
})
