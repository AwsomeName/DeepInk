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
      if (safeStorage.isEncryptionAvailable()) {
        const plaintext = safeStorage.decryptString(Buffer.from(raw, 'base64'))
        this.identity = JSON.parse(plaintext) as ChatccIdentity
      } else {
        this.identity = JSON.parse(raw) as ChatccIdentity
      }
    } catch (err) {
      console.warn('[CCLink] 加载 identity 失败:', (err as Error).message)
      this.identity = null
    }
  }

  get(): ChatccIdentity | null {
    return this.identity
  }

  async save(identity: ChatccIdentity): Promise<void> {
    this.identity = identity
    if (!existsSync(this.userDataPath)) {
      mkdirSync(this.userDataPath, { recursive: true })
    }

    if (safeStorage.isEncryptionAvailable()) {
      const encrypted = safeStorage.encryptString(JSON.stringify(identity))
      writeFileSync(this.filePath, encrypted.toString('base64'), 'utf-8')
    } else {
      console.warn('[CCLink] safeStorage 不可用，identity 将以明文存储')
      writeFileSync(this.filePath, JSON.stringify(identity, null, 2), 'utf-8')
    }
  }

  async clear(): Promise<void> {
    this.identity = null
    try {
      if (existsSync(this.filePath)) unlinkSync(this.filePath)
    } catch (err) {
      console.warn('[CCLink] 清除 identity 失败:', (err as Error).message)
    }
  }
}
