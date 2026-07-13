/**
 * SubscriptionService — 后端订阅 API 客户端
 *
 * 负责所有与后端订阅服务的 HTTP 通信。
 * 模式与 AuthService 一致：Node.js fetch，env 配 BASE_URL。
 */

import type {
  SubscriptionPlan,
  UserSubscription,
  CreateOrderResult,
  OrderCheckResult,
  PaymentChannel,
} from '../../shared/ipc/subscription'
import {
  getDeepInkApiBaseUrl,
  normalizeServiceUrl,
  requireDeepInkApiBaseUrl,
} from '../config/private-service-config'

// 后端 API 基础地址（与 AuthService 共用）
// 云服务后端实现在独立的 private-serv 项目中维护；开源版不内置产品服务地址。
const BASE_URL = getDeepInkApiBaseUrl()

/** 订阅 API 错误 */
class SubscriptionApiError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number,
  ) {
    super(message)
    this.name = 'SubscriptionApiError'
  }
}

export class SubscriptionService {
  private baseUrl: string | null

  constructor(baseUrl?: string) {
    this.baseUrl = normalizeServiceUrl(baseUrl) ?? BASE_URL
  }

  // ─── 套餐 ─────────────────────────────────────

  /**
   * 获取所有可用的订阅套餐
   * 公开接口，无需鉴权
   */
  async getPlans(): Promise<SubscriptionPlan[]> {
    const res = await this.request('GET', '/subscription/plans')
    return res.plans || []
  }

  // ─── 订阅状态 ─────────────────────────────────

  /**
   * 获取当前用户的订阅状态
   * 后端会自动检查过期并更新
   */
  async getStatus(accessToken: string): Promise<UserSubscription> {
    const res = await this.request('GET', '/subscription/status', undefined, accessToken)
    return res.subscription || { tier: 'free', plan: null, periodStart: null, periodEnd: null, status: 'inactive' }
  }

  // ─── 订单 ─────────────────────────────────────

  /**
   * 创建支付订单
   *
   * @param accessToken 用户 access token
   * @param planCode 套餐代码（如 'pro_monthly'）
   * @param channel 支付渠道
   * @returns 订单信息 + 微信 QR code URL（如果是微信支付）
   */
  async createOrder(
    accessToken: string,
    planCode: string,
    channel: PaymentChannel,
  ): Promise<CreateOrderResult> {
    const res = await this.request('POST', '/subscription/create-order', { planCode, channel }, accessToken)
    return {
      orderNo: res.orderNo,
      codeUrl: res.codeUrl,
      expiresAt: res.expiresAt,
    }
  }

  /**
   * 查询订单支付状态
   * 客户端轮询使用
   */
  async checkOrder(accessToken: string, orderNo: string): Promise<OrderCheckResult> {
    const res = await this.request(
      'GET',
      `/subscription/check-order?orderNo=${encodeURIComponent(orderNo)}`,
      undefined,
      accessToken,
    )
    return {
      status: res.status,
      paidAt: res.paidAt,
    }
  }

  // ─── Apple IAP ────────────────────────────────

  /**
   * 验证 Apple IAP 凭据
   */
  async verifyAppleIap(
    accessToken: string,
    orderNo: string,
    receiptData: string,
  ): Promise<{ success: boolean }> {
    const res = await this.request(
      'POST',
      '/subscription/verify-apple-iap',
      { orderNo, receiptData },
      accessToken,
    )
    return { success: res.verified === true }
  }

  // ─── 取消 ─────────────────────────────────────

  /**
   * 取消订阅（到期后不再续费）
   */
  async cancel(accessToken: string): Promise<void> {
    await this.request('POST', '/subscription/cancel', undefined, accessToken)
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
      throw new SubscriptionApiError(
        data.error || data.message || `HTTP ${res.status}`,
        data.code || 'UNKNOWN',
        res.status,
      )
    }

    const data = await res.json()
    // 后端统一返回 { success: true, ...data }
    if (data.success === false) {
      throw new SubscriptionApiError(
        data.error || '请求失败',
        data.code || 'UNKNOWN',
        res.status,
      )
    }
    return data
  }
}
