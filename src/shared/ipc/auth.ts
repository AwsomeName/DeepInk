export interface UserProfile {
  id: string
  nickname: string
  avatarUrl: string
  phone: string | null
  loginMethod: 'phone' | 'wechat'
  lastLoginAt: number
  /** 订阅等级（冗余缓存，真相源在后端 user_subscriptions） */
  subscriptionTier?: 'free' | 'pro'
  /** 订阅到期时间（ISO 字符串） */
  subscriptionExpiresAt?: string | null
}

export interface AuthResult {
  success: boolean
  user?: UserProfile
  error?: string
}

export interface AuthSession {
  loggedIn: boolean
  user: UserProfile | null
}

export interface AuthServiceStatus {
  configured: boolean
  message?: string
}

export interface TokenRefreshResult {
  accessToken: string
  refreshToken: string
  expiresIn: number
}

export interface AuthApiContract {
  getServiceStatus: () => Promise<AuthServiceStatus>
  phoneSendCode: (phone: string) => Promise<{ success: boolean; error?: string }>
  phoneLogin: (phone: string, code: string) => Promise<AuthResult>
  checkSession: () => Promise<AuthSession>
  getProfile: () => Promise<UserProfile | null>
  logout: () => Promise<void>
  onSessionChanged: (callback: (session: AuthSession) => void) => void
}
