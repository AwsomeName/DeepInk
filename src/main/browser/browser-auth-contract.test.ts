import { describe, expect, it } from 'vitest'
import {
  isAllowedBrowserAuthCookie,
  isRetryableBrowserAuthFailure,
  isSupportedBrowserAuthRequest,
  resolveBrowserAuthReturnUrl,
  sanitizeBrowserAuthMainUrl,
} from './browser-auth-contract'

describe('browser auth contract', () => {
  it('only routes V2EX Google authentication through the clean process', () => {
    expect(
      isSupportedBrowserAuthRequest({
        tabId: 'v2ex-tab',
        profileId: 'v2ex',
        url: 'https://accounts.google.com/o/oauth2/v2/auth',
      }),
    ).toBe(true)
    expect(
      isSupportedBrowserAuthRequest({
        tabId: 'default-tab',
        profileId: 'default',
        url: 'https://accounts.google.com/o/oauth2/v2/auth',
      }),
    ).toBe(false)
  })

  it('only accepts cookies belonging to the target platform', () => {
    const baseCookie = {
      name: 'A2',
      value: 'secret',
      path: '/',
      secure: true,
      httpOnly: true,
      session: false,
      sameSite: 'unspecified' as const,
    }
    expect(isAllowedBrowserAuthCookie('v2ex', { ...baseCookie, domain: '.v2ex.com' })).toBe(true)
    expect(isAllowedBrowserAuthCookie('v2ex', { ...baseCookie, domain: '.google.com' })).toBe(false)
  })

  it('returns to a V2EX page and rejects an unrelated return URL', () => {
    expect(resolveBrowserAuthReturnUrl('v2ex', 'https://www.v2ex.com/mission/daily')).toBe(
      'https://www.v2ex.com/mission/daily',
    )
    expect(resolveBrowserAuthReturnUrl('v2ex', 'https://evil.example/')).toBe(
      'https://www.v2ex.com/',
    )
  })

  it('does not restore Google authentication pages inside the main V2EX tab', () => {
    expect(
      sanitizeBrowserAuthMainUrl(
        'v2ex',
        'https://accounts.google.com/v3/signin/rejected?app_domain=https://www.v2ex.com',
      ),
    ).toBe('https://www.v2ex.com/signup')
    expect(sanitizeBrowserAuthMainUrl('v2ex', 'https://www.v2ex.com/')).toBe(
      'https://www.v2ex.com/',
    )
  })

  it('retries a failed top-level V2EX Google callback without retrying unrelated failures', () => {
    const callback = 'https://www.v2ex.com/auth/google?code=redacted'
    expect(isRetryableBrowserAuthFailure('v2ex', callback, -100, true)).toBe(true)
    expect(isRetryableBrowserAuthFailure('v2ex', callback, -100, false)).toBe(false)
    expect(
      isRetryableBrowserAuthFailure(
        'v2ex',
        'https://accounts.google.com/o/oauth2/v2/auth',
        -100,
        true,
      ),
    ).toBe(true)
    expect(isRetryableBrowserAuthFailure('v2ex', 'https://www.v2ex.com/signup', -100, true)).toBe(
      false,
    )
  })
})
