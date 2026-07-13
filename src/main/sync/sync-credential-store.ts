/**
 * SyncCredentialStore — WebDAV 密码加密持久化
 *
 * 复用 TokenManager 的 safeStorage 模式。
 * 支持多个 configId → password 映射（为多云盘预留）。
 *
 * 文件位置：~/Library/Application Support/DeepInk/sync-credentials.json
 */

import { safeStorage, app } from 'electron'
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'fs'
import { join } from 'path'

export class SyncCredentialStore {
  /** configId → 明文密码（内存缓存） */
  private passwords: Map<string, string> = new Map()

  private readonly userDataPath: string
  private readonly filePath: string

  constructor() {
    this.userDataPath = app.getPath('userData')
    this.filePath = join(this.userDataPath, 'sync-credentials.json')
  }

  // ─── 生命周期 ────────────────────────────────────

  /** 启动时从磁盘加载并解密所有密码 */
  async load(): Promise<void> {
    if (!existsSync(this.userDataPath)) {
      mkdirSync(this.userDataPath, { recursive: true })
    }

    if (!existsSync(this.filePath)) return

    try {
      const encryptedBase64 = readFileSync(this.filePath, 'utf-8')

      if (safeStorage.isEncryptionAvailable()) {
        const buffer = Buffer.from(encryptedBase64, 'base64')
        const plaintext = safeStorage.decryptString(buffer)
        const data: Record<string, string> = JSON.parse(plaintext)
        for (const [id, password] of Object.entries(data)) {
          this.passwords.set(id, password)
        }
      } else {
        console.warn('[Sync] safeStorage 不可用，跳过凭据加载')
      }
    } catch (err) {
      console.error('[Sync] 加载凭据失败:', err)
    }
  }

  // ─── 密码操作 ────────────────────────────────────

  /** 保存密码（加密写入磁盘） */
  async savePassword(configId: string, password: string): Promise<void> {
    this.passwords.set(configId, password)
    await this.persist()
  }

  /** 获取密码（从内存缓存读取） */
  async getPassword(configId: string): Promise<string | null> {
    return this.passwords.get(configId) ?? null
  }

  /** 删除指定配置的密码 */
  async removePassword(configId: string): Promise<void> {
    this.passwords.delete(configId)
    await this.persist()
  }

  /** 清除所有凭据 */
  async clear(): Promise<void> {
    this.passwords.clear()
    try {
      if (existsSync(this.filePath)) unlinkSync(this.filePath)
    } catch (err) {
      console.error('[Sync] 清除凭据文件失败:', err)
    }
  }

  // ─── 内部方法 ────────────────────────────────────

  /** 将内存中的密码 Map 加密写入磁盘 */
  private async persist(): Promise<void> {
    const data: Record<string, string> = {}
    for (const [id, password] of this.passwords) {
      data[id] = password
    }

    if (safeStorage.isEncryptionAvailable()) {
      const plaintext = JSON.stringify(data)
      const encrypted = safeStorage.encryptString(plaintext)
      writeFileSync(this.filePath, encrypted.toString('base64'), 'utf-8')
    } else {
      console.warn('[Sync] safeStorage 不可用，凭据将以明文存储')
      writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf-8')
    }
  }
}
