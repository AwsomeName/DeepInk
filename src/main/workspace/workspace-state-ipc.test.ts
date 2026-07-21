import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockIpcMain = vi.hoisted(() => ({
  handlers: new Map<string, (...args: any[]) => any>(),
  handle: vi.fn((channel: string, handler: (...args: any[]) => any) => {
    mockIpcMain.handlers.set(channel, handler)
  }),
}))

vi.mock('electron', () => ({ ipcMain: mockIpcMain }))

import { registerWorkspaceStateIpc } from './workspace-state-ipc'

describe('registerWorkspaceStateIpc', () => {
  beforeEach(() => {
    mockIpcMain.handlers.clear()
  })

  it('rejects an untrusted sender before reading persistent state', () => {
    const service = createService()
    registerWorkspaceStateIpc(service as never, createGuard('trusted') as never)

    expect(() =>
      mockIpcMain.handlers.get('workspaceState:get')?.({ sender: 'other' }, null, null),
    ).toThrow('untrusted')
    expect(service.getSnapshot).not.toHaveBeenCalled()
  })

  it('rejects unknown sections and oversized state before writing', async () => {
    const service = createService()
    registerWorkspaceStateIpc(service as never, createGuard('trusted') as never)
    const setSection = mockIpcMain.handlers.get('workspaceState:setSection')!

    await expect(
      setSection({ sender: 'trusted' }, '/tmp/project', 'arbitrary', {}, null),
    ).resolves.toMatchObject({ success: false })
    await expect(
      setSection(
        { sender: 'trusted' },
        '/tmp/project',
        'layout',
        { content: 'x'.repeat(5 * 1024 * 1024 + 1) },
        null,
      ),
    ).resolves.toMatchObject({ success: false })
    expect(service.setSection).not.toHaveBeenCalled()
  })

  it('writes a bounded known section for an absolute workspace', async () => {
    const service = createService()
    registerWorkspaceStateIpc(service as never, createGuard('trusted') as never)

    await expect(
      mockIpcMain.handlers.get('workspaceState:setSection')?.(
        { sender: 'trusted' },
        '/tmp/project',
        'layout',
        { sidebarWidth: 240 },
        null,
      ),
    ).resolves.toMatchObject({ success: true })
    expect(service.setSection).toHaveBeenCalledWith(
      '/tmp/project',
      'layout',
      { sidebarWidth: 240 },
      null,
    )
  })
})

function createService() {
  return {
    getSnapshot: vi.fn(async () => ({ sections: {} })),
    setSection: vi.fn(async () => ({ sections: {} })),
    clear: vi.fn(async () => undefined),
    resolveLocalWorkspace: vi.fn(async () => ({ valid: true })),
    listLocalWorkspaces: vi.fn(async () => []),
    getDiagnostics: vi.fn(() => ({})),
  }
}

function createGuard(trustedSender: string) {
  return {
    assert: (event: { sender: string }) => {
      if (event.sender !== trustedSender) throw new Error('untrusted')
    },
    isTrusted: (event: { sender: string }) => event.sender === trustedSender,
  }
}
