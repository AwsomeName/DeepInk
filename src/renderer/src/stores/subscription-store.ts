/**
 * 订阅状态管理 Store
 *
 * 管理用户订阅状态、套餐列表、支付流程。
 * 跟 sync-store 同模式：Zustand flat state + setter actions。
 * IPC 事件监听在 loadStatus 中注册，不依赖组件生命周期。
 */

import { create } from 'zustand'
import type {
  SubscriptionTier,
  SubscriptionStatus,
  SubscriptionPlan,
  UserSubscription,
  PaymentChannel,
  OrderStatus,
  EntitlementGrant,
} from '../types/index'

interface SubscriptionState {
  /** 当前订阅等级 */
  tier: SubscriptionTier
  /** 当前订阅状态 */
  status: SubscriptionStatus
  /** 当前订阅套餐详情 */
  plan: SubscriptionPlan | null
  /** 订阅到期时间 */
  periodEnd: string | null
  /** 当前用户可用能力，后端未下发时为空，由主进程兼容 Pro 推导 */
  entitlements: EntitlementGrant[]
  /** 可购买的套餐列表 */
  plans: SubscriptionPlan[]
  /** 是否正在加载 */
  loading: boolean
  /** 错误信息 */
  error: string | null

  // ─── 支付流程状态 ────────────────────────────
  /** 当前订单号 */
  orderNo: string | null
  /** 微信支付 QR 码 URL */
  codeUrl: string | null
  /** 订单过期时间 */
  orderExpiresAt: string | null
  /** 是否正在轮询订单状态 */
  orderPolling: boolean
  /** 订单轮询定时器 */
  _pollTimer: ReturnType<typeof setInterval> | null

  // ─── Actions ─────────────────────────────────
  /** 加载套餐列表 */
  loadPlans: () => Promise<void>
  /** 加载当前订阅状态 + 注册 IPC 事件监听（应用启动时调用一次） */
  loadStatus: () => Promise<void>
  /** 创建支付订单 */
  createOrder: (planCode: string, channel: PaymentChannel) => Promise<boolean>
  /** 开始轮询订单状态（每 2 秒） */
  startOrderPolling: (orderNo: string) => void
  /** 停止轮询 */
  stopOrderPolling: () => void
  /** 取消订阅 */
  cancel: () => Promise<void>
  /** 重置错误 */
  clearError: () => void
  /** 更新订阅状态（由 IPC 事件回调使用） */
  _updateFromEvent: (subscription: UserSubscription) => void
}

export const useSubscriptionStore = create<SubscriptionState>((set, get) => ({
  tier: 'free',
  status: 'inactive',
  plan: null,
  periodEnd: null,
  entitlements: [],
  plans: [],
  loading: false,
  error: null,

  // 支付流程
  orderNo: null,
  codeUrl: null,
  orderExpiresAt: null,
  orderPolling: false,
  _pollTimer: null,

  // ─── 加载套餐列表 ────────────────────────────

  loadPlans: async () => {
    try {
      const result = await window.deepink.subscription.getPlans()
      if (result.success && result.plans) {
        set({ plans: result.plans })
      } else {
        set({ plans: [], error: result.error || '套餐服务未配置' })
      }
    } catch (err) {
      console.error('[SubscriptionStore] 加载套餐失败:', err)
    }
  },

  // ─── 加载订阅状态 ────────────────────────────

  loadStatus: async () => {
    set({ loading: true, error: null })
    try {
      const result = await window.deepink.subscription.getStatus()
      if (result.success && result.subscription) {
        const sub = result.subscription
        set({
          tier: sub.tier,
          status: sub.status,
          plan: sub.plan,
          periodEnd: sub.periodEnd,
          entitlements: sub.entitlements ?? [],
          loading: false,
        })
      } else {
        set({ loading: false, error: result.error || '订阅服务未配置' })
      }
    } catch (err) {
      console.error('[SubscriptionStore] 加载订阅状态失败:', err)
      set({ loading: false, error: '加载订阅状态失败' })
    }

    // 注册 IPC 事件监听（只注册一次）
    try {
      window.deepink.subscription.onStatusChanged((subscription: UserSubscription) => {
        get()._updateFromEvent(subscription)
      })
    } catch {
      // 可能已经注册过
    }
  },

  // ─── 创建支付订单 ────────────────────────────

  createOrder: async (planCode: string, channel: PaymentChannel) => {
    set({ loading: true, error: null })
    try {
      const result = await window.deepink.subscription.createOrder(planCode, channel)
      if (result.success) {
        set({
          orderNo: result.orderNo,
          codeUrl: result.codeUrl || null,
          orderExpiresAt: result.expiresAt || null,
          loading: false,
        })
        return true
      } else {
        set({ loading: false, error: result.error || '创建订单失败' })
        return false
      }
    } catch (err: any) {
      set({ loading: false, error: err?.message || '创建订单失败' })
      return false
    }
  },

  // ─── 订单轮询 ────────────────────────────────

  startOrderPolling: (orderNo: string) => {
    // 先清除已有定时器
    const { _pollTimer } = get()
    if (_pollTimer) clearInterval(_pollTimer)

    set({ orderPolling: true })

    const timer = setInterval(async () => {
      try {
        const result = await window.deepink.subscription.checkOrder(orderNo)
        if (result.success && result.status === 'paid') {
          // 支付成功！停止轮询并刷新状态
          get().stopOrderPolling()
          await get().loadStatus()
          set({ orderNo: null, codeUrl: null, orderExpiresAt: null })
        }
      } catch {
        // 轮询失败继续
      }
    }, 2000) // 每 2 秒轮询一次

    set({ _pollTimer: timer })
  },

  stopOrderPolling: () => {
    const { _pollTimer } = get()
    if (_pollTimer) {
      clearInterval(_pollTimer)
    }
    set({ orderPolling: false, _pollTimer: null })
  },

  // ─── 取消订阅 ────────────────────────────────

  cancel: async () => {
    set({ loading: true, error: null })
    try {
      const result = await window.deepink.subscription.cancel()
      if (result.success) {
        await get().loadStatus()
      } else {
        set({ error: result.error || '取消订阅失败' })
      }
    } catch (err: any) {
      set({ error: err?.message || '取消订阅失败' })
    } finally {
      set({ loading: false })
    }
  },

  // ─── 工具方法 ─────────────────────────────────

  clearError: () => set({ error: null }),

  _updateFromEvent: (subscription: UserSubscription) => {
    set({
      tier: subscription.tier,
      status: subscription.status,
      plan: subscription.plan,
      periodEnd: subscription.periodEnd,
      entitlements: subscription.entitlements ?? [],
    })
  },
}))
