import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { hostname, platform, release } from 'os'
import { join } from 'path'
import { randomUUID } from 'crypto'
import type { ChatccIdentity, ChatccServer } from '../../shared/chatcc'
import type {
  CclinkAccountSnapshot,
  CclinkIdentitySnapshot,
  CclinkLegacyImportPreflight,
} from '../../shared/ipc/cclink'
import type { TokenManager, UserProfile } from '../auth/token-manager'
import {
  getDeepInkApiBaseUrl,
  getLegacyCclinkApiUrl,
  normalizeServiceUrl,
  requireDeepInkApiBaseUrl,
  requireLegacyCclinkApiUrl,
} from '../config/private-service-config'
import { CclinkIdentityStore } from './cclink-identity-store'

interface BridgeResponse {
  identity?: Partial<ChatccIdentity> & Record<string, unknown>
  account_user_id?: string
  im_user_id?: string
  client_im_user_id?: string
  im_user_sig?: string
  auth_token?: string
  sdk_app_id?: number
  expires_at?: string | null
}

interface PairedAgentResponse {
  agent_id?: string
  name?: string
  hostname?: string
  os?: string
  status?: string
  last_seen?: string | number | Date | null
}

interface PairedAgentsResponse {
  agents?: PairedAgentResponse[]
  code?: string
  message?: string
  data?: {
    agents?: PairedAgentResponse[]
  }
}

interface LegacyCclinkResponse {
  code?: string
  message?: string
  data?: BridgeResponse & Record<string, unknown>
}

interface DeepInkMeResponse {
  user?: Record<string, unknown>
  id?: string
  userId?: string
  user_id?: string
  _id?: string
  nickname?: string
  name?: string
  avatarUrl?: string
  avatar_url?: string
  phone?: string | null
  mobile?: string | null
  phoneNumber?: string | null
  phone_number?: string | null
  loginMethod?: string
  login_method?: string
  subscriptionTier?: string
  subscription_tier?: string
  subscriptionExpiresAt?: string | null
  subscription_expires_at?: string | null
}

interface AuthVersionResponse {
  success?: boolean
  service?: string
  version?: string
  buildTime?: string
  capabilities?: Record<string, boolean>
  env?: Record<string, unknown>
  error?: string
}

interface CloudAccountResult {
  user: UserProfile
  phone: string | null
}

const DEFAULT_BASE_URL = getDeepInkApiBaseUrl()
const DEFAULT_LEGACY_CHATCC_URL = getLegacyCclinkApiUrl()

interface CclinkIdentityServiceOptions {
  baseUrl?: string
  legacyChatccUrl?: string
  refreshAccessToken?: () => Promise<string | null>
}

export class CclinkIdentityService {
  private readonly store: CclinkIdentityStore
  private readonly getTokenManager: () => TokenManager | null
  private readonly baseUrl: string | null
  private readonly legacyChatccUrl: string | null
  private readonly deviceFilePath: string
  private readonly refreshAccessToken?: () => Promise<string | null>

  constructor(
    store: CclinkIdentityStore,
    getTokenManager: () => TokenManager | null,
    options: CclinkIdentityServiceOptions = {},
  ) {
    this.store = store
    this.getTokenManager = getTokenManager
    this.baseUrl = normalizeServiceUrl(options.baseUrl) ?? DEFAULT_BASE_URL
    this.legacyChatccUrl = normalizeServiceUrl(options.legacyChatccUrl) ?? DEFAULT_LEGACY_CHATCC_URL
    this.refreshAccessToken = options.refreshAccessToken
    this.deviceFilePath = join(app.getPath('userData'), 'cclink-device.json')
  }

  getCachedIdentity(): ChatccIdentity | null {
    return this.store.get()
  }

  async preflightLegacyImport(): Promise<CclinkLegacyImportPreflight> {
    const tokenManager = this.getTokenManager()
    const cachedUser = this.snapshotUser(tokenManager?.getUserProfile() ?? null)
    const localIdentity = this.snapshotIdentity(this.getCachedIdentity())
    const versionResult = await this.getAuthVersion()
    const baseChecks = {
      authVersionOk: Boolean(versionResult.ok),
      hasAccessToken: false,
      cloudUserOk: false,
      cloudUserHasPhone: false,
      cacheMatchesCloud: false,
      hasLocalIdentity: Boolean(localIdentity),
    }

    if (!versionResult.ok) {
      return {
        ok: false,
        code: 'AUTH_SERVICE_UNAVAILABLE',
        message: versionResult.message,
        nextAction: 'waitForCloudDeploy',
        cloudVersion: versionResult.version,
        cachedUser,
        cloudUser: null,
        localIdentity,
        checks: baseChecks,
      }
    }

    if (!tokenManager) {
      return {
        ok: false,
        code: 'NOT_LOGGED_IN',
        message: '认证系统尚未初始化，请重启 DeepInk 后重试。',
        nextAction: 'retry',
        cloudVersion: versionResult.version,
        cachedUser,
        cloudUser: null,
        localIdentity,
        checks: baseChecks,
      }
    }

    let accessToken: string
    try {
      accessToken = await this.getAccessTokenOrThrow()
    } catch {
      return {
        ok: false,
        code: 'NOT_LOGGED_IN',
        message: 'DeepInk 登录态已过期或刷新失败，请重新登录。',
        nextAction: 'loginWithPhone',
        cloudVersion: versionResult.version,
        cachedUser,
        cloudUser: null,
        localIdentity,
        checks: baseChecks,
      }
    }

    const checksWithToken = { ...baseChecks, hasAccessToken: true }
    let cloudAccount: CloudAccountResult
    try {
      cloudAccount = await this.getDeepInkCloudAccount(accessToken)
    } catch (error) {
      return {
        ok: false,
        code: 'CLOUD_USER_UNAVAILABLE',
        message: error instanceof Error ? error.message : '无法确认当前 DeepInk 云端账号。',
        nextAction: 'retry',
        cloudVersion: versionResult.version,
        cachedUser,
        cloudUser: null,
        localIdentity,
        checks: checksWithToken,
      }
    }

    tokenManager.saveUserProfile(cloudAccount.user)
    const cloudUser = this.snapshotUser(cloudAccount.user)
    const cacheMatchesCloud = Boolean(cachedUser && cloudUser && cachedUser.id === cloudUser.id && cachedUser.phone === cloudUser.phone)
    const checks = {
      ...checksWithToken,
      cloudUserOk: true,
      cloudUserHasPhone: Boolean(cloudAccount.phone),
      cacheMatchesCloud,
    }

    if (!cloudAccount.phone) {
      return {
        ok: false,
        code: 'DEEPINK_PHONE_REQUIRED',
        message: '当前 token 对应的 DeepInk 云端账号没有手机号；请退出后用旧 CCLink 手机号登录 DeepInk。',
        nextAction: 'loginWithPhone',
        cloudVersion: versionResult.version,
        cachedUser,
        cloudUser,
        localIdentity,
        checks,
      }
    }

    return {
      ok: true,
      code: 'READY',
      message: localIdentity
        ? '预检通过：当前 token 对应手机号账号；已有本地 CCLink identity，发送旧验证码前会先移除本地 identity。'
        : '预检通过：当前 token 对应手机号账号，可以发送旧 CCLink 验证码。',
      nextAction: 'sendLegacySmsCode',
      cloudVersion: versionResult.version,
      cachedUser,
      cloudUser,
      localIdentity,
      checks,
    }
  }

  async ensureIdentity(): Promise<ChatccIdentity> {
    const account = await this.getVerifiedDeepInkAccount()

    const device = this.getOrCreateDevice()
    const baseUrl = this.requireBaseUrl()
    const res = await fetch(`${baseUrl}/auth/cclink/identity`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${account.accessToken}`,
      },
      body: JSON.stringify({
        phone: account.phone,
        device_id: device.id,
        device_name: device.name,
        platform: 'desktop',
        os: `${platform()} ${release()}`,
      }),
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({})) as { message?: string; error?: string; code?: string }
      if (res.status === 404 && (data.message === 'Not Found' || data.error === 'Not Found')) {
        throw new Error('线上 auth 云函数未更新：private-serv 已包含 /auth/cclink/identity，请在根目录运行 npm run private:cloud:build-auth 后上传 private-serv/cloud/auth-function.zip，或使用 TCB_ENV_ID=你的环境 npm run private:cloud:deploy-auth')
      }
      const suffix = data.code ? ` (${data.code})` : ''
      throw new Error(`${data.message || data.error || `HTTP ${res.status}`}${suffix}`)
    }

    const data = await res.json() as BridgeResponse
    const identity = this.normalizeIdentity(data, device)
    await this.store.save(identity)
    return identity
  }

  async clearIdentity(): Promise<void> {
    await this.store.clear()
  }

  async sendLegacySmsCode(): Promise<void> {
    const account = await this.getVerifiedDeepInkAccount()
    const legacyChatccUrl = this.requireLegacyChatccUrl()
    const res = await fetch(legacyChatccUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'sendSmsCode',
        phone: account.phone,
      }),
    })
    const data = await res.json().catch(() => ({})) as LegacyCclinkResponse
    if (!res.ok) {
      throw new Error(`旧 CCLink 发送验证码失败：HTTP ${res.status}`)
    }
    if (data.code !== 'OK') {
      throw new Error(`旧 CCLink 发送验证码失败：${data.message || data.code || 'UNKNOWN'}`)
    }
  }

  async importLegacyIdentity(smsCode: string): Promise<ChatccIdentity> {
    const code = smsCode.trim()
    if (!/^\d{4,8}$/.test(code)) {
      throw new Error('请输入旧 CCLink 短信验证码')
    }

    const account = await this.getVerifiedDeepInkAccount()
    const device = this.getOrCreateDevice()
    const legacyChatccUrl = this.requireLegacyChatccUrl()
    const res = await fetch(legacyChatccUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'genUserSig',
        phone: account.phone,
        sms_code: code,
        device_id: device.id,
        device_name: device.name,
        platform: 'desktop',
        os: `${platform()} ${release()}`,
      }),
    })
    const data = await res.json().catch(() => ({})) as LegacyCclinkResponse
    if (!res.ok) {
      throw new Error(`旧 CCLink 导入失败：HTTP ${res.status}`)
    }
    if (data.code !== 'OK' || !data.data) {
      throw new Error(`旧 CCLink 导入失败：${data.message || data.code || 'UNKNOWN'}`)
    }

    const legacyIdentity = this.normalizeIdentity(data.data, device)
    const boundIdentity = await this.bindLegacyIdentity(legacyIdentity, account.phone, account.accessToken)
    await this.store.save(boundIdentity)
    return boundIdentity
  }

  async listPairedAgents(): Promise<ChatccServer[]> {
    const accessToken = await this.getAccessTokenOrThrow()
    const identity = this.getCachedIdentity()
    const baseUrl = this.requireBaseUrl()
    const res = await fetch(`${baseUrl}/auth/cclink/paired-agents`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({})) as { message?: string; error?: string; code?: string }
      if (res.status === 404 && (data.message === 'Not Found' || data.error === 'Not Found')) {
        return identity ? this.listLegacyPairedAgents(identity) : []
      }
      const suffix = data.code ? ` (${data.code})` : ''
      throw new Error(`${data.message || data.error || `HTTP ${res.status}`}${suffix}`)
    }

    const data = await res.json() as PairedAgentsResponse
    const bridgeServers = this.normalizePairedAgentsResponse(data)
    if (bridgeServers.length > 0 || !identity) return bridgeServers
    return this.listLegacyPairedAgents(identity)
  }

  private async listLegacyPairedAgents(identity: ChatccIdentity): Promise<ChatccServer[]> {
    const legacyChatccUrl = this.requireLegacyChatccUrl()
    const res = await fetch(legacyChatccUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'getPairedAgents',
        user_id: identity.accountUserId,
        auth_token: identity.authToken,
        client_im_user_id: identity.clientImUserId,
      }),
    })

    const data = await res.json().catch(() => ({})) as PairedAgentsResponse
    if (!res.ok) {
      throw new Error(`旧 CCLink 云函数同步服务器失败：HTTP ${res.status}`)
    }
    if (data.code && data.code !== 'OK') {
      throw new Error(`旧 CCLink 云函数同步服务器失败：${data.message || data.code} (${data.code})`)
    }
    return this.normalizePairedAgentsResponse(data)
  }

  private normalizePairedAgentsResponse(data: PairedAgentsResponse): ChatccServer[] {
    return (data.agents ?? data.data?.agents ?? [])
      .map((agent) => this.normalizePairedAgent(agent))
      .filter((server): server is ChatccServer => Boolean(server))
  }

  private async getAccessTokenOrThrow(): Promise<string> {
    const tokenManager = this.getTokenManager()
    if (!tokenManager) {
      throw new Error('认证系统尚未初始化')
    }
    let accessToken = await tokenManager.getValidAccessToken()
    if (!accessToken) {
      accessToken = await this.refreshAccessToken?.() ?? null
    }
    if (!accessToken) {
      throw new Error('DeepInk 登录态已过期或刷新失败，请重新登录')
    }
    return accessToken
  }

  private async bindLegacyIdentity(identity: ChatccIdentity, phone: string, verifiedAccessToken?: string): Promise<ChatccIdentity> {
    const accessToken = verifiedAccessToken ?? await this.getAccessTokenOrThrow()
    const baseUrl = this.requireBaseUrl()
    const res = await fetch(`${baseUrl}/auth/cclink/legacy-bind`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        account_user_id: identity.accountUserId,
        im_user_id: identity.imUserId,
        client_im_user_id: identity.clientImUserId,
        im_user_sig: identity.imUserSig,
        auth_token: identity.authToken,
        sdk_app_id: identity.sdkAppId,
        device_id: identity.deviceId,
        device_name: identity.deviceName,
        phone,
      }),
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({})) as { message?: string; error?: string; code?: string }
      if (res.status === 404 && (data.message === 'Not Found' || data.error === 'Not Found')) {
        throw new Error('线上 auth 云函数未更新：private-serv 已包含 /auth/cclink/legacy-bind，请在根目录运行 npm run private:cloud:build-auth 后上传 private-serv/cloud/auth-function.zip，或使用 TCB_ENV_ID=你的环境 npm run private:cloud:deploy-auth')
      }
      const suffix = data.code ? ` (${data.code})` : ''
      throw new Error(`${data.message || data.error || `HTTP ${res.status}`}${suffix}`)
    }

    const data = await res.json() as BridgeResponse
    return this.normalizeIdentity(data, {
      id: identity.deviceId,
      name: identity.deviceName,
    })
  }

  private async getVerifiedDeepInkAccount(): Promise<{ accessToken: string; phone: string }> {
    const tokenManager = this.getTokenManager()
    if (!tokenManager) {
      throw new Error('认证系统尚未初始化')
    }

    const accessToken = await this.getAccessTokenOrThrow()
    const cloudAccount = await this.getDeepInkCloudAccount(accessToken)
    if (!cloudAccount.phone) {
      throw new Error('当前 DeepInk 云端账号没有绑定手机号，请退出后用旧 CCLink 手机号登录 DeepInk 再导入')
    }

    tokenManager.saveUserProfile(cloudAccount.user)
    return { accessToken, phone: cloudAccount.phone }
  }

  private async getDeepInkCloudAccount(accessToken: string): Promise<CloudAccountResult> {
    const baseUrl = this.requireBaseUrl()
    const res = await fetch(`${baseUrl}/auth/me`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })

    if (!res.ok) {
      throw new Error(res.status === 401
        ? 'DeepInk 登录态已失效，请退出后重新用旧 CCLink 手机号登录'
        : `无法确认当前 DeepInk 云端账号：HTTP ${res.status}`)
    }

    const data = await res.json().catch(() => ({})) as DeepInkMeResponse
    const src = this.unwrapDeepInkUser(data)
    const phone = normalizePhoneValue(src.phone ?? src.mobile ?? src.phoneNumber ?? src.phone_number)
    const cachedUser = this.getTokenManager()?.getUserProfile() ?? null
    return {
      user: this.normalizeDeepInkUserProfile(src, phone || null, cachedUser),
      phone: phone || null,
    }
  }

  private unwrapDeepInkUser(data: DeepInkMeResponse): Record<string, unknown> {
    return data.user && typeof data.user === 'object' ? data.user : data as Record<string, unknown>
  }

  private normalizeDeepInkUserProfile(src: Record<string, unknown>, phone: string | null, fallback: UserProfile | null): UserProfile {
    const id = stringValue(src.id ?? src.userId ?? src.user_id ?? src._id) || fallback?.id || (phone ? `phone:${phone}` : 'unknown-user')
    const rawLastLoginAt = src.lastLoginAt ?? src.last_login_at
    const lastLoginAt =
      typeof rawLastLoginAt === 'number'
        ? rawLastLoginAt
        : rawLastLoginAt
          ? new Date(String(rawLastLoginAt)).getTime()
          : fallback?.lastLoginAt ?? Date.now()

    return {
      id,
      nickname: stringValue(src.nickname ?? src.name) || fallback?.nickname || '',
      avatarUrl: stringValue(src.avatarUrl ?? src.avatar_url) || fallback?.avatarUrl || '',
      phone,
      loginMethod: normalizeLoginMethod(src.loginMethod ?? src.login_method, fallback?.loginMethod),
      lastLoginAt: Number.isNaN(lastLoginAt) ? Date.now() : lastLoginAt,
      subscriptionTier: normalizeSubscriptionTier(src.subscriptionTier ?? src.subscription_tier, fallback?.subscriptionTier),
      subscriptionExpiresAt: stringValue(src.subscriptionExpiresAt ?? src.subscription_expires_at) || fallback?.subscriptionExpiresAt || null,
    }
  }

  private async getAuthVersion(): Promise<{
    ok: boolean
    message: string
    version?: CclinkLegacyImportPreflight['cloudVersion']
  }> {
    try {
      const baseUrl = this.requireBaseUrl()
      const res = await fetch(`${baseUrl}/auth/version`, { method: 'GET' })
      const data = await res.json().catch(() => ({})) as AuthVersionResponse
      const version = {
        version: data.version,
        buildTime: data.buildTime,
        capabilities: data.capabilities,
        env: data.env,
      }
      if (!res.ok || data.success === false) {
        return {
          ok: false,
          message: data.error || `auth 云函数版本探针失败：HTTP ${res.status}`,
          version,
        }
      }
      if (!data.capabilities?.cclinkLegacyBind || !data.capabilities?.cclinkPairedAgents) {
        return {
          ok: false,
          message: '线上 auth 云函数已响应，但缺少 CCLink legacy-bind / paired-agents 能力。',
          version,
        }
      }
      return { ok: true, message: 'auth 云函数版本正常', version }
    } catch (error) {
      return {
        ok: false,
        message: `auth 云函数版本探针不可达：${error instanceof Error ? error.message : String(error)}`,
      }
    }
  }

  private requireBaseUrl(): string {
    return requireDeepInkApiBaseUrl(this.baseUrl)
  }

  private requireLegacyChatccUrl(): string {
    return requireLegacyCclinkApiUrl(this.legacyChatccUrl)
  }

  private snapshotUser(user: UserProfile | null): CclinkAccountSnapshot | null {
    if (!user) return null
    return {
      id: user.id,
      phone: user.phone,
      loginMethod: user.loginMethod,
      nickname: user.nickname,
    }
  }

  private snapshotIdentity(identity: ChatccIdentity | null): CclinkIdentitySnapshot | null {
    if (!identity) return null
    return {
      accountUserId: identity.accountUserId,
      clientImUserId: identity.clientImUserId,
      sdkAppId: identity.sdkAppId,
    }
  }

  private normalizeIdentity(data: BridgeResponse, device: { id: string; name: string }): ChatccIdentity {
    const src = (data.identity ?? data) as Record<string, unknown>
    const root = data as Record<string, unknown>
    const accountUserId = String(src['accountUserId'] ?? src['account_user_id'] ?? src['im_user_id'] ?? root['account_user_id'] ?? '')
    const imUserId = String(src['imUserId'] ?? src['im_user_id'] ?? root['im_user_id'] ?? accountUserId)
    const clientImUserId = String(src['clientImUserId'] ?? src['client_im_user_id'] ?? root['client_im_user_id'] ?? '')
    const imUserSig = String(src['imUserSig'] ?? src['im_user_sig'] ?? root['im_user_sig'] ?? '')
    const authToken = String(src['authToken'] ?? src['auth_token'] ?? root['auth_token'] ?? '')
    const sdkAppId = Number(src['sdkAppId'] ?? src['sdk_app_id'] ?? root['sdk_app_id'] ?? 0)

    if (!accountUserId || !clientImUserId || !imUserSig || !authToken || !sdkAppId) {
      throw new Error('后端未返回完整 CCLink identity')
    }

    return {
      accountUserId,
      imUserId,
      clientImUserId,
      imUserSig,
      authToken,
      sdkAppId,
      deviceId: String(src['deviceId'] ?? src['device_id'] ?? device.id),
      deviceName: String(src['deviceName'] ?? src['device_name'] ?? device.name),
      expiresAt: (src['expiresAt'] ?? src['expires_at'] ?? root['expires_at'] ?? null) as string | null,
      updatedAt: Date.now(),
    }
  }

  private normalizePairedAgent(agent: PairedAgentResponse): ChatccServer | null {
    const id = String(agent.agent_id || '')
    if (!id) return null
    const lastSeen = this.normalizeTimestamp(agent.last_seen)
    const hostnameText = String(agent.hostname || agent.name || id)
    return {
      id,
      name: String(agent.name || hostnameText),
      hostname: hostnameText,
      os: String(agent.os || ''),
      status: agent.status === 'online' || agent.status === 'connecting' ? agent.status : 'offline',
      agentVersion: 'unknown',
      claudeVersion: 'unknown',
      lastSeen,
      workspaces: [],
    }
  }

  private normalizeTimestamp(value: string | number | Date | null | undefined): number {
    if (!value) return 0
    if (typeof value === 'number') return value < 10_000_000_000 ? value : Math.floor(value / 1000)
    const date = value instanceof Date ? value : new Date(value)
    const time = date.getTime()
    return Number.isFinite(time) ? Math.floor(time / 1000) : 0
  }

  private getOrCreateDevice(): { id: string; name: string } {
    try {
      if (existsSync(this.deviceFilePath)) {
        const parsed = JSON.parse(readFileSync(this.deviceFilePath, 'utf-8')) as { id?: string; name?: string }
        if (parsed.id && parsed.name) return { id: parsed.id, name: parsed.name }
      }
    } catch {
      // 损坏则重建。
    }

    const device = {
      id: `deepink-desktop-${randomUUID()}`,
      name: `${hostname()} DeepInk`,
    }
    mkdirSync(app.getPath('userData'), { recursive: true })
    writeFileSync(this.deviceFilePath, JSON.stringify(device, null, 2), 'utf-8')
    return device
  }
}

function normalizePhoneValue(value: unknown): string {
  if (value == null) return ''
  let phone = String(value).replace(/\D/g, '')
  if (phone.startsWith('0086')) phone = phone.slice(4)
  else if (phone.startsWith('86')) phone = phone.slice(2)
  return phone
}

function stringValue(value: unknown): string {
  return value == null ? '' : String(value)
}

function normalizeLoginMethod(value: unknown, fallback?: UserProfile['loginMethod']): UserProfile['loginMethod'] {
  if (value === 'wechat' || value === 'phone') return value
  return fallback ?? 'phone'
}

function normalizeSubscriptionTier(value: unknown, fallback?: UserProfile['subscriptionTier']): UserProfile['subscriptionTier'] {
  if (value === 'pro' || value === 'free') return value
  return fallback ?? 'free'
}
