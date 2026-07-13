import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthService } from './auth-service'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('AuthService', () => {
  it('does not call a private endpoint when DEEPINK_API_URL is not configured', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const service = new AuthService('')
    const result = await service.sendSmsCode('15063036754')

    expect(result.success).toBe(false)
    expect(result.error).toContain('DEEPINK_API_URL')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('unwraps /auth/me user payload before mapping profile', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        user: {
          id: 'user-1',
          nickname: 'User',
          avatarUrl: '',
          phone: '15063036754',
          loginMethod: 'phone',
          subscriptionTier: 'free',
          subscriptionExpiresAt: null,
        },
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const service = new AuthService('https://example.test')
    const profile = await service.getMe('access-token')

    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.test/auth/me',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
        }),
      }),
    )
    expect(profile).toMatchObject({
      id: 'user-1',
      phone: '15063036754',
      loginMethod: 'phone',
    })
  })

  it('does not invent a phone for a wechat-only profile', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        user: {
          id: 'wechat-user',
          nickname: 'Wechat User',
          loginMethod: 'wechat',
        },
      }),
    }))

    const service = new AuthService('https://example.test')
    const profile = await service.getMe('access-token')

    expect(profile).toMatchObject({
      id: 'wechat-user',
      phone: null,
      loginMethod: 'wechat',
    })
  })
})
