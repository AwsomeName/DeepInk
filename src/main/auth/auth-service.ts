/**
 * AuthService — 后端认证 API 客户端
 *
 * 负责所有与后端认证服务的 HTTP 通信。
 * 使用 Node.js 内置 fetch（Electron 35 / Node.js 20+）。
 *
 * 后端基于腾讯云 SCF，API 网关地址通过 BASE_URL 配置。
 */

import type { AuthResult, TokenRefreshResult, UserProfile } from '../../shared/ipc/auth'
import {
  getDeepInkApiBaseUrl,
  normalizeServiceUrl,
  PrivateServiceConfigError,
  requireDeepInkApiBaseUrl,
} from '../config/private-service-config'

// 后端 API 基础地址（开发阶段可配置）
// 云服务后端实现在独立的 private-serv 项目中维护；开源版不内置产品服务地址。
const BASE_URL = getDeepInkApiBaseUrl()

/** 通用 API 错误 */
class AuthApiError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number,
  ) {
    super(message)
    this.name = 'AuthApiError'
  }
}

export class AuthService {
  private baseUrl: string | null

  constructor(baseUrl?: string) {
    this.baseUrl = normalizeServiceUrl(baseUrl) ?? BASE_URL
  }

  isConfigured(): boolean {
    return Boolean(this.baseUrl)
  }

  // ─── 手机号登录 ──────────────────────────────────

  /**
   * 发送短信验证码（通过 UniSMS 后端）
   */
  async sendSmsCode(phone: string): Promise<{ success: boolean; error?: string }> {
    try {
      await this.request('POST', '/auth/phone/send-code', { phone })
      return { success: true }
    } catch (err) {
      return { success: false, error: this.formatError(err) }
    }
  }

  /**
   * 验证手机号 + 验证码，换取 token + 用户信息
   */
  async verifyPhoneCode(phone: string, code: string): Promise<AuthResult> {
    try {
      const res = await this.request('POST', '/auth/phone/verify', { phone, code })
      return {
        success: true,
        user: this.mapUser(res.user, 'phone', phone),
        accessToken: res.accessToken,
        refreshToken: res.refreshToken,
        expiresIn: res.expiresIn,
      } as AuthResult & { accessToken: string; refreshToken: string; expiresIn: number }
    } catch (err) {
      return { success: false, error: this.formatError(err) }
    }
  }

  // ─── Token 管理 ─────────────────────────────────

  /**
   * 刷新 access token
   * 成功时返回新的 access + refresh token 对
   */
  async refreshTokens(refreshToken: string): Promise<TokenRefreshResult> {
    const res = await this.request('POST', '/auth/token/refresh', { refreshToken })
    return {
      accessToken: res.accessToken,
      refreshToken: res.refreshToken,
      expiresIn: res.expiresIn,
    }
  }

  /**
   * 获取当前用户信息（需要有效的 access token）
   */
  async getMe(accessToken: string): Promise<UserProfile | null> {
    try {
      const res = await this.request('GET', '/auth/me', undefined, accessToken)
      return this.mapUser(res.user ?? res, 'phone') // loginMethod 由后端返回
    } catch {
      return null
    }
  }

  /**
   * 通知后端吊销 refresh token（登出）
   * 尽力而为，失败不影响本地登出
   */
  async logout(refreshToken: string | null): Promise<void> {
    if (!refreshToken) return
    try {
      await this.request('POST', '/auth/logout', { refreshToken })
    } catch {
      // 忽略错误，本地 token 仍然清除
    }
  }

  // ─── 内部方法 ───────────────────────────────────

  private async request(
    method: string,
    path: string,
    body?: unknown,
    accessToken?: string,
  ): Promise<any> {
    const baseUrl = requireDeepInkApiBaseUrl(this.baseUrl)
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`
    }

    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new AuthApiError(
        data.message || data.error || `HTTP ${res.status}`,
        data.code || 'UNKNOWN',
        res.status,
      )
    }

    return res.json()
  }

  private mapUser(data: any, loginMethod: 'phone' | 'wechat', fallbackPhone?: string): UserProfile {
    const src = data && typeof data === 'object' ? data : {}
    const phone = src.phone || src.mobile || src.phoneNumber || src.phone_number || fallbackPhone || null
    const id = src.id || src.userId || src.user_id || src.uid || src._id || (phone ? `phone:${phone}` : 'unknown-user')
    const rawLastLoginAt = src.lastLoginAt || src.last_login_at
    const lastLoginAt =
      typeof rawLastLoginAt === 'number'
        ? rawLastLoginAt
        : rawLastLoginAt
          ? new Date(rawLastLoginAt).getTime()
          : Date.now()

    return {
      id: String(id),
      nickname: src.nickname || src.name || src.displayName || '',
      avatarUrl: src.avatarUrl || src.avatar_url || src.headimgurl || '',
      phone: phone ? String(phone) : null,
      loginMethod: src.loginMethod || src.login_method || loginMethod,
      lastLoginAt: Number.isNaN(lastLoginAt) ? Date.now() : lastLoginAt,
      subscriptionTier: src.subscriptionTier || src.subscription_tier,
      subscriptionExpiresAt: src.subscriptionExpiresAt || src.subscription_expires_at || null,
    }
  }

  private formatError(err: unknown): string {
    if (err instanceof PrivateServiceConfigError) {
      return err.message
    }
    if (err instanceof AuthApiError) {
      return err.message
    }
    if (err instanceof Error) {
      if (err.message === 'fetch failed') {
        return `认证服务不可达：${this.baseUrl ?? '未配置'}`
      }
      return err.message
    }
    return '未知错误'
  }
}
