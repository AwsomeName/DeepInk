/**
 * PricingPage — 套餐选择页
 *
 * 显示 Free 和 Pro 套餐对比，选择后创建订单弹出支付弹窗。
 */

import { useState, useEffect } from 'react'
import { useSubscriptionStore } from '../../stores'
import { IconCrown } from '../common/Icons'
import { PaymentModal } from './PaymentModal'
import type { SubscriptionPlan } from '../../types'

export function PricingPage(): React.ReactElement {
  const plans = useSubscriptionStore((s) => s.plans)
  const tier = useSubscriptionStore((s) => s.tier)
  const status = useSubscriptionStore((s) => s.status)
  const loading = useSubscriptionStore((s) => s.loading)
  const error = useSubscriptionStore((s) => s.error)
  const loadPlans = useSubscriptionStore((s) => s.loadPlans)
  const createOrder = useSubscriptionStore((s) => s.createOrder)
  const clearError = useSubscriptionStore((s) => s.clearError)

  const [showPayment, setShowPayment] = useState(false)
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null)

  // 加载套餐
  useEffect(() => {
    loadPlans()
  }, [])

  const isPro = tier === 'pro' && status === 'active'

  // 选择套餐并创建订单
  const handleSubscribe = async (planCode: string) => {
    clearError()
    setSelectedPlan(planCode)
    const ok = await createOrder(planCode, 'wechat_native')
    if (ok) {
      setShowPayment(true)
    }
  }

  // 格式化价格
  const formatPrice = (cents: number): string => {
    return `¥${(cents / 100).toFixed(0)}`
  }

  // 计算年卡日均
  const yearlyPlan = plans.find((p) => p.billingCycle === 'yearly')
  const monthlyPlan = plans.find((p) => p.billingCycle === 'monthly')
  const dailyCost = yearlyPlan ? (yearlyPlan.priceCents / 365 / 100).toFixed(1) : '--'

  return (
    <div className="pricing-page">
      <div className="pricing-header">
        <IconCrown size={28} />
        <h2>DeepInk Pro</h2>
        <p>解锁全部高级功能，让 AI 更好地为你工作</p>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="pricing-error">
          <span>{error}</span>
          <button onClick={clearError}>✕</button>
        </div>
      )}

      {/* 已是 Pro 用户 */}
      {isPro && (
        <div className="pricing-active-notice">
          <IconCrown size={16} />
          <span>你已是 Pro 用户，享受全部功能！</span>
        </div>
      )}

      {/* 套餐卡片 */}
      <div className="pricing-cards">
        {/* 月卡 */}
        {monthlyPlan && (
          <PlanCard
            plan={monthlyPlan}
            selected={selectedPlan === monthlyPlan.code}
            onSelect={() => handleSubscribe(monthlyPlan.code)}
            disabled={isPro || loading}
            loading={loading && selectedPlan === monthlyPlan.code}
            label="月卡"
            badge={null}
          />
        )}

        {/* 年卡（推荐） */}
        {yearlyPlan && (
          <PlanCard
            plan={yearlyPlan}
            selected={selectedPlan === yearlyPlan.code}
            onSelect={() => handleSubscribe(yearlyPlan.code)}
            disabled={isPro || loading}
            loading={loading && selectedPlan === yearlyPlan.code}
            label="年卡"
            badge="推荐"
            extra={`≈ ¥${dailyCost}/天`}
          />
        )}
      </div>

      {/* 功能对比 */}
      <div className="pricing-features">
        <h3>功能对比</h3>
        <div className="pricing-compare">
          <CompareRow feature="AI Agent 对话" free="✓" pro="✓" />
          <CompareRow feature="基础文件编辑" free="✓" pro="✓" />
          <CompareRow feature="基础浏览器查看" free="✓" pro="✓" />
          <CompareRow feature="云同步（WebDAV）" free="—" pro="✓" highlight />
          <CompareRow feature="高级浏览器自动化" free="—" pro="✓" highlight />
          <CompareRow feature="高级编辑器功能" free="—" pro="✓" highlight />
          <CompareRow feature="IM 高级功能（即将上线）" free="—" pro="✓" highlight />
          <CompareRow feature="优先技术支持" free="—" pro="✓" />
        </div>
      </div>

      {/* 支付弹窗 */}
      <PaymentModal
        visible={showPayment}
        onClose={() => {
          setShowPayment(false)
          setSelectedPlan(null)
        }}
        onSuccess={() => {
          setShowPayment(false)
          setSelectedPlan(null)
        }}
      />
    </div>
  )
}

// ─── 子组件 ──────────────────────────────────────

interface PlanCardProps {
  plan: SubscriptionPlan
  selected: boolean
  onSelect: () => void
  disabled: boolean
  loading: boolean
  label: string
  badge: string | null
  extra?: string
}

function PlanCard({ plan, selected, onSelect, disabled, loading, label, badge, extra }: PlanCardProps): React.ReactElement {
  return (
    <div className={`pricing-card ${selected ? 'selected' : ''} ${badge ? 'featured' : ''}`}>
      {badge && <div className="pricing-card-badge">{badge}</div>}
      <div className="pricing-card-header">
        <span className="pricing-card-label">{label}</span>
        <div className="pricing-card-price">
          <span className="pricing-card-amount">¥{(plan.priceCents / 100).toFixed(0)}</span>
          <span className="pricing-card-period">
            /{plan.billingCycle === 'monthly' ? '月' : '年'}
          </span>
        </div>
        {extra && <span className="pricing-card-extra">{extra}</span>}
      </div>
      <button
        className={`sub-btn ${selected ? 'sub-btn-primary' : 'sub-btn-secondary'}`}
        disabled={disabled || loading}
        onClick={onSelect}
      >
        {loading ? '处理中...' : disabled ? '已是 Pro' : `订阅 ${label}`}
      </button>
    </div>
  )
}

function CompareRow({ feature, free, pro, highlight }: { feature: string; free: string; pro: string; highlight?: boolean }): React.ReactElement {
  return (
    <div className={`pricing-compare-row ${highlight ? 'highlight' : ''}`}>
      <span className="pricing-compare-feature">{feature}</span>
      <span className="pricing-compare-free">{free}</span>
      <span className="pricing-compare-pro">{pro}</span>
    </div>
  )
}
