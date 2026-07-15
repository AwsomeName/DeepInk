import { app, safeStorage } from 'electron'
import { dirname, join } from 'node:path'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { DataSourceError } from './errors'
import type { DataSourceSecret } from './types'

interface SecretCrypto {
  isEncryptionAvailable(): boolean
  encryptString(value: string): Buffer
  decryptString(value: Buffer): string
}

interface DataSourceCredentialStoreState {
  version: 1
  secrets: Record<string, DataSourceSecret>
}

const EMPTY_STATE: DataSourceCredentialStoreState = {
  version: 1,
  secrets: {},
}

function isDataSourceSecret(value: unknown): value is DataSourceSecret {
  if (!value || typeof value !== 'object') return false
  const secret = value as Partial<DataSourceSecret>
  return (
    typeof secret.sourceId === 'string' &&
    (secret.authType === 'apiKey' ||
      secret.authType === 'basic' ||
      secret.authType === 'bearer' ||
      secret.authType === 'none')
  )
}

export class DataSourceCredentialStore {
  private readonly filePath: string
  private readonly crypto: SecretCrypto
  private state: DataSourceCredentialStoreState = { ...EMPTY_STATE, secrets: {} }
  private loaded = false

  constructor(filename = 'data-source/secrets.enc', crypto: SecretCrypto = safeStorage) {
    this.filePath = join(app.getPath('userData'), filename)
    this.crypto = crypto
  }

  async load(): Promise<void> {
    try {
      const encryptedBase64 = await readFile(this.filePath, 'utf-8')
      if (!this.crypto.isEncryptionAvailable()) {
        throw new DataSourceError(
          'DATA_SOURCE_SECRET_ENCRYPTION_UNAVAILABLE',
          '本机加密存储不可用，无法加载数据源凭证',
        )
      }
      const plaintext = this.crypto.decryptString(Buffer.from(encryptedBase64, 'base64'))
      const parsed = JSON.parse(plaintext) as Partial<DataSourceCredentialStoreState>
      const secrets: Record<string, DataSourceSecret> = {}
      if (parsed.secrets && typeof parsed.secrets === 'object') {
        for (const [sourceId, secret] of Object.entries(parsed.secrets)) {
          if (isDataSourceSecret(secret)) secrets[sourceId] = { ...secret, sourceId }
        }
      }
      this.state = { version: 1, secrets }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.warn('[DataSourceCredentialStore] 加载失败:', (error as Error).message)
      }
      this.state = { ...EMPTY_STATE, secrets: {} }
    }
    this.loaded = true
  }

  async saveSecret(secret: DataSourceSecret): Promise<void> {
    await this.ensureLoaded()
    this.state.secrets[secret.sourceId] = { ...secret }
    await this.save()
  }

  async getSecret(sourceId: string): Promise<DataSourceSecret | null> {
    await this.ensureLoaded()
    const secret = this.state.secrets[sourceId]
    return secret ? { ...secret } : null
  }

  async removeSecret(sourceId: string): Promise<void> {
    await this.ensureLoaded()
    delete this.state.secrets[sourceId]
    await this.save()
  }

  async clear(): Promise<void> {
    this.state = { ...EMPTY_STATE, secrets: {} }
    this.loaded = true
    await rm(this.filePath, { force: true })
  }

  private async ensureLoaded(): Promise<void> {
    if (!this.loaded) await this.load()
  }

  private async save(): Promise<void> {
    if (!this.crypto.isEncryptionAvailable()) {
      throw new DataSourceError(
        'DATA_SOURCE_SECRET_ENCRYPTION_UNAVAILABLE',
        '本机加密存储不可用，拒绝明文保存数据源凭证',
      )
    }
    await mkdir(dirname(this.filePath), { recursive: true })
    const encrypted = this.crypto.encryptString(JSON.stringify(this.state))
    await writeFile(this.filePath, encrypted.toString('base64'), 'utf-8')
  }
}
