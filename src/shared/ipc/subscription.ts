export type SubscriptionTier = 'free' | 'pro'
export type SubscriptionStatus = 'active' | 'expired' | 'cancelled' | 'inactive'
export type PaymentChannel = 'wechat_native' | 'apple_iap'
export type OrderStatus = 'pending' | 'paid' | 'failed' | 'refunded' | 'expired'
export type Entitlement =
  | 'cloud_sync'
  | 'remote_workspace'
  | 'remote_pairing'
  | 'remote_file_read'
  | 'remote_file_write'
  | 'remote_terminal'
  | 'remote_agent_session'
  | 'remote_audit'

export interface EntitlementGrant {
  code: Entitlement
  enabled: boolean
  expiresAt?: string | null
  reason?: string
}

export interface SubscriptionPlan {
  id: string
  code: string
  name: string
  tier: SubscriptionTier
  billingCycle: 'monthly' | 'yearly'
  priceCents: number
  currency: string
  durationDays: number
  features: string[]
  sortOrder: number
}

export interface UserSubscription {
  tier: SubscriptionTier
  plan: SubscriptionPlan | null
  periodStart: string | null
  periodEnd: string | null
  status: SubscriptionStatus
  entitlements?: EntitlementGrant[]
}

export interface CreateOrderResult {
  orderNo: string
  codeUrl?: string
  expiresAt?: string
}

export interface OrderCheckResult {
  status: OrderStatus
  paidAt: string | null
}

export interface SubscriptionApiContract {
  getPlans: () => Promise<{ success: boolean; plans?: SubscriptionPlan[]; error?: string }>
  getStatus: () => Promise<{ success: boolean; subscription?: UserSubscription; error?: string }>
  createOrder: (planCode: string, channel: PaymentChannel) => Promise<CreateOrderResult & { success: boolean; error?: string }>
  checkOrder: (orderNo: string) => Promise<OrderCheckResult & { success: boolean; error?: string }>
  verifyAppleIap: (orderNo: string, receiptData: string) => Promise<{ success: boolean; error?: string }>
  cancel: () => Promise<{ success: boolean; error?: string }>
  onStatusChanged: (callback: (status: UserSubscription) => void) => void
}
