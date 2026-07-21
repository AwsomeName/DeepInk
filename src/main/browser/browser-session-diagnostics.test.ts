import type { Cookie, Session } from 'electron'
import { describe, expect, it, vi } from 'vitest'
import { BrowserSessionDiagnostics } from './browser-session-diagnostics'

type CookieChangedListener = (
  event: unknown,
  cookie: Cookie,
  cause: 'explicit',
  removed: boolean,
) => void

function cookie(name: string, domain: string, value: string): Cookie {
  return {
    name,
    value,
    domain,
    path: '/',
    secure: true,
    httpOnly: true,
    session: false,
    expirationDate: Date.now() / 1000 + 3600,
    sameSite: 'lax',
  }
}

describe('BrowserSessionDiagnostics', () => {
  it('reports profile-scoped cookie metadata and never exposes cookie values', async () => {
    const changedListeners: CookieChangedListener[] = []
    const cookies = [
      cookie('A2', '.v2ex.com', 'secret-a2'),
      cookie('_csrf', '.v2ex.com', 'secret-csrf'),
    ]
    const on = vi.fn((_eventName: string, listener: CookieChangedListener) => {
      changedListeners.push(listener)
    })
    const browserSession = {
      cookies: {
        on,
        flushStore: vi.fn().mockResolvedValue(undefined),
        get: vi.fn().mockResolvedValue(cookies),
      },
    } as unknown as Session
    const diagnostics = new BrowserSessionDiagnostics()

    diagnostics.observe(browserSession, 'v2ex')
    diagnostics.observe(browserSession, 'v2ex')
    expect(on).toHaveBeenCalledTimes(1)
    expect(changedListeners).toHaveLength(1)
    changedListeners[0](undefined, cookie('A2', '.v2ex.com', 'changed-secret'), 'explicit', false)

    const summary = await diagnostics.describe(browserSession, 'v2ex', 'https://www.v2ex.com/')

    expect(summary).toMatchObject({
      partition: 'persist:cclink-studio-profile-v2ex',
      cookieStoreFlushed: true,
      cookieCount: 2,
      persistentCookieCount: 2,
      cookieNames: ['A2', '_csrf'],
    })
    expect(summary.likelyAuthCookies.map(({ name }) => name)).toEqual(['A2'])
    expect(summary.recentCookieChanges).toHaveLength(1)
    expect(JSON.stringify(summary)).not.toContain('secret')
  })
})
