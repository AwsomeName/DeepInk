export const PRIVATE_SERVICE_UNCONFIGURED_MESSAGE =
  'DeepInk 私有服务未配置。开源版不会内置产品服务地址；如需登录、订阅或云端账号能力，请设置 DEEPINK_API_URL。'

export const LEGACY_CCLINK_UNCONFIGURED_MESSAGE =
  '旧 CCLink 服务未配置。开源版不会内置旧服务地址；如需导入旧账号，请设置 CCLINK_LEGACY_API_URL。'

export class PrivateServiceConfigError extends Error {
  constructor(message = PRIVATE_SERVICE_UNCONFIGURED_MESSAGE) {
    super(message)
    this.name = 'PrivateServiceConfigError'
  }
}

export function normalizeServiceUrl(value?: string | null): string | null {
  const trimmed = value?.trim()
  if (!trimmed) return null
  return trimmed.replace(/\/+$/, '')
}

export function getDeepInkApiBaseUrl(): string | null {
  return normalizeServiceUrl(process.env['DEEPINK_API_URL'])
}

export function getLegacyCclinkApiUrl(): string | null {
  return normalizeServiceUrl(process.env['CCLINK_LEGACY_API_URL'])
}

export function requireDeepInkApiBaseUrl(baseUrl?: string | null): string {
  const configured = normalizeServiceUrl(baseUrl)
  if (!configured) {
    throw new PrivateServiceConfigError()
  }
  return configured
}

export function requireLegacyCclinkApiUrl(url?: string | null): string {
  const configured = normalizeServiceUrl(url)
  if (!configured) {
    throw new PrivateServiceConfigError(LEGACY_CCLINK_UNCONFIGURED_MESSAGE)
  }
  return configured
}
