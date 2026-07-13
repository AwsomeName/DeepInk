/**
 * PaymentModal — 微信支付弹窗
 *
 * 显示微信支付二维码 + 倒计时 + 自动轮询。
 * 支付成功后自动关闭并触发状态刷新。
 */

import { useState, useEffect, useCallback } from 'react'
import { useSubscriptionStore } from '../../stores'

interface PaymentModalProps {
  /** 是否显示 */
  visible: boolean
  /** 关闭回调 */
  onClose: () => void
  /** 支付成功回调 */
  onSuccess?: () => void
}

export function PaymentModal({ visible, onClose, onSuccess }: PaymentModalProps): React.ReactElement | null {
  const codeUrl = useSubscriptionStore((s) => s.codeUrl)
  const orderExpiresAt = useSubscriptionStore((s) => s.orderExpiresAt)
  const orderPolling = useSubscriptionStore((s) => s.orderPolling)
  const startOrderPolling = useSubscriptionStore((s) => s.startOrderPolling)
  const stopOrderPolling = useSubscriptionStore((s) => s.stopOrderPolling)
  const orderNo = useSubscriptionStore((s) => s.orderNo)
  const tier = useSubscriptionStore((s) => s.tier)

  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [countdown, setCountdown] = useState<number>(0)

  // 生成 QR 码
  useEffect(() => {
    if (!visible || !codeUrl) {
      setQrDataUrl(null)
      return
    }

    let cancelled = false
    // 动态导入 qrcode 库
    import('qrcode')
      .then((QRCode) => {
        if (cancelled) return
        QRCode.toDataURL(codeUrl, {
          width: 200,
          margin: 2,
          color: { dark: '#000000', light: '#ffffff' },
        }).then((url: string) => {
          if (!cancelled) setQrDataUrl(url)
        })
      })
      .catch(() => {
        // qrcode 库不可用时用文本替代
        if (!cancelled) setQrDataUrl(null)
      })

    return () => { cancelled = true }
  }, [visible, codeUrl])

  // 开始轮询
  useEffect(() => {
    if (visible && orderNo && !orderPolling) {
      startOrderPolling(orderNo)
    }
    return () => { stopOrderPolling() }
  }, [visible, orderNo])

  // 倒计时
  useEffect(() => {
    if (!visible || !orderExpiresAt) return

    const updateCountdown = () => {
      const expires = new Date(orderExpiresAt).getTime()
      const remaining = Math.max(0, Math.floor((expires - Date.now()) / 1000))
      setCountdown(remaining)
    }

    updateCountdown()
    const timer = setInterval(updateCountdown, 1000)
    return () => clearInterval(timer)
  }, [visible, orderExpiresAt])

  // 支付成功检测
  useEffect(() => {
    if (visible && tier === 'pro') {
      stopOrderPolling()
      onSuccess?.()
      onClose()
    }
  }, [visible, tier])

  // ESC 关闭
  useEffect(() => {
    if (!visible) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [visible, onClose])

  if (!visible) return null

  const minutes = Math.floor(countdown / 60)
  const seconds = countdown % 60

  return (
    <div className="payment-modal-overlay" onClick={(e) => {
      if (e.target === e.currentTarget) onClose()
    }}>
      <div className="payment-modal">
        {/* 标题 */}
        <div className="payment-modal-header">
          <h3>微信支付</h3>
          <button className="payment-modal-close" onClick={onClose}>✕</button>
        </div>

        {/* QR 码 */}
        <div className="payment-modal-body">
          {qrDataUrl ? (
            <div className="payment-qr-wrapper">
              <img src={qrDataUrl} alt="微信支付二维码" className="payment-qr-image" />
            </div>
          ) : codeUrl ? (
            <div className="payment-qr-placeholder">
              <span>正在生成二维码...</span>
            </div>
          ) : (
            <div className="payment-qr-placeholder">
              <span>二维码加载失败</span>
            </div>
          )}

          <p className="payment-instructions">
            请使用 <strong>微信</strong> 扫描二维码完成支付
          </p>

          {/* 倒计时 */}
          {countdown > 0 && (
            <p className="payment-countdown">
              二维码有效期 {minutes}:{String(seconds).padStart(2, '0')}
            </p>
          )}
          {countdown === 0 && (
            <p className="payment-countdown expired">
              二维码已过期，请重新创建订单
            </p>
          )}

          {/* 手动确认 */}
          <button
            className="sub-btn sub-btn-secondary sub-btn-sm"
            onClick={async () => {
              if (orderNo) {
                const result = await window.deepink.subscription.checkOrder(orderNo)
                if (result.success && result.status === 'paid') {
                  stopOrderPolling()
                  onSuccess?.()
                  onClose()
                }
              }
            }}
          >
            我已完成支付
          </button>
        </div>
      </div>
    </div>
  )
}
