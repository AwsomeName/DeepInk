/**
 * TokenManager — Token 加密持久化管理
 *
 * 使用 Electron safeStorage（macOS Keychain）加密存储 JWT token。
 * 用户资料明文缓存到 user.json 以加速启动显示。
 *
 * 文件位置：~/Library/Application Support/DeepInk/
 *   - auth.json  → 加密的 accessToken + refreshToken + 过期时间
 *   - user.json  → 明文缓存的用户资料
 */

import { safeStorage, app } from 'electron'
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'fs'
import { join } from 'path'
import type { UserProfile } from '../../shared/ipc/auth'
export type { UserProfile } from '../../shared/ipc/auth'

/** 加密存储的 token 数据 */
interface TokenData {
  accessToken: string
  refreshToken: string
  /** access token 过期时间（Unix 时间戳，毫秒） */
  expiresAt: number
}

export class TokenManager {
  private accessToken: string | null = null
  private refreshToken: string | null = null
  private accessTokenExpiry: number | null = null
  private userProfile: UserProfile | null = null

  private readonly userDataPath: string
  private readonly authFilePath: string
  private readonly userFilePath: string

  constructor() {
    this.userDataPath = app.getPath('userData')
    this.authFilePath = join(this.userDataPath, 'auth.json')
    this.userFilePath = join(this.userDataPath, 'user.json')
  }

  // ─── 生命周期 ────────────────────────────────────

  /**
   * 启动时加载已保存的 token 和用户资料
   * 从磁盘解密 token，读取用户缓存
   */
  async load(): Promise<void> {
    // 确保 userData 目录存在
    if (!existsSync(this.userDataPath)) {
      mkdirSync(this.userDataPath, { recursive: true })
    }

    // 加载加密 token
    if (existsSync(this.authFilePath)) {
      try {
        const encryptedBase64 = readFileSync(this.authFilePath, 'utf-8')
        const buffer = Buffer.from(encryptedBase64, 'base64')

        if (safeStorage.isEncryptionAvailable()) {
          const plaintext = safeStorage.decryptString(buffer)
          const data: TokenData = JSON.parse(plaintext)
          this.accessToken = data.accessToken
          this.refreshToken = data.refreshToken
          this.accessTokenExpiry = data.expiresAt
        }
      } catch (err) {
        console.error('[Auth] 加载 token 失败:', err)
        this.clearTokens()
      }
    }

    // 加载用户资料缓存
    if (existsSync(this.userFilePath)) {
      try {
        const raw = readFileSync(this.userFilePath, 'utf-8')
        this.userProfile = JSON.parse(raw)
      } catch {
        this.userProfile = null
      }
    }
  }

  // ─── Token 操作 ─────────────────────────────────

  /**
   * 保存 token（加密写入磁盘）
   */
  async saveTokens(accessToken: string, refreshToken: string, expiresIn: number): Promise<void> {
    this.accessToken = accessToken
    this.refreshToken = refreshToken
    this.accessTokenExpiry = Date.now() + expiresIn * 1000

    const data: TokenData = {
      accessToken,
      refreshToken,
      expiresAt: this.accessTokenExpiry,
    }

    if (safeStorage.isEncryptionAvailable()) {
      const plaintext = JSON.stringify(data)
      const encrypted = safeStorage.encryptString(plaintext)
      writeFileSync(this.authFilePath, encrypted.toString('base64'), 'utf-8')
    } else {
      // 开发环境 fallback（不加密，仅用于调试）
      console.warn('[Auth] safeStorage 不可用，token 将以明文存储')
      writeFileSync(this.authFilePath, JSON.stringify(data, null, 2), 'utf-8')
    }
  }

  /**
   * 保存用户资料（明文缓存）
   */
  saveUserProfile(user: UserProfile): void {
    this.userProfile = user
    writeFileSync(this.userFilePath, JSON.stringify(user, null, 2), 'utf-8')
  }

  /**
   * 获取有效的 access token
   * 如果 access token 过期但 refresh token 存在，会尝试刷新
   * @returns 有效的 access token，或 null（需要重新登录）
   */
  async getValidAccessToken(): Promise<string | null> {
    // access token 仍然有效
    if (this.accessToken && this.accessTokenExpiry && Date.now() < this.accessTokenExpiry) {
      return this.accessToken
    }

    // access token 过期，但有 refresh token → 尝试刷新
    if (this.refreshToken) {
      return null // 实际刷新由 AuthService 调用后端完成
    }

    return null
  }

  /**
   * 清除所有本地数据（登出时调用）
   */
  async clear(): Promise<void> {
    this.clearTokens()
    this.userProfile = null

    // 删除磁盘文件
    try {
      if (existsSync(this.authFilePath)) unlinkSync(this.authFilePath)
      if (existsSync(this.userFilePath)) unlinkSync(this.userFilePath)
    } catch (err) {
      console.error('[Auth] 清除文件失败:', err)
    }
  }

  // ─── Getter ─────────────────────────────────────

  /** 获取当前 refresh token（用于后端登出请求） */
  getRefreshToken(): string | null {
    return this.refreshToken
  }

  /** 获取缓存的用户资料 */
  getUserProfile(): UserProfile | null {
    return this.userProfile
  }

  /** 检查是否有 refresh token（粗略判断是否登录过） */
  hasRefreshToken(): boolean {
    return this.refreshToken !== null
  }

  // ─── 内部方法 ───────────────────────────────────

  private clearTokens(): void {
    this.accessToken = null
    this.refreshToken = null
    this.accessTokenExpiry = null
  }
}
