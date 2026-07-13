import type { DeepInkRuntimeState } from './app-runtime'

export async function refreshAccessToken(runtime: DeepInkRuntimeState): Promise<string | null> {
  if (!runtime.tokenManager || !runtime.authService) return null

  const refreshToken = runtime.tokenManager.getRefreshToken()
  if (!refreshToken) return null

  try {
    const tokens = await runtime.authService.refreshTokens(refreshToken)
    await runtime.tokenManager.saveTokens(tokens.accessToken, tokens.refreshToken, tokens.expiresIn)
    const freshUser = await runtime.authService.getMe(tokens.accessToken)
    if (freshUser) {
      runtime.tokenManager.saveUserProfile(freshUser)
    }
    return tokens.accessToken
  } catch (error) {
    console.warn('[Auth] access token 刷新失败:', error instanceof Error ? error.message : error)
    return null
  }
}
