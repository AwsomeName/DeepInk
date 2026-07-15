/**
 * FeatureGate — Pro 功能门控
 *
 * 统一的 Pro 功能检查入口，所有需要订阅的功能共用。
 * 规则：
 *   1. 开发版（!app.isPackaged）直接放行，方便测试
 *   2. 未登录 → 拒绝
 *   3. tier !== 'pro' 或 status !== 'active' → 拒绝
 *   4. 网络错误 → 放行（避免断网锁死功能）
 */

import { app } from 'electron'
import type { TokenManager } from '../auth/token-manager'
import type { SubscriptionService } from './subscription-service'
import type { Entitlement, UserSubscription } from '../../shared/ipc/subscription'

export interface GateResult {
  /** 是否允许使用 */
  allowed: boolean
  /** 拒绝原因（中文，可直接显示给用户） */
  reason?: string
}

const PRO_COMPAT_ENTITLEMENTS: Entitlement[] = [
  'cloud_sync',
  'remote_workspace',
  'remote_pairing',
  'remote_file_read',
  'remote_file_write',
  'remote_terminal',
  'remote_agent_session',
  'remote_audit',
]

function parseMockEntitlements(): Set<Entitlement> | null {
  const raw = process.env.DEEPINK_MOCK_ENTITLEMENTS
  if (!raw) return null
  return new Set(
    raw
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean) as Entitlement[],
  )
}

export function hasEntitlement(subscription: UserSubscription, entitlement: Entitlement): boolean {
  const explicit = subscription.entitlements?.find((item) => item.code === entitlement)
  if (explicit) return explicit.enabled
  if (subscription.tier === 'pro' && subscription.status === 'active') {
    return PRO_COMPAT_ENTITLEMENTS.includes(entitlement)
  }
  return false
}

export async function checkEntitlement(
  featureName: string,
  entitlement: Entitlement,
  tokenManager: TokenManager,
  subscriptionService: SubscriptionService,
): Promise<GateResult> {
  const mockEntitlements = parseMockEntitlements()
  if (!app.isPackaged) {
    if (!mockEntitlements) return { allowed: true }
    return mockEntitlements.has(entitlement)
      ? { allowed: true }
      : { allowed: false, reason: `${featureName}需要 ${entitlement} entitlement` }
  }

  const accessToken = await tokenManager.getValidAccessToken()
  if (!accessToken) {
    return { allowed: false, reason: `请先登录以使用${featureName}` }
  }

  try {
    const subscription = await subscriptionService.getStatus(accessToken)
    if (hasEntitlement(subscription, entitlement)) {
      return { allowed: true }
    }
    return { allowed: false, reason: `${featureName}为付费功能，请升级` }
  } catch {
    console.warn(`[FeatureGate] 检查 ${featureName} entitlement 失败，允许降级使用`)
    return { allowed: true }
  }
}

/**
 * 检查用户是否有权使用指定 Pro 功能
 *
 * @param featureName 功能名称（用于提示文案，如 '云同步'）
 * @param tokenManager Token 管理器
 * @param subscriptionService 订阅服务
 */
export async function checkProFeature(
  featureName: string,
  tokenManager: TokenManager,
  subscriptionService: SubscriptionService,
): Promise<GateResult> {
  // 开发版直接放行
  if (!app.isPackaged) {
    return { allowed: true }
  }

  // 检查登录状态
  const accessToken = await tokenManager.getValidAccessToken()
  if (!accessToken) {
    return { allowed: false, reason: `请先登录以使用${featureName}` }
  }

  // 检查订阅状态
  try {
    const subscription = await subscriptionService.getStatus(accessToken)
    if (subscription.tier === 'pro' && subscription.status === 'active') {
      return { allowed: true }
    }
    return { allowed: false, reason: `${featureName}为 Pro 功能，请升级` }
  } catch {
    // 网络错误时允许降级使用（避免断网锁死功能）
    console.warn(`[FeatureGate] 检查 ${featureName} 订阅状态失败，允许降级使用`)
    return { allowed: true }
  }
}
