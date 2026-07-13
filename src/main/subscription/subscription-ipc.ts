/**
 * SubscriptionIPC — 订阅相关 IPC 通道注册
 *
 * 遵循项目 IPC 模式（参考 auth-ipc.ts）：
 * - ipcMain.handle 用于请求-响应模式
 * - webContents.send 用于主→渲染进程事件推送
 */

import { ipcMain, BrowserWindow } from 'electron'
import { TokenManager } from '../auth/token-manager'
import { SubscriptionService } from './subscription-service'
import type { PaymentChannel } from '../../shared/ipc/subscription'

/**
 * 注册所有订阅相关 IPC 通道
 *
 * @param mainWindow 主窗口实例
 * @param tokenManager Token 管理器（获取 access token）
 * @param subscriptionService 订阅服务客户端
 */
export function registerSubscriptionIpc(
  mainWindow: BrowserWindow,
  tokenManager: TokenManager,
  subscriptionService: SubscriptionService,
): void {
  // ─── 套餐列表 ──────────────────────────────────

  ipcMain.handle('subscription:getPlans', async () => {
    try {
      const plans = await subscriptionService.getPlans()
      return { success: true, plans }
    } catch (err) {
      console.error('[Subscription] 获取套餐失败:', err)
      return { success: false, error: err instanceof Error ? err.message : '获取套餐列表失败' }
    }
  })

  // ─── 订阅状态 ──────────────────────────────────

  ipcMain.handle('subscription:getStatus', async () => {
    try {
      const accessToken = await tokenManager.getValidAccessToken()
      if (!accessToken) {
        return {
          success: true,
          subscription: { tier: 'free', plan: null, periodStart: null, periodEnd: null, status: 'inactive' },
        }
      }

      const subscription = await subscriptionService.getStatus(accessToken)
      return { success: true, subscription }
    } catch (err) {
      console.error('[Subscription] 获取订阅状态失败:', err)
      return { success: false, error: err instanceof Error ? err.message : '获取订阅状态失败' }
    }
  })

  // ─── 创建订单 ──────────────────────────────────

  ipcMain.handle('subscription:createOrder', async (_event, planCode: string, channel: PaymentChannel) => {
    try {
      const accessToken = await tokenManager.getValidAccessToken()
      if (!accessToken) {
        return { success: false, error: '请先登录' }
      }

      const result = await subscriptionService.createOrder(accessToken, planCode, channel)
      return { success: true, ...result }
    } catch (err: any) {
      console.error('[Subscription] 创建订单失败:', err)
      const msg = err?.message || '创建订单失败'
      return { success: false, error: msg }
    }
  })

  // ─── 轮询订单状态 ──────────────────────────────

  ipcMain.handle('subscription:checkOrder', async (_event, orderNo: string) => {
    try {
      const accessToken = await tokenManager.getValidAccessToken()
      if (!accessToken) {
        return { success: false, error: '请先登录' }
      }

      const result = await subscriptionService.checkOrder(accessToken, orderNo)

      // 如果支付成功，主动推送状态变更
      if (result.status === 'paid') {
        try {
          const subscription = await subscriptionService.getStatus(accessToken)
          if (!mainWindow.isDestroyed()) {
            mainWindow.webContents.send('subscription:statusChanged', subscription)
          }
        } catch {
          // 推送失败不影响主流程
        }
      }

      return { success: true, ...result }
    } catch (err: any) {
      console.error('[Subscription] 查询订单失败:', err)
      return { success: false, error: err?.message || '查询订单失败' }
    }
  })

  // ─── Apple IAP 验证 ────────────────────────────

  ipcMain.handle('subscription:verifyAppleIap', async (_event, orderNo: string, receiptData: string) => {
    try {
      const accessToken = await tokenManager.getValidAccessToken()
      if (!accessToken) {
        return { success: false, error: '请先登录' }
      }

      const result = await subscriptionService.verifyAppleIap(accessToken, orderNo, receiptData)

      // 验证成功，推送状态变更
      if (result.success) {
        try {
          const subscription = await subscriptionService.getStatus(accessToken)
          if (!mainWindow.isDestroyed()) {
            mainWindow.webContents.send('subscription:statusChanged', subscription)
          }
        } catch {
          // 推送失败不影响主流程
        }
      }

      return { success: result.success }
    } catch (err: any) {
      console.error('[Subscription] Apple IAP 验证失败:', err)
      return { success: false, error: err?.message || 'Apple IAP 验证失败' }
    }
  })

  // ─── 取消订阅 ──────────────────────────────────

  ipcMain.handle('subscription:cancel', async () => {
    try {
      const accessToken = await tokenManager.getValidAccessToken()
      if (!accessToken) {
        return { success: false, error: '请先登录' }
      }

      await subscriptionService.cancel(accessToken)

      // 推送状态变更
      try {
        const subscription = await subscriptionService.getStatus(accessToken)
        if (!mainWindow.isDestroyed()) {
          mainWindow.webContents.send('subscription:statusChanged', subscription)
        }
      } catch {
        // 推送失败不影响主流程
      }

      return { success: true }
    } catch (err: any) {
      console.error('[Subscription] 取消订阅失败:', err)
      return { success: false, error: err?.message || '取消订阅失败' }
    }
  })

  console.log('[DeepInk] Subscription IPC 已注册')
}
