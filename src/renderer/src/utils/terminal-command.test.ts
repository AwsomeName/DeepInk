import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TerminalTabRef } from '@shared/terminal'
import { submitTerminalCommand } from './terminal-command'

const terminal: TerminalTabRef = {
  runtime: {
    location: 'local',
    transport: 'local',
    backend: 'local-shell',
    workspaceRef: {
      kind: 'local',
      path: '/srv/app',
    },
    cwd: '/srv/app',
  },
  permissionPolicy: {
    mode: 'ask-every-command',
    requireConfirmationFor: ['read', 'write', 'network', 'destructive', 'privileged', 'unknown'],
  },
  status: 'idle',
  closePolicy: 'terminate-process',
  sessionId: 'terminal-session-1',
}

beforeEach(() => {
  vi.restoreAllMocks()
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  vi.stubGlobal('window', {
    cclinkStudio: {
      terminal: {
        submitCommand: vi.fn().mockResolvedValue({
          success: true,
          status: 'accepted',
          risk: 'read',
          execution: 'not-started',
          message: 'accepted',
        }),
        recordLifecycleEvent: vi.fn().mockResolvedValue({ success: true }),
      },
    },
  })
})

describe('submitTerminalCommand', () => {
  it('submits trimmed command with workspace key', async () => {
    const result = await submitTerminalCommand(terminal, ' pwd ')

    expect(result.retriedAfterRegister).toBe(false)
    expect(result.result.success).toBe(true)
    expect(window.cclinkStudio.terminal.submitCommand).toHaveBeenCalledWith({
      terminalSessionId: 'terminal-session-1',
      command: 'pwd',
      actor: 'user',
      permissionPolicy: terminal.permissionPolicy,
      workspaceKey: '/srv/app',
    })
  })

  it('rejects empty commands before IPC', async () => {
    const result = await submitTerminalCommand(terminal, '   ')

    expect(result.result).toMatchObject({
      success: false,
      status: 'rejected',
      error: 'Terminal 命令不能为空',
    })
    expect(window.cclinkStudio.terminal.submitCommand).not.toHaveBeenCalled()
  })

  it('re-registers and retries when restored session is missing', async () => {
    vi.mocked(window.cclinkStudio.terminal.submitCommand)
      .mockResolvedValueOnce({
        success: false,
        status: 'rejected',
        error: 'Terminal session 不存在：terminal-session-1',
      })
      .mockResolvedValueOnce({
        success: true,
        status: 'accepted',
        risk: 'read',
        execution: 'not-started',
        message: 'accepted after retry',
      })

    const result = await submitTerminalCommand(terminal, 'ls')

    expect(result.retriedAfterRegister).toBe(true)
    expect(result.result.success).toBe(true)
    expect(window.cclinkStudio.terminal.recordLifecycleEvent).toHaveBeenCalledWith({
      terminalSessionId: 'terminal-session-1',
      workspaceKey: '/srv/app',
      kind: 'created',
      message: 'Terminal Tab 已重新登记',
      runtime: terminal.runtime,
      permissionPolicy: terminal.permissionPolicy,
      closePolicy: terminal.closePolicy,
    })
    expect(window.cclinkStudio.terminal.submitCommand).toHaveBeenCalledTimes(2)
  })
})
