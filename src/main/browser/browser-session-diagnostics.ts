import type { Cookie, Session } from 'electron'
import type {
  BrowserCookieChangeDiagnosticEntry,
  BrowserCookieDiagnosticEntry,
  BrowserSessionDiagnosticSummary,
} from '../../shared/ipc/browser'
import { browserProfilePartition } from '../../shared/browser-profile'

const LIKELY_AUTH_COOKIE_RE =
  /(?:^|[_-])(auth|account|login|session(?:id)?|sid|sso|token|user|uid)(?:$|[_-])|^(?:a2|sessionid|z_c0|q_c1)$/i
const NON_AUTH_COOKIE_RE = /(captcha|challenge|csrf|xsrf|analytics|tracking|experiment)/i

export class BrowserSessionDiagnostics {
  private readonly observedCookieSessions = new WeakSet<Session>()
  private readonly cookieChanges: Array<
    BrowserCookieChangeDiagnosticEntry & { partition: string }
  > = []

  observe(browserSession: Session, profileId: string | null): void {
    if (this.observedCookieSessions.has(browserSession)) return
    this.observedCookieSessions.add(browserSession)
    const partition = browserProfilePartition(profileId)
    browserSession.cookies.on('changed', (_event, cookie, cause, removed) => {
      this.cookieChanges.push({
        ...this.cookieMetadata(cookie),
        partition,
        timestamp: Date.now(),
        cause,
        removed,
      })
      if (this.cookieChanges.length > 500) {
        this.cookieChanges.splice(0, this.cookieChanges.length - 300)
      }
    })
  }

  async describe(
    browserSession: Session,
    profileId: string | null,
    url: string | null,
  ): Promise<BrowserSessionDiagnosticSummary> {
    const partition = browserProfilePartition(profileId)
    let cookieStoreFlushed = false

    try {
      await browserSession.cookies.flushStore()
      cookieStoreFlushed = true
    } catch {
      // 诊断继续返回内存中的 Cookie 元数据。
    }

    try {
      const cookies = url ? await browserSession.cookies.get({ url }) : []
      const nowSeconds = Date.now() / 1000
      const metadata = cookies.map((cookie) => this.cookieMetadata(cookie))
      return {
        partition,
        persistent: true,
        cookieStoreFlushed,
        cookieCount: metadata.length,
        persistentCookieCount: metadata.filter((cookie) => !cookie.session).length,
        expiredCookieCount: metadata.filter(
          (cookie) => typeof cookie.expiresAt === 'number' && cookie.expiresAt / 1000 <= nowSeconds,
        ).length,
        likelyAuthCookies: metadata.filter((cookie) => cookie.likelyAuth),
        cookieNames: metadata.map((cookie) => cookie.name).sort(),
        recentCookieChanges: this.getRecentCookieChanges(partition, url),
      }
    } catch (error) {
      return {
        partition,
        persistent: true,
        cookieStoreFlushed,
        cookieCount: 0,
        persistentCookieCount: 0,
        expiredCookieCount: 0,
        likelyAuthCookies: [],
        cookieNames: [],
        recentCookieChanges: this.getRecentCookieChanges(partition, url),
        errorMessage: error instanceof Error ? error.message : String(error),
      }
    }
  }

  private cookieMetadata(cookie: Cookie): BrowserCookieDiagnosticEntry {
    return {
      name: cookie.name,
      domain: cookie.domain ?? '',
      path: cookie.path ?? '/',
      secure: Boolean(cookie.secure),
      httpOnly: Boolean(cookie.httpOnly),
      session: Boolean(cookie.session),
      ...(typeof cookie.expirationDate === 'number'
        ? { expiresAt: Math.round(cookie.expirationDate * 1000) }
        : {}),
      likelyAuth: !NON_AUTH_COOKIE_RE.test(cookie.name) && LIKELY_AUTH_COOKIE_RE.test(cookie.name),
    }
  }

  private getRecentCookieChanges(
    partition: string,
    visibleUrl: string | null,
  ): BrowserCookieChangeDiagnosticEntry[] {
    const host = safeHost(visibleUrl)
    return this.cookieChanges
      .filter((change) => change.partition === partition)
      .filter((change) => !host || cookieDomainMatchesHost(change.domain, host))
      .slice(-50)
      .map(({ partition: _partition, ...change }) => change)
  }
}

function safeHost(value: string | null): string {
  if (!value) return ''
  try {
    return new URL(value).hostname.toLowerCase()
  } catch {
    return ''
  }
}

function cookieDomainMatchesHost(domain: string, host: string): boolean {
  const normalizedDomain = domain.replace(/^\./, '').toLowerCase()
  return host === normalizedDomain || host.endsWith(`.${normalizedDomain}`)
}
