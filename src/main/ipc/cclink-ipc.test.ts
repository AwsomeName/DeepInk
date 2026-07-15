import { describe, expect, it, vi } from 'vitest'
import type { ChatccIdentity } from '../../shared/chatcc'

const mockIpc = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
    mockIpc.handlers.set(channel, handler)
  }),
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: mockIpc.handle,
  },
}))

import { registerCclinkIpc } from './cclink-ipc'

const identity: ChatccIdentity = {
  accountUserId: 'account-1',
  imUserId: 'im-1',
  clientImUserId: 'client-1',
  imUserSig: 'sig-secret',
  authToken: 'auth-secret',
  sdkAppId: 12345,
  deviceId: 'device-1',
  deviceName: 'Mac',
  updatedAt: 1783526400000,
}

function snapshotOf(item: ChatccIdentity | null) {
  if (!item) return null
  return {
    accountUserId: item.accountUserId,
    imUserId: item.imUserId,
    clientImUserId: item.clientImUserId,
    sdkAppId: item.sdkAppId,
    deviceId: item.deviceId,
    deviceName: item.deviceName,
    updatedAt: item.updatedAt,
    ready: Boolean(item.clientImUserId && item.imUserSig && item.authToken && item.sdkAppId),
  }
}

describe('registerCclinkIpc', () => {
  it('returns renderer-safe identity snapshots from identity IPC handlers', async () => {
    mockIpc.handlers.clear()
    const identityService = {
      getIdentitySnapshot: vi.fn((item?: ChatccIdentity | null) => snapshotOf(item ?? identity)),
      ensureIdentity: vi.fn().mockResolvedValue(identity),
      importLegacyIdentity: vi.fn().mockResolvedValue(identity),
    }

    registerCclinkIpc({ getState: vi.fn() } as any, identityService as any)

    const getIdentity = mockIpc.handlers.get('cclink:getIdentity')
    const ensureIdentity = mockIpc.handlers.get('cclink:ensureIdentity')
    const importLegacyIdentity = mockIpc.handlers.get('cclink:importLegacyIdentity')

    expect(getIdentity).toBeDefined()
    expect(ensureIdentity).toBeDefined()
    expect(importLegacyIdentity).toBeDefined()

    const results = await Promise.all([
      getIdentity?.({}),
      ensureIdentity?.({}),
      importLegacyIdentity?.({}, '123456'),
    ])

    for (const result of results) {
      expect(result).toMatchObject({
        accountUserId: 'account-1',
        clientImUserId: 'client-1',
        ready: true,
      })
      expect(result).not.toHaveProperty('imUserSig')
      expect(result).not.toHaveProperty('authToken')
    }
  })
})
