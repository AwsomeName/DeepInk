import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createNoopOfficialIntegration } from '../official/official-integration'
import { registerOfficialIpc } from './official-ipc'

const mockIpcMain = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
    mockIpcMain.handlers.set(channel, handler)
  }),
}))

vi.mock('electron', () => ({
  ipcMain: mockIpcMain,
}))

describe('registerOfficialIpc', () => {
  const trustedRendererGuard = {
    assert: vi.fn(),
    isTrusted: vi.fn(() => true),
  }

  beforeEach(() => {
    mockIpcMain.handlers.clear()
    mockIpcMain.handle.mockClear()
  })

  it('registers only the read-only official status probe', () => {
    registerOfficialIpc(createNoopOfficialIntegration(), trustedRendererGuard)

    expect(mockIpcMain.handle).toHaveBeenCalledTimes(1)
    expect(mockIpcMain.handle).toHaveBeenCalledWith('official:getStatus', expect.any(Function))
    expect([...mockIpcMain.handlers.keys()]).toEqual(['official:getStatus'])
  })

  it('returns a non-secret OSS status snapshot', () => {
    registerOfficialIpc(createNoopOfficialIntegration(), trustedRendererGuard)

    const status = mockIpcMain.handlers.get('official:getStatus')?.({})

    expect(status).toMatchObject({
      id: 'oss-noop',
      buildProfile: 'oss',
      available: false,
      reason: 'official-integration-not-installed',
      features: {
        account: false,
        deviceRegistry: false,
        messageNetwork: false,
        entitlement: false,
        quota: false,
        officialRuntime: false,
        releaseProvider: false,
      },
    })
    const serialized = JSON.stringify(status)
    const forbiddenFragments = [
      ['auth', 'Token'],
      ['im', 'User', 'Sig'],
      ['User', 'Sig'],
      ['token'],
      ['credential'],
      ['secret'],
      ['login'],
      ['logout'],
      ['message', 'Credential'],
    ]
    for (const parts of forbiddenFragments) {
      expect(serialized).not.toContain(parts.join(''))
    }
  })
})
