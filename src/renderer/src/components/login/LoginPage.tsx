/**
 * LoginPage — 登录页
 *
 * 全屏登录界面，手机号验证码登录。
 * 不显示 Activity Bar / Sidebar，独立的居中布局。
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuthStore } from '../../stores/auth-store'
import './LoginPage.css'

function LoginPage(): React.ReactElement {
  const phoneInput = useAuthStore((s) => s.phoneInput)
  const codeInput = useAuthStore((s) => s.codeInput)
  const codeCountdown = useAuthStore((s) => s.codeCountdown)
  const loading = useAuthStore((s) => s.loading)
  const error = useAuthStore((s) => s.error)
  const [serviceConfigured, setServiceConfigured] = useState(true)

  const setPhoneInput = useAuthStore((s) => s.setPhoneInput)
  const setCodeInput = useAuthStore((s) => s.setCodeInput)
  const setCodeCountdown = useAuthStore((s) => s.setCodeCountdown)
  const setLoading = useAuthStore((s) => s.setLoading)
  const setError = useAuthStore((s) => s.setError)

  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    window.deepink.auth.getServiceStatus()
      .then((status) => {
        setServiceConfigured(status.configured)
        if (!status.configured) {
          setError(status.message || '登录服务未配置')
        }
      })
      .catch(() => {
        setServiceConfigured(false)
        setError('登录服务状态不可用')
      })
  }, [setError])

  // 验证码倒计时
  useEffect(() => {
    if (codeCountdown > 0) {
      countdownRef.current = setInterval(() => {
        const current = useAuthStore.getState().codeCountdown
        if (current <= 1) {
          setCodeCountdown(0)
          if (countdownRef.current) clearInterval(countdownRef.current)
        } else {
          setCodeCountdown(current - 1)
        }
      }, 1000)
    }
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current)
    }
  }, [codeCountdown, setCodeCountdown])

  // 发送验证码
  const handleSendCode = useCallback(async () => {
    if (!phoneInput || !/^1[3-9]\d{9}$/.test(phoneInput)) {
      setError('请输入正确的 11 位手机号')
      return
    }
    if (!serviceConfigured) {
      setError('登录服务未配置，请设置 DEEPINK_API_URL')
      return
    }
    if (codeCountdown > 0) return

    setLoading(true)
    setError(null)
    try {
      const result = await window.deepink.auth.phoneSendCode(phoneInput)
      if (result.success) {
        setCodeCountdown(60)
      } else {
        setError(result.error || '发送验证码失败')
      }
    } catch {
      setError('网络错误，请检查网络连接')
    } finally {
      setLoading(false)
    }
  }, [phoneInput, codeCountdown, serviceConfigured, setLoading, setError, setCodeCountdown])

  // 手机号登录
  const handlePhoneLogin = useCallback(async () => {
    if (!phoneInput || !/^1[3-9]\d{9}$/.test(phoneInput)) {
      setError('请输入正确的 11 位手机号')
      return
    }
    if (!codeInput || codeInput.length < 4) {
      setError('请输入验证码')
      return
    }
    if (!serviceConfigured) {
      setError('登录服务未配置，请设置 DEEPINK_API_URL')
      return
    }

    setLoading(true)
    setError(null)
    try {
      const result = await window.deepink.auth.phoneLogin(phoneInput, codeInput)
      if (!result.success) {
        setError(result.error || '登录失败')
      }
    } catch {
      setError('网络错误，请检查网络连接')
    }
    // finally 不需要 setLoading(false)，因为 setLoggedIn 会重置 loading
  }, [phoneInput, codeInput, serviceConfigured, setLoading, setError])

  return (
    <div className="login-page">
      <div className="login-card">
        {/* Logo + 标题 */}
        <div className="login-header">
          <div className="login-logo">
            <svg width="56" height="56" viewBox="0 0 48 48" fill="none">
              <rect width="48" height="48" rx="12" fill="#0078d4" />
              <path
                d="M14 24C14 18.477 18.477 14 24 14V14C29.523 14 34 18.477 34 24V34H24C18.477 34 14 29.523 14 24V24Z"
                fill="white"
                fillOpacity="0.9"
              />
              <circle cx="24" cy="24" r="4" fill="#0078d4" />
            </svg>
          </div>
          <h1 className="login-title">DeepInk</h1>
          <p className="login-subtitle">AI 驱动的桌面助手</p>
        </div>

        {/* 登录表单 */}
        <div className="login-body">
          <div className="login-phone">
            {/* 手机号输入 */}
            <div className="login-field">
              <div className="login-field-prefix">+86</div>
              <input
                type="tel"
                className="login-input"
                placeholder="请输入手机号"
                maxLength={11}
                value={phoneInput}
                onChange={(e) => setPhoneInput(e.target.value.replace(/\D/g, ''))}
                disabled={loading || !serviceConfigured}
              />
            </div>

            {/* 验证码输入 */}
            <div className="login-field">
              <input
                type="text"
                className="login-input"
                placeholder="请输入验证码"
                maxLength={6}
                value={codeInput}
                onChange={(e) => setCodeInput(e.target.value.replace(/\D/g, ''))}
                disabled={loading || !serviceConfigured}
              />
              <button
                className="login-code-btn"
                onClick={handleSendCode}
                disabled={!serviceConfigured || loading || codeCountdown > 0 || phoneInput.length !== 11}
              >
                {codeCountdown > 0 ? `${codeCountdown}s` : '获取验证码'}
              </button>
            </div>

            {/* 登录按钮 */}
            <button
              className="login-btn login-btn-primary"
              onClick={handlePhoneLogin}
              disabled={!serviceConfigured || loading || !phoneInput || !codeInput}
            >
              {loading ? '登录中...' : '登录'}
            </button>
          </div>

          {/* 错误提示 */}
          {error && <div className="login-error">{error}</div>}
        </div>

        {/* 底部协议 */}
        <div className="login-footer">
          登录即表示同意 <a href="#" onClick={(e) => e.preventDefault()}>《服务条款》</a> 和 <a href="#" onClick={(e) => e.preventDefault()}>《隐私政策》</a>
        </div>

        {/* 跳过登录（开发模式） */}
        <button
          className="login-skip-btn"
          onClick={() => useAuthStore.getState().skipLogin()}
        >
          跳过登录（开发模式）
        </button>
      </div>
    </div>
  )
}

export default LoginPage
