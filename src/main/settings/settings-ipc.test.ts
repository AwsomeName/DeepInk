import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from './types'
import { registerSettingsIpc } from './settings-ipc'

const mockIpcMain = vi.hoisted(() => ({
  handlers: new Map<string, (...args: any[]) => any>(),
  handle: vi.fn((channel: string, handler: (...args: any[]) => any) => {
    mockIpcMain.handlers.set(channel, handler)
  }),
}))

vi.mock('electron', () => ({
  ipcMain: mockIpcMain,
}))

describe('registerSettingsIpc', () => {
  beforeEach(() => {
    mockIpcMain.handlers.clear()
    mockIpcMain.handle.mockClear()
  })

  it('rejects an untrusted sender before settings are read', () => {
    const settingsService = createSettingsService()
    registerSettingsIpc(
      settingsService as never,
      createGuard('trusted') as never,
      createPermissionManager() as never,
      () => null,
    )

    const handler = mockIpcMain.handlers.get('settings:getAll')
    expect(() => handler?.({ sender: 'other' })).toThrow('untrusted')
    expect(settingsService.getAll).not.toHaveBeenCalled()
  })

  it('rejects invalid settings before persistence', async () => {
    const settingsService = createSettingsService()
    registerSettingsIpc(
      settingsService as never,
      createGuard('trusted') as never,
      createPermissionManager() as never,
      () => null,
    )

    const handler = mockIpcMain.handlers.get('settings:set')
    await expect(
      handler?.({ sender: 'trusted' }, { permissionMode: 'unrestricted' }),
    ).resolves.toEqual({ success: false, error: '设置参数无效' })
    expect(settingsService.set).not.toHaveBeenCalled()
  })

  it('persists a valid bounded settings update', async () => {
    const settingsService = createSettingsService()
    registerSettingsIpc(
      settingsService as never,
      createGuard('trusted') as never,
      createPermissionManager() as never,
      () => null,
    )

    const handler = mockIpcMain.handlers.get('settings:set')
    await expect(
      handler?.({ sender: 'trusted' }, { permissionMode: 'strict', editorTabSize: 4 }),
    ).resolves.toMatchObject({ success: true })
    expect(settingsService.set).toHaveBeenCalledWith({
      permissionMode: 'strict',
      editorTabSize: 4,
    })
  })
})

function createSettingsService() {
  return {
    getAll: vi.fn(() => ({ ...DEFAULT_SETTINGS })),
    getRuntimeSettings: vi.fn(() => ({ ...DEFAULT_SETTINGS })),
    getSecretStatus: vi.fn(),
    setSecret: vi.fn(),
    clearSecret: vi.fn(),
    set: vi.fn(async (partial) => ({ ...DEFAULT_SETTINGS, ...partial })),
    reset: vi.fn(async () => ({ ...DEFAULT_SETTINGS })),
    resetKey: vi.fn(async () => ({ ...DEFAULT_SETTINGS })),
  }
}

function createPermissionManager() {
  return { setMode: vi.fn() }
}

function createGuard(trustedSender: string) {
  return {
    assert: (event: { sender: string }) => {
      if (event.sender !== trustedSender) throw new Error('untrusted')
    },
    isTrusted: (event: { sender: string }) => event.sender === trustedSender,
  }
}
