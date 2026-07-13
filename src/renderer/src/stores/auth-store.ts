/**
 * Auth Store — 认证状态管理
 *
 * 管理登录状态、用户资料、登录表单数据。
 * 遵循项目现有 Zustand store 模式（参考 agent-store.ts）。
 */

import { create } from 'zustand'
import type { UserProfile } from '../types'

interface AuthState {
  /** 是否已登录 */
  loggedIn: boolean
  /** 当前用户资料 */
  user: UserProfile | null
  /** 是否正在检查登录状态（启动时为 true） */
  checking: boolean
  /** 手机号输入 */
  phoneInput: string
  /** 验证码输入 */
  codeInput: string
  /** 验证码发送冷却倒计时（秒） */
  codeCountdown: number
  /** 是否正在请求中 */
  loading: boolean
  /** 错误信息 */
  error: string | null

  // --- Actions ---
  /** 设置登录状态（checkSession / 登录成功 / 登出时调用） */
  setLoggedIn: (loggedIn: boolean, user: UserProfile | null) => void
  /** 设置 checking 状态 */
  setChecking: (checking: boolean) => void
  /** 设置手机号 */
  setPhoneInput: (phone: string) => void
  /** 设置验证码 */
  setCodeInput: (code: string) => void
  /** 设置倒计时 */
  setCodeCountdown: (seconds: number) => void
  /** 设置 loading */
  setLoading: (loading: boolean) => void
  /** 设置错误信息 */
  setError: (error: string | null) => void
  /** 重置表单状态 */
  resetForm: () => void
  /** 跳过登录（开发模式，使用测试账号直接进入） */
  skipLogin: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  loggedIn: false,
  user: null,
  checking: true,
  phoneInput: '',
  codeInput: '',
  codeCountdown: 0,
  loading: false,
  error: null,

  setLoggedIn: (loggedIn, user) =>
    set({ loggedIn, user, checking: false, loading: false, error: null }),

  setChecking: (checking) => set({ checking }),

  setPhoneInput: (phoneInput) => set({ phoneInput }),

  setCodeInput: (codeInput) => set({ codeInput }),

  setCodeCountdown: (codeCountdown) => set({ codeCountdown }),

  setLoading: (loading) => set({ loading }),

  setError: (error) => set({ error, loading: false }),

  resetForm: () =>
    set({ phoneInput: '', codeInput: '', codeCountdown: 0, error: null, loading: false }),

  skipLogin: () =>
    set({
      loggedIn: true,
      checking: false,
      loading: false,
      user: {
        id: 'dev-user-001',
        nickname: '开发者',
        avatarUrl: '',
        phone: null,
        loginMethod: 'phone',
        lastLoginAt: Date.now(),
      },
    }),
}))
