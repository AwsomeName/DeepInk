/**
 * Auth IPC — 认证相关 IPC 通道注册
 *
 * 遵循项目现有 IPC 模式（参考 browser-ipc.ts / agent-ipc.ts）：
 * - ipcMain.handle 用于请求-响应模式
 * - webContents.send 用于主→渲染进程事件推送
 */

import { ipcMain, BrowserWindow } from 'electron'
import { TokenManager } from './token-manager'
import { AuthService } from './auth-service'
import type { UserProfile } from '../../shared/ipc/auth'

function mergeUserProfile(fresh: UserProfile, cached: UserProfile | null): UserProfile {
  if (!cached) return fresh
  const sameKnownUser = fresh.id !== 'unknown-user' && cached.id !== 'unknown-user' && fresh.id === cached.id
  return {
    ...fresh,
    id: fresh.id || cached.id,
    nickname: fresh.nickname || (sameKnownUser ? cached.nickname : ''),
    avatarUrl: fresh.avatarUrl || (sameKnownUser ? cached.avatarUrl : ''),
    phone: fresh.phone,
    loginMethod: fresh.loginMethod || cached.loginMethod,
    lastLoginAt: fresh.lastLoginAt || cached.lastLoginAt,
    subscriptionTier: fresh.subscriptionTier || cached.subscriptionTier,
    subscriptionExpiresAt: fresh.subscriptionExpiresAt ?? cached.subscriptionExpiresAt,
  }
}

/**
 * 注册所有认证相关 IPC 通道
 *
 * @param mainWindow 主窗口实例
 * @param tokenManager Token 管理器
 * @param authService 认证服务客户端
 */
export function registerAuthIpc(
  mainWindow: BrowserWindow,
  tokenManager: TokenManager,
  authService: AuthService,
): void {
  // ─── 手机号登录 ─────────────────────────────────

  ipcMain.handle('auth:getServiceStatus', () => {
    return {
      configured: authService.isConfigured(),
      message: authService.isConfigured()
        ? undefined
        : 'DeepInk 私有服务未配置。开源版不会内置产品服务地址；如需登录，请设置 DEEPINK_API_URL。',
    }
  })

  ipcMain.handle('auth:phoneSendCode', async (_event, phone: string) => {
    if (!phone || !/^1[3-9]\d{9}$/.test(phone)) {
      return { success: false, error: '请输入有效的手机号' }
    }
    return authService.sendSmsCode(phone)
  })

  ipcMain.handle('auth:phoneLogin', async (_event, phone: string, code: string) => {
    try {
      const result = await authService.verifyPhoneCode(phone, code) as any
      if (result.success && result.user) {
        await tokenManager.saveTokens(result.accessToken, result.refreshToken, result.expiresIn)
        tokenManager.saveUserProfile(result.user)

        if (!mainWindow.isDestroyed()) {
          mainWindow.webContents.send('auth:sessionChanged', {
            loggedIn: true,
            user: result.user,
          })
        }

        return { success: true, user: result.user }
      }
      return { success: false, error: result.error || '登录失败' }
    } catch (err) {
      console.error('[Auth] 手机号登录失败:', err)
      return { success: false, error: '登录失败，请重试' }
    }
  })

  // ─── Session 管理 ──────────────────────────────────

  ipcMain.handle('auth:checkSession', async () => {
    const accessToken = await tokenManager.getValidAccessToken()
    const refreshToken = tokenManager.getRefreshToken()

    if (accessToken) {
      const cachedUser = tokenManager.getUserProfile()
      try {
        const freshUser = await authService.getMe(accessToken)
        if (freshUser) {
          const mergedUser = mergeUserProfile(freshUser, cachedUser)
          tokenManager.saveUserProfile(mergedUser)
          if (!mainWindow.isDestroyed()) {
            mainWindow.webContents.send('auth:sessionChanged', {
              loggedIn: true,
              user: mergedUser,
            })
          }
          return { loggedIn: true, user: mergedUser }
        }
      } catch {
        // 网络错误，使用缓存。
      }
      return { loggedIn: true, user: cachedUser }
    }

    if (refreshToken) {
      // access token 过期，尝试刷新
      try {
        const tokens = await authService.refreshTokens(refreshToken)
        await tokenManager.saveTokens(tokens.accessToken, tokens.refreshToken, tokens.expiresIn)

        // 刷新成功后必须重新获取用户信息，不能直接复用本地缓存。
        const cachedUser = tokenManager.getUserProfile()
        const freshUser = await authService.getMe(tokens.accessToken)
        if (freshUser) {
          const mergedUser = mergeUserProfile(freshUser, cachedUser)
          tokenManager.saveUserProfile(mergedUser)
          return { loggedIn: true, user: mergedUser }
        }
      } catch {
        // 刷新失败，需要重新登录
      }
    }

    return { loggedIn: false, user: null }
  })

  ipcMain.handle('auth:getProfile', () => {
    return tokenManager.getUserProfile()
  })

  ipcMain.handle('auth:logout', async () => {
    const refreshToken = tokenManager.getRefreshToken()

    // 登出必须优先清除本地 session；后端吊销是尽力而为，不能阻塞 UI。
    await tokenManager.clear()

    // 通知渲染进程
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('auth:sessionChanged', {
        loggedIn: false,
        user: null,
      })
    }

    void authService.logout(refreshToken).catch((err) => {
      console.warn('[Auth] 后端登出通知失败:', err instanceof Error ? err.message : err)
    })
  })

  console.log('[DeepInk] Auth IPC 已注册')
}
