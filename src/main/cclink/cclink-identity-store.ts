import { app, safeStorage } from 'electron'
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { ChatccIdentity } from '../../shared/chatcc'

export class CclinkIdentityStore {
  private identity: ChatccIdentity | null = null
  private readonly userDataPath: string
  private readonly filePath: string

  constructor() {
    this.userDataPath = app.getPath('userData')
    this.filePath = join(this.userDataPath, 'cclink-identity.json')
  }

  async load(): Promise<void> {
    if (!existsSync(this.userDataPath)) {
      mkdirSync(this.userDataPath, { recursive: true })
    }
    if (!existsSync(this.filePath)) return

    try {
      const raw = readFileSync(this.filePath, 'utf-8')
      if (!safeStorage.isEncryptionAvailable()) {
        this.identity = null
        this.removePersistedIdentity('safeStorage 不可用，已移除本地 CCLink identity')
        return
      }

      try {
        const plaintext = safeStorage.decryptString(Buffer.from(raw, 'base64'))
        this.identity = JSON.parse(plaintext) as ChatccIdentity
      } catch (decryptError) {
        const legacyPlaintextIdentity = parseIdentity(raw)
        if (!legacyPlaintextIdentity) throw decryptError
        console.warn('[CCLink] 检测到旧版明文 identity，正在迁移为加密存储')
        await this.save(legacyPlaintextIdentity)
      }
    } catch (err) {
      console.warn('[CCLink] 加载 identity 失败:', (err as Error).message)
      this.identity = null
      this.removePersistedIdentity('已移除无法读取的 CCLink identity')
    }
  }

  get(): ChatccIdentity | null {
    return this.identity
  }

  async save(identity: ChatccIdentity): Promise<void> {
    if (!existsSync(this.userDataPath)) {
      mkdirSync(this.userDataPath, { recursive: true })
    }

    if (!safeStorage.isEncryptionAvailable()) {
      this.identity = null
      this.removePersistedIdentity('safeStorage 不可用，拒绝明文保存 CCLink identity')
      throw new Error('系统安全存储不可用，已拒绝明文保存 CCLink identity')
    }

    const encrypted = safeStorage.encryptString(JSON.stringify(identity))
    writeFileSync(this.filePath, encrypted.toString('base64'), 'utf-8')
    this.identity = identity
  }

  async clear(): Promise<void> {
    this.identity = null
    try {
      if (existsSync(this.filePath)) unlinkSync(this.filePath)
    } catch (err) {
      console.warn('[CCLink] 清除 identity 失败:', (err as Error).message)
    }
  }

  private removePersistedIdentity(reason: string): void {
    try {
      if (!existsSync(this.filePath)) return
      unlinkSync(this.filePath)
      console.warn(`[CCLink] ${reason}`)
    } catch (err) {
      console.warn('[CCLink] 移除 identity 文件失败:', (err as Error).message)
    }
  }
}

function parseIdentity(raw: string): ChatccIdentity | null {
  try {
    const parsed = JSON.parse(raw) as Partial<ChatccIdentity>
    if (
      typeof parsed.accountUserId !== 'string'
      || typeof parsed.clientImUserId !== 'string'
      || typeof parsed.imUserSig !== 'string'
      || typeof parsed.authToken !== 'string'
      || typeof parsed.sdkAppId !== 'number'
    ) {
      return null
    }
    return parsed as ChatccIdentity
  } catch {
    return null
  }
}
