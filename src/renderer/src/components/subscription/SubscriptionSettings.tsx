/**
 * SubscriptionSettings — 设置页订阅 section
 *
 * 显示当前订阅状态、套餐选择、支付弹窗。
 * Free 用户直接看到套餐卡片 + 支付流程，Pro 用户看到管理界面。
 */

import { useState, useEffect } from 'react'
import { useSubscriptionStore } from '../../stores'
import { IconCrown } from '../common/Icons'
import { PricingPage } from './PricingPage'

export function SubscriptionSettings(): React.ReactElement {
  const tier = useSubscriptionStore((s) => s.tier)
  const status = useSubscriptionStore((s) => s.status)
  const periodEnd = useSubscriptionStore((s) => s.periodEnd)
  const loading = useSubscriptionStore((s) => s.loading)
  const cancel = useSubscriptionStore((s) => s.cancel)
  const loadStatus = useSubscriptionStore((s) => s.loadStatus)
  const loadPlans = useSubscriptionStore((s) => s.loadPlans)

  const [showPricing, setShowPricing] = useState(false)

  const isPro = tier === 'pro'
  const isActive = status === 'active'

  // 加载订阅状态
  useEffect(() => {
    loadStatus()
    loadPlans()
  }, [])

  // Pro 用户直接看管理界面
  if (isPro && isActive) {
    return (
      <div className="settings-section">
        <h2>订阅</h2>
        <div className="settings-group">
          <div className="settings-row">
            <div className="settings-label">
              <span>当前套餐</span>
              <span className="settings-description">
                Pro · 到期 {formatDate(periodEnd)}
              </span>
            </div>
            <div className="settings-control">
              <span className="subscription-badge pro">PRO</span>
            </div>
          </div>
        </div>

        <div className="settings-group">
          <h3>Pro 功能</h3>
          <div className="subscription-features">
            <FeatureItem label="云同步（WebDAV）" active={true} />
            <FeatureItem label="高级浏览器自动化" active={true} />
            <FeatureItem label="高级编辑器功能" active={true} />
            <FeatureItem label="IM 高级功能（即将上线）" active={true} />
            <FeatureItem label="AI Agent" active={true} note="不限" />
          </div>
        </div>

        <div className="settings-group">
          <div className="settings-row">
            <div className="settings-label">
              <span>管理订阅</span>
              <span className="settings-description">取消后将保持到当前周期结束</span>
            </div>
            <div className="settings-control">
              <button
                className="sub-btn sub-btn-secondary sub-btn-sm"
                disabled={loading}
                onClick={cancel}
              >
                取消订阅
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Free 用户：显示升级入口或套餐选择
  return (
    <div className="settings-section">
      <h2>订阅</h2>

      <div className="settings-group">
        <div className="settings-row">
          <div className="settings-label">
            <span>当前套餐</span>
            <span className="settings-description">免费版</span>
          </div>
          <div className="settings-control">
            <span className="subscription-badge free">FREE</span>
          </div>
        </div>
      </div>

      {/* 直接内嵌 PricingPage，包含套餐选择 + 支付弹窗 */}
      <PricingPage />
    </div>
  )
}

/** 功能项 */
function FeatureItem({ label, active, note }: { label: string; active: boolean; note?: string }): React.ReactElement {
  return (
    <div className={`subscription-feature-item ${active ? 'active' : ''}`}>
      <span className="subscription-feature-check">
        {active ? '✓' : '○'}
      </span>
      <span>{label}</span>
      {note && <span className="subscription-feature-note">{note}</span>}
    </div>
  )
}

/** 格式化日期 */
function formatDate(dateStr: string | null): string {
  if (!dateStr) return '--'
  try {
    const d = new Date(dateStr)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  } catch {
    return dateStr
  }
}
