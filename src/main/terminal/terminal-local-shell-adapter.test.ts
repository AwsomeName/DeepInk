import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
import type { TerminalRuntimeRef } from '../../shared/terminal'
import { LocalShellExecutionAdapter } from './terminal-local-shell-adapter'

class FakeChildProcess extends EventEmitter {
  stdout = new PassThrough()
  stderr = new PassThrough()
  stdin = new PassThrough()
  pid = 1234
  kill = vi.fn(() => {
    this.emit('exit', null, 'SIGTERM')
    return true
  })
}

const localRuntime: TerminalRuntimeRef = {
  location: 'local',
  transport: 'local',
  backend: 'local-shell',
  workspaceRef: {
    kind: 'local',
    path: '/tmp',
  },
  cwd: '/tmp',
}

describe('LocalShellExecutionAdapter', () => {
  it('starts a local shell and emits output events', async () => {
    const child = new FakeChildProcess()
    const listener = vi.fn()
    const adapter = new LocalShellExecutionAdapter({
      now: () => 1000,
      spawnShell: vi.fn(() => child as any),
    })
    adapter.onEvent(listener)

    await expect(
      adapter.start({ sessionId: 'terminal-1', runtime: localRuntime }),
    ).resolves.toEqual({
      sessionId: 'terminal-1',
      status: 'running',
      processId: 1234,
    })

    child.stdout.write('hello\n')
    child.stderr.write('warn\n')

    expect(listener).toHaveBeenCalledWith({
      kind: 'started',
      sessionId: 'terminal-1',
      processId: 1234,
      timestamp: 1000,
    })
    expect(listener).toHaveBeenCalledWith({
      kind: 'output',
      sessionId: 'terminal-1',
      data: 'hello\n',
      stream: 'stdout',
      timestamp: 1000,
    })
    expect(listener).toHaveBeenCalledWith({
      kind: 'output',
      sessionId: 'terminal-1',
      data: 'warn\n',
      stream: 'stderr',
      timestamp: 1000,
    })
  })

  it('writes to and terminates an existing shell session', async () => {
    const child = new FakeChildProcess()
    const listener = vi.fn()
    const adapter = new LocalShellExecutionAdapter({
      now: () => 2000,
      spawnShell: vi.fn(() => child as any),
    })
    adapter.onEvent(listener)

    await adapter.start({ sessionId: 'terminal-2', runtime: localRuntime })
    await adapter.write({ sessionId: 'terminal-2', data: 'pwd\n', actor: 'user' })
    await adapter.terminate('terminal-2')

    expect(child.stdin.read()?.toString('utf-8')).toBe('pwd\n')
    expect(child.kill).toHaveBeenCalledWith('SIGTERM')
    expect(listener).toHaveBeenCalledWith({
      kind: 'exit',
      sessionId: 'terminal-2',
      exitCode: undefined,
      signal: 'SIGTERM',
      timestamp: 2000,
    })
  })
})
