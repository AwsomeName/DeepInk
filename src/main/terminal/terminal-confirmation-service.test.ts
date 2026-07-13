import { describe, expect, it, vi } from 'vitest'
import type { TerminalCommandConfirmationRequest, TerminalRuntimeRef } from '../../shared/terminal'
import {
  TERMINAL_CONFIRMATION_CHANNEL,
  TerminalConfirmationService,
} from './terminal-confirmation-service'

function createAuditStore() {
  return {
    recordEvent: vi.fn(async (event) => event),
  }
}

function createRuntime(): TerminalRuntimeRef {
  return {
    location: 'local',
    transport: 'local',
    backend: 'local-shell',
    workspaceRef: {
      kind: 'local',
      path: '/Users/apple/Desktop/DeepInk',
    },
    cwd: '/Users/apple/Desktop/DeepInk',
    shell: '/bin/zsh',
  }
}

function createWindow(options: { destroyed?: boolean; throwOnSend?: boolean } = {}) {
  const send = vi.fn(() => {
    if (options.throwOnSend) throw new Error('send failed')
  })
  return {
    isDestroyed: () => Boolean(options.destroyed),
    webContents: { send },
  } as any
}

function createInput() {
  return {
    terminalSessionId: 'terminal-1',
    workspaceKey: '/Users/apple/Desktop/DeepInk',
    command: 'rm -rf dist',
    actor: 'agent' as const,
    risk: 'destructive' as const,
    reason: '命令风险需要确认',
    cwd: '/Users/apple/Desktop/DeepInk',
    runtime: createRuntime(),
  }
}

describe('TerminalConfirmationService', () => {
  it('sends a structured confirmation request, resolves approval and records audit events', async () => {
    const window = createWindow()
    const auditStore = createAuditStore()
    const service = new TerminalConfirmationService(window, {
      idFactory: () => 'confirmation-1',
      now: () => 1_000,
      timeoutMs: 30_000,
      auditStore,
    })

    const result = service.requestConfirmation(createInput())

    expect(window.webContents.send).toHaveBeenCalledTimes(1)
    const [channel, request] = window.webContents.send.mock.calls[0] as [
      string,
      TerminalCommandConfirmationRequest,
    ]
    expect(channel).toBe(TERMINAL_CONFIRMATION_CHANNEL)
    expect(request).toMatchObject({
      id: 'confirmation-1',
      createdAt: 1_000,
      expiresAt: 31_000,
      command: 'rm -rf dist',
      actor: 'agent',
      risk: 'destructive',
    })

    expect(service.resolveConfirmation('confirmation-1', true)).toBe(true)
    await expect(result).resolves.toBe(true)
    await service.flushAudit()
    expect(service.getPendingRequests()).toEqual([])
    expect(auditStore.recordEvent).toHaveBeenCalledTimes(2)
    expect(auditStore.recordEvent.mock.calls.map(([event]) => event.kind)).toEqual([
      'command-confirmation-requested',
      'command-approved',
    ])
    expect(auditStore.recordEvent.mock.calls[1][0]).toMatchObject({
      id: 'confirmation-1:command-approved',
      terminalSessionId: 'terminal-1',
      workspaceKey: '/Users/apple/Desktop/DeepInk',
      command: 'rm -rf dist',
      actor: 'agent',
      risk: 'destructive',
      approved: true,
    })
  })

  it('resolves rejection and records denial when user denies the request', async () => {
    const auditStore = createAuditStore()
    const service = new TerminalConfirmationService(createWindow(), {
      idFactory: () => 'confirmation-denied',
      auditStore,
    })

    const result = service.requestConfirmation(createInput())

    expect(service.resolveConfirmation('confirmation-denied', false)).toBe(true)
    await expect(result).resolves.toBe(false)
    await service.flushAudit()
    expect(auditStore.recordEvent.mock.calls.map(([event]) => event.kind)).toEqual([
      'command-confirmation-requested',
      'command-denied',
    ])
    expect(auditStore.recordEvent.mock.calls[1][0]).toMatchObject({
      id: 'confirmation-denied:command-denied',
      approved: false,
      message: '用户拒绝 Terminal 命令',
    })
  })

  it('auto rejects and records timeout when confirmation times out', async () => {
    vi.useFakeTimers()
    const auditStore = createAuditStore()
    const service = new TerminalConfirmationService(createWindow(), {
      idFactory: () => 'confirmation-timeout',
      timeoutMs: 100,
      auditStore,
    })

    const result = service.requestConfirmation(createInput())
    expect(service.getPendingRequests()).toHaveLength(1)

    await vi.advanceTimersByTimeAsync(100)

    await expect(result).resolves.toBe(false)
    await service.flushAudit()
    expect(service.getPendingRequests()).toEqual([])
    expect(auditStore.recordEvent.mock.calls.map(([event]) => event.kind)).toEqual([
      'command-confirmation-requested',
      'command-confirmation-timeout',
    ])
    expect(auditStore.recordEvent.mock.calls[1][0]).toMatchObject({
      id: 'confirmation-timeout:command-confirmation-timeout',
      approved: false,
      message: 'Terminal 命令确认超时，已拒绝',
    })
    vi.useRealTimers()
  })

  it('rejects immediately and records denial when the window is destroyed', async () => {
    const window = createWindow({ destroyed: true })
    const auditStore = createAuditStore()
    const service = new TerminalConfirmationService(window, {
      idFactory: () => 'confirmation-window-destroyed',
      auditStore,
    })

    await expect(service.requestConfirmation(createInput())).resolves.toBe(false)
    await service.flushAudit()
    expect(window.webContents.send).not.toHaveBeenCalled()
    expect(service.getPendingRequests()).toEqual([])
    expect(auditStore.recordEvent.mock.calls.map(([event]) => event.kind)).toEqual([
      'command-confirmation-requested',
      'command-denied',
    ])
    expect(auditStore.recordEvent.mock.calls[1][0]).toMatchObject({
      message: 'Terminal 确认窗口不可用，已拒绝',
    })
  })

  it('rejects immediately when sending the event fails', async () => {
    const window = createWindow({ throwOnSend: true })
    const service = new TerminalConfirmationService(window, {
      idFactory: () => 'confirmation-send-failed',
    })

    await expect(service.requestConfirmation(createInput())).resolves.toBe(false)
    expect(window.webContents.send).toHaveBeenCalledTimes(1)
    expect(service.getPendingRequests()).toEqual([])
  })

  it('rejects pending confirmations on destroy', async () => {
    const auditStore = createAuditStore()
    const service = new TerminalConfirmationService(createWindow(), {
      idFactory: () => 'confirmation-destroy',
      auditStore,
    })

    const result = service.requestConfirmation(createInput())

    service.destroy()

    await expect(result).resolves.toBe(false)
    await service.flushAudit()
    expect(service.resolveConfirmation('confirmation-destroy', true)).toBe(false)
    expect(service.getPendingRequests()).toEqual([])
    expect(auditStore.recordEvent.mock.calls.map(([event]) => event.kind)).toEqual([
      'command-confirmation-requested',
      'command-denied',
    ])
    expect(auditStore.recordEvent.mock.calls[1][0]).toMatchObject({
      message: 'Terminal 确认服务销毁，待确认命令已拒绝',
    })
  })

  it('does not block confirmation result when audit recording fails', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const auditStore = {
      recordEvent: vi.fn(async () => {
        throw new Error('audit failed')
      }),
    }
    const service = new TerminalConfirmationService(createWindow(), {
      idFactory: () => 'confirmation-audit-fail',
      auditStore,
    })

    const result = service.requestConfirmation(createInput())

    expect(service.resolveConfirmation('confirmation-audit-fail', true)).toBe(true)
    await expect(result).resolves.toBe(true)
    await service.flushAudit()
    expect(auditStore.recordEvent).toHaveBeenCalledTimes(2)
    expect(warnSpy).toHaveBeenCalledTimes(2)
    warnSpy.mockRestore()
  })
})
