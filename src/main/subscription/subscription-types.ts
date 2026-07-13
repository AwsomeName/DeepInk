/**
 * 订阅系统共享类型的兼容出口。
 * 新代码优先从 `src/shared/ipc/subscription` 引用；保留本文件以兼容既有 main 侧 import。
 */
export type {
  SubscriptionTier,
  SubscriptionStatus,
  PaymentChannel,
  OrderStatus,
  SubscriptionPlan,
  UserSubscription,
  CreateOrderResult,
  OrderCheckResult,
} from '../../shared/ipc/subscription'
