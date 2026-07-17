import type { Cookie } from 'electron'

export const BROWSER_AUTH_CHILD_ARGUMENT = '--cclink-browser-auth='
export const V2EX_SIGNUP_URL = 'https://www.v2ex.com/signup'

export interface BrowserAuthRequest {
  tabId: string
  profileId: string
  url: string
}

export interface BrowserAuthChildOptions extends BrowserAuthRequest {
  userDataPath: string
}

export interface BrowserAuthCookie {
  name: string
  value: string
  domain: string
  path: string
  secure: boolean
  httpOnly: boolean
  session: boolean
  sameSite: Cookie['sameSite']
  expirationDate?: number
}

export interface BrowserAuthCompleteMessage {
  type: 'browser-auth-complete'
  tabId: string
  profileId: string
  returnUrl: string
  cookies: BrowserAuthCookie[]
}

export interface BrowserAuthCancelledMessage {
  type: 'browser-auth-cancelled'
  tabId: string
  profileId: string
}

export type BrowserAuthChildMessage = BrowserAuthCompleteMessage | BrowserAuthCancelledMessage

export interface BrowserAuthAcknowledgement {
  type: 'browser-auth-ack'
}

export function encodeBrowserAuthChildOptions(options: BrowserAuthChildOptions): string {
  return Buffer.from(JSON.stringify(options), 'utf8').toString('base64url')
}

export function parseBrowserAuthChildOptions(argv: string[]): BrowserAuthChildOptions | null {
  const argument = argv.find((value) => value.startsWith(BROWSER_AUTH_CHILD_ARGUMENT))
  if (!argument) return null

  try {
    const encoded = argument.slice(BROWSER_AUTH_CHILD_ARGUMENT.length)
    const value = JSON.parse(
      Buffer.from(encoded, 'base64url').toString('utf8'),
    ) as Partial<BrowserAuthChildOptions>
    if (
      typeof value.tabId !== 'string' ||
      typeof value.profileId !== 'string' ||
      typeof value.url !== 'string' ||
      typeof value.userDataPath !== 'string'
    ) {
      return null
    }
    return value as BrowserAuthChildOptions
  } catch {
    return null
  }
}

export function isSupportedBrowserAuthRequest(request: BrowserAuthRequest): boolean {
  if (request.profileId !== 'v2ex') return false
  try {
    return new URL(request.url).hostname === 'accounts.google.com'
  } catch {
    return false
  }
}

export function isAllowedBrowserAuthCookie(profileId: string, cookie: BrowserAuthCookie): boolean {
  if (profileId !== 'v2ex') return false
  const domain = cookie.domain.replace(/^\./, '').toLowerCase()
  return domain === 'v2ex.com' || domain.endsWith('.v2ex.com')
}

export function resolveBrowserAuthReturnUrl(profileId: string, value: string): string {
  const fallback = profileId === 'v2ex' ? 'https://www.v2ex.com/' : 'about:blank'
  try {
    const url = new URL(value)
    if (
      profileId === 'v2ex' &&
      (url.hostname === 'v2ex.com' || url.hostname.endsWith('.v2ex.com'))
    ) {
      return url.toString()
    }
  } catch {
    // Fall through to the platform home page.
  }
  return fallback
}

export function sanitizeBrowserAuthMainUrl(profileId: string | null, value: string): string {
  if (profileId !== 'v2ex') return value
  try {
    return new URL(value).hostname === 'accounts.google.com' ? V2EX_SIGNUP_URL : value
  } catch {
    return value
  }
}

const RETRYABLE_NETWORK_ERRORS = new Set([-100, -101, -102, -105, -106, -118, -130])

export function isRetryableBrowserAuthFailure(
  profileId: string,
  value: string,
  errorCode: number,
  isMainFrame: boolean,
): boolean {
  if (profileId !== 'v2ex' || !isMainFrame || !RETRYABLE_NETWORK_ERRORS.has(errorCode)) {
    return false
  }
  try {
    const url = new URL(value)
    if (url.hostname === 'accounts.google.com') return true
    return isV2exHost(url.hostname) && url.pathname === '/auth/google'
  } catch {
    return false
  }
}

function isV2exHost(hostname: string): boolean {
  return hostname === 'v2ex.com' || hostname.endsWith('.v2ex.com')
}
