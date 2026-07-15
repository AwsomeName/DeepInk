import { mkdtemp, rm } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TokenManager } from '../auth/token-manager'

const mockPaths = vi.hoisted(() => ({ userDataDir: '' }))

vi.mock('electron', () => ({
  app: {
    getPath: () => mockPaths.userDataDir,
  },
}))

import { CclinkIdentityService } from './cclink-identity-service'

class MemoryIdentityStore {
  identity: unknown = null

  get(): any {
    return this.identity
  }

  async save(identity: unknown): Promise<void> {
    this.identity = identity
  }

  async clear(): Promise<void> {
    this.identity = null
  }
}

let tempDir = ''

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'deepink-cclink-identity-'))
  mockPaths.userDataDir = tempDir
})

afterEach(async () => {
  vi.unstubAllGlobals()
  if (tempDir) await rm(tempDir, { recursive: true, force: true })
})

describe('CclinkIdentityService', () => {
  it('preflights legacy import with cloud user as the authority', async () => {
    const store = new MemoryIdentityStore()
    const tokenManager = {
      getValidAccessToken: vi.fn().mockResolvedValue('access-token'),
      saveUserProfile: vi.fn(),
      getUserProfile: vi.fn().mockReturnValue({
        id: 'cached-user',
        nickname: 'Cached',
        avatarUrl: '',
        phone: '15000006754',
        loginMethod: 'phone',
        lastLoginAt: Date.now(),
      }),
    } as unknown as TokenManager
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          version: '2026.07.10-test',
          capabilities: {
            cclinkLegacyBind: true,
            cclinkPairedAgents: true,
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          user: {
            id: 'cached-user',
            phone: '15000006754',
            loginMethod: 'phone',
          },
        }),
      })
    vi.stubGlobal('fetch', fetchMock)

    const service = new CclinkIdentityService(store as any, () => tokenManager, {
      baseUrl: 'https://example.test',
    })

    const preflight = await service.preflightLegacyImport()

    expect(preflight.ok).toBe(true)
    expect(preflight.code).toBe('READY')
    expect(preflight.cloudUser?.phone).toBe('15000006754')
    expect(preflight.checks.cacheMatchesCloud).toBe(true)
    expect(tokenManager.saveUserProfile).toHaveBeenCalledWith(expect.objectContaining({
      id: 'cached-user',
      phone: '15000006754',
    }))
    expect(fetchMock).toHaveBeenNthCalledWith(1, 'https://example.test/auth/version', { method: 'GET' })
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://example.test/auth/me',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
        }),
      }),
    )
  })

  it('blocks preflight when cached phone exists but cloud token user has no phone', async () => {
    const store = new MemoryIdentityStore()
    const tokenManager = {
      getValidAccessToken: vi.fn().mockResolvedValue('access-token'),
      saveUserProfile: vi.fn(),
      getUserProfile: vi.fn().mockReturnValue({
        id: 'cached-phone-user',
        nickname: 'Cached',
        avatarUrl: '',
        phone: '15000006754',
        loginMethod: 'phone',
        lastLoginAt: Date.now(),
      }),
    } as unknown as TokenManager
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          version: '2026.07.10-test',
          capabilities: {
            cclinkLegacyBind: true,
            cclinkPairedAgents: true,
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          user: {
            id: 'wechat-user',
            phone: null,
            loginMethod: 'wechat',
          },
        }),
      })
    vi.stubGlobal('fetch', fetchMock)

    const service = new CclinkIdentityService(store as any, () => tokenManager, {
      baseUrl: 'https://example.test',
    })

    const preflight = await service.preflightLegacyImport()

    expect(preflight.ok).toBe(false)
    expect(preflight.code).toBe('DEEPINK_PHONE_REQUIRED')
    expect(preflight.cachedUser?.phone).toBe('15000006754')
    expect(preflight.cloudUser).toMatchObject({
      id: 'wechat-user',
      phone: null,
      loginMethod: 'wechat',
    })
    expect(preflight.checks.cloudUserHasPhone).toBe(false)
    expect(preflight.checks.cacheMatchesCloud).toBe(false)
  })

  it('refreshes an expired DeepInk access token before syncing identity', async () => {
    const store = new MemoryIdentityStore()
    const tokenManager = {
      getValidAccessToken: vi.fn().mockResolvedValue(null),
      saveUserProfile: vi.fn(),
      getUserProfile: vi.fn().mockReturnValue({
        id: 'user-1',
        nickname: 'User',
        avatarUrl: '',
        phone: '15000006754',
        loginMethod: 'phone',
        lastLoginAt: Date.now(),
      }),
    } as unknown as TokenManager
    const refreshAccessToken = vi.fn().mockResolvedValue('fresh-access-token')
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          user: {
            id: 'user-1',
            phone: '15000006754',
            loginMethod: 'phone',
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          identity: {
            account_user_id: 'account-1',
            im_user_id: 'im-1',
            client_im_user_id: 'client-1',
            im_user_sig: 'sig-1',
            auth_token: 'auth-1',
            sdk_app_id: 12345,
          },
        }),
      })
    vi.stubGlobal('fetch', fetchMock)

    const service = new CclinkIdentityService(store as any, () => tokenManager, {
      baseUrl: 'https://example.test',
      refreshAccessToken,
    })

    const identity = await service.ensureIdentity()

    expect(refreshAccessToken).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://example.test/auth/me',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer fresh-access-token',
        }),
      }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://example.test/auth/cclink/identity',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer fresh-access-token',
        }),
      }),
    )
    expect(identity.accountUserId).toBe('account-1')
    expect(store.identity).toMatchObject({ authToken: 'auth-1' })
  })

  it('builds a renderer-safe identity snapshot without secrets', async () => {
    const store = new MemoryIdentityStore()
    store.identity = {
      accountUserId: 'account-1',
      imUserId: 'im-1',
      clientImUserId: 'client-1',
      imUserSig: 'sig-secret',
      authToken: 'auth-secret',
      sdkAppId: 12345,
      deviceId: 'device-1',
      deviceName: 'Mac',
      expiresAt: '2026-08-01T00:00:00.000Z',
      updatedAt: 1783526400000,
    }
    const tokenManager = {
      getValidAccessToken: vi.fn().mockResolvedValue('access-token'),
      saveUserProfile: vi.fn(),
      getUserProfile: vi.fn().mockReturnValue(null),
    } as unknown as TokenManager

    const service = new CclinkIdentityService(store as any, () => tokenManager, {
      baseUrl: 'https://example.test',
    })

    const snapshot = service.getIdentitySnapshot()

    expect(snapshot).toEqual({
      accountUserId: 'account-1',
      imUserId: 'im-1',
      clientImUserId: 'client-1',
      sdkAppId: 12345,
      deviceId: 'device-1',
      deviceName: 'Mac',
      expiresAt: '2026-08-01T00:00:00.000Z',
      updatedAt: 1783526400000,
      ready: true,
    })
    expect(snapshot).not.toHaveProperty('imUserSig')
    expect(snapshot).not.toHaveProperty('authToken')
  })

  it('lists paired agents from cloud and maps them to servers', async () => {
    const store = new MemoryIdentityStore()
    const tokenManager = {
      getValidAccessToken: vi.fn().mockResolvedValue('access-token'),
      saveUserProfile: vi.fn(),
      getUserProfile: vi.fn().mockReturnValue({
        id: 'user-1',
        nickname: 'User',
        avatarUrl: '',
        phone: '15000006754',
        loginMethod: 'phone',
        lastLoginAt: Date.now(),
      }),
    } as unknown as TokenManager
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        agents: [{
          agent_id: 'agent_1',
          name: 'Mac mini',
          hostname: 'mac-mini',
          os: 'Darwin',
          status: 'online',
          last_seen: '2026-07-09T00:00:00.000Z',
        }],
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const service = new CclinkIdentityService(store as any, () => tokenManager, {
      baseUrl: 'https://example.test',
    })

    const servers = await service.listPairedAgents()

    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.test/auth/cclink/paired-agents',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
        }),
      }),
    )
    expect(servers[0]).toMatchObject({
      id: 'agent_1',
      name: 'Mac mini',
      hostname: 'mac-mini',
      status: 'online',
      workspaces: [],
    })
  })

  it('falls back to legacy chatcc endpoint when bridge has no paired agents', async () => {
    const store = new MemoryIdentityStore()
    store.identity = {
      accountUserId: 'ccu_legacy',
      imUserId: 'ccu_legacy',
      clientImUserId: 'ccu_legacy_dev_1',
      imUserSig: 'sig-1',
      authToken: 'auth-1',
      sdkAppId: 1600142242,
      deviceId: 'device-1',
      deviceName: 'Mac',
      updatedAt: Date.now(),
    }
    const tokenManager = {
      getValidAccessToken: vi.fn().mockResolvedValue('access-token'),
      saveUserProfile: vi.fn(),
      getUserProfile: vi.fn().mockReturnValue({
        id: 'user-1',
        nickname: 'User',
        avatarUrl: '',
        phone: '15000006754',
        loginMethod: 'phone',
        lastLoginAt: Date.now(),
      }),
    } as unknown as TokenManager
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ agents: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          code: 'OK',
          data: {
            agents: [{
              agent_id: 'agent_legacy',
              name: 'Old Mac',
              hostname: 'old-mac',
              os: 'Darwin',
              status: 'online',
              last_seen: 1783526400000,
            }],
          },
        }),
      })
    vi.stubGlobal('fetch', fetchMock)

    const service = new CclinkIdentityService(store as any, () => tokenManager, {
      baseUrl: 'https://example.test',
      legacyChatccUrl: 'https://chatcc.test/index',
    })

    const servers = await service.listPairedAgents()

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://chatcc.test/index',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          type: 'getPairedAgents',
          user_id: 'ccu_legacy',
          auth_token: 'auth-1',
          client_im_user_id: 'ccu_legacy_dev_1',
        }),
      }),
    )
    expect(servers[0]).toMatchObject({
      id: 'agent_legacy',
      name: 'Old Mac',
      status: 'online',
    })
  })

  it('imports legacy chatcc identity with sms code', async () => {
    const store = new MemoryIdentityStore()
    const tokenManager = {
      getValidAccessToken: vi.fn().mockResolvedValue('access-token'),
      saveUserProfile: vi.fn(),
      getUserProfile: vi.fn().mockReturnValue({
        id: 'user-1',
        nickname: 'User',
        avatarUrl: '',
        phone: '15000006754',
        loginMethod: 'phone',
        lastLoginAt: Date.now(),
      }),
    } as unknown as TokenManager
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          user: {
            id: 'user-1',
            phone: '15000006754',
            loginMethod: 'phone',
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          code: 'OK',
          data: {
            account_user_id: 'ccu_old',
            im_user_id: 'ccu_old',
            client_im_user_id: 'ccu_old_dev_1',
            im_user_sig: 'sig-old',
            auth_token: 'auth-old',
            sdk_app_id: 1600142242,
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          identity: {
            account_user_id: 'ccu_old',
            im_user_id: 'ccu_old',
            client_im_user_id: 'ccu_old_dev_1',
            im_user_sig: 'sig-bound',
            auth_token: 'auth-bound',
            sdk_app_id: 1600142242,
          },
        }),
      })
    vi.stubGlobal('fetch', fetchMock)

    const service = new CclinkIdentityService(store as any, () => tokenManager, {
      baseUrl: 'https://example.test',
      legacyChatccUrl: 'https://chatcc.test/index',
    })

    const identity = await service.importLegacyIdentity('123456')

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://chatcc.test/index',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"type":"genUserSig"'),
      }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'https://example.test/auth/cclink/legacy-bind',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
        }),
        body: expect.stringContaining('"account_user_id":"ccu_old"'),
      }),
    )
    const bindRequest = fetchMock.mock.calls[2]?.[1] as { body?: string }
    expect(JSON.parse(bindRequest.body ?? '{}')).toMatchObject({
      account_user_id: 'ccu_old',
      phone: '15000006754',
    })
    expect(identity.accountUserId).toBe('ccu_old')
    expect(store.identity).toMatchObject({
      accountUserId: 'ccu_old',
      authToken: 'auth-bound',
    })
  })

  it('stops legacy import when the current DeepInk token has no cloud phone', async () => {
    const store = new MemoryIdentityStore()
    const tokenManager = {
      getValidAccessToken: vi.fn().mockResolvedValue('access-token'),
      saveUserProfile: vi.fn(),
      getUserProfile: vi.fn().mockReturnValue({
        id: 'cached-phone-user',
        nickname: 'Cached',
        avatarUrl: '',
        phone: '15000006754',
        loginMethod: 'phone',
        lastLoginAt: Date.now(),
      }),
    } as unknown as TokenManager
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        user: {
          id: 'wechat-user',
          phone: null,
          loginMethod: 'wechat',
        },
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const service = new CclinkIdentityService(store as any, () => tokenManager, {
      baseUrl: 'https://example.test',
      legacyChatccUrl: 'https://chatcc.test/index',
    })

    await expect(service.importLegacyIdentity('123456')).rejects.toThrow('当前 DeepInk 云端账号没有绑定手机号')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith('https://example.test/auth/me', expect.any(Object))
  })
})
