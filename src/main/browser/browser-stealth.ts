import type { Session } from 'electron'

const configuredSessions = new WeakSet<Session>()

const ACCEPT_LANGUAGE = 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7'

/**
 * 页面提前注入脚本。重点收敛常见的 Electron / Playwright 自动化特征。
 * 不能保证绕过所有平台风控，但应避免我们主动暴露明显环境差异。
 */
export const BROWSER_STEALTH_INIT_SCRIPT = String.raw`
(() => {
  const defineGetter = (target, key, getter) => {
    try {
      Object.defineProperty(target, key, { get: getter, configurable: true })
    } catch {}
  }

  defineGetter(Navigator.prototype, 'webdriver', () => undefined)
  defineGetter(Navigator.prototype, 'languages', () => ['zh-CN', 'zh', 'en-US', 'en'])
  defineGetter(Navigator.prototype, 'platform', () => 'MacIntel')

  if (!window.chrome) {
    try {
      Object.defineProperty(window, 'chrome', {
        value: { runtime: {} },
        configurable: true,
      })
    } catch {}
  } else if (!window.chrome.runtime) {
    try {
      Object.defineProperty(window.chrome, 'runtime', {
        value: {},
        configurable: true,
      })
    } catch {}
  }

  const permissions = navigator.permissions
  if (permissions && permissions.query) {
    const originalQuery = permissions.query.bind(permissions)
    try {
      permissions.query = (parameters) => {
        if (parameters && parameters.name === 'notifications' && typeof Notification !== 'undefined') {
          return Promise.resolve({ state: Notification.permission, onchange: null })
        }
        return originalQuery(parameters)
      }
    } catch {}
  }

  if (navigator.userAgentData) {
    const brands = [
      { brand: 'Chromium', version: '134' },
      { brand: 'Google Chrome', version: '134' },
      { brand: 'Not=A?Brand', version: '24' },
    ]
    const userAgentData = {
      brands,
      mobile: false,
      platform: 'macOS',
      getHighEntropyValues: async (hints) => {
        const values = {
          brands,
          mobile: false,
          platform: 'macOS',
          architecture: 'arm',
          bitness: '64',
          model: '',
          platformVersion: '14.0.0',
          uaFullVersion: '134.0.0.0',
          fullVersionList: brands.map((brand) => ({ brand: brand.brand, version: brand.version + '.0.0.0' })),
        }
        return Object.fromEntries((hints || []).map((hint) => [hint, values[hint]]).filter(([, value]) => value !== undefined))
      },
      toJSON: () => ({ brands, mobile: false, platform: 'macOS' }),
    }
    defineGetter(Navigator.prototype, 'userAgentData', () => userAgentData)
  }
})()
`

export function normalizeDesktopUserAgent(userAgent: string): string {
  return userAgent
    .replace(/\s+(Electron|cclink-studio|cclinkstudio)\/[\d.]+/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

/**
 * 清理请求头中与 Electron/UA Client Hints 相关的高风险特征。
 * Electron 的 setUserAgent 不一定同步改写所有 Sec-CH-UA 头，因此这里统一收口。
 */
export function installBrowserCompatibilityHeaders(session: Session): void {
  if (configuredSessions.has(session)) return
  configuredSessions.add(session)

  session.webRequest.onBeforeSendHeaders((details, callback) => {
    const headers = { ...details.requestHeaders }

    for (const key of Object.keys(headers)) {
      const lower = key.toLowerCase()
      if (lower === 'user-agent' && typeof headers[key] === 'string') {
        headers[key] = normalizeDesktopUserAgent(headers[key])
      }
      if (lower.startsWith('sec-ch-ua')) {
        delete headers[key]
      }
    }

    if (!Object.keys(headers).some((key) => key.toLowerCase() === 'accept-language')) {
      headers['Accept-Language'] = ACCEPT_LANGUAGE
    }

    callback({ requestHeaders: headers })
  })
}
