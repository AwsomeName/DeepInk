import { app, safeStorage } from 'electron'
import { dirname, join } from 'node:path'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { GitBackupError } from './git-backup-error'

interface SecretCrypto {
  isEncryptionAvailable(): boolean
  encryptString(value: string): Buffer
  decryptString(value: Buffer): string
}

interface GitBackupSecretState {
  version: 1
  githubToken: string
}

function parseState(value: unknown): GitBackupSecretState {
  if (!value || typeof value !== 'object') {
    throw new GitBackupError('AUTHENTICATION_FAILED', 'Git 备份凭证文件格式无效')
  }
  const state = value as Partial<GitBackupSecretState>
  if (state.version !== 1 || typeof state.githubToken !== 'string') {
    throw new GitBackupError('AUTHENTICATION_FAILED', 'Git 备份凭证文件格式无效')
  }
  return { version: 1, githubToken: state.githubToken }
}

export class GitBackupCredentialStore {
  private readonly filePath: string
  private readonly crypto: SecretCrypto
  private token: string | null = null
  private loaded = false

  constructor(filename = 'git-backup/secrets.enc', crypto: SecretCrypto = safeStorage) {
    this.filePath = join(app.getPath('userData'), filename)
    this.crypto = crypto
  }

  async load(): Promise<void> {
    try {
      const encrypted = await readFile(this.filePath, 'utf-8')
      if (!this.crypto.isEncryptionAvailable()) {
        throw new GitBackupError(
          'ENCRYPTION_UNAVAILABLE',
          '本机加密存储不可用，无法读取 Git 备份凭证',
        )
      }
      const plaintext = this.crypto.decryptString(Buffer.from(encrypted, 'base64'))
      this.token = parseState(JSON.parse(plaintext)).githubToken || null
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        this.token = null
      } else if (error instanceof GitBackupError) {
        throw error
      } else {
        throw new GitBackupError(
          'AUTHENTICATION_FAILED',
          'Git 备份凭证读取失败',
          undefined,
          error instanceof Error ? { cause: error } : undefined,
        )
      }
    } finally {
      this.loaded = true
    }
  }

  async hasToken(): Promise<boolean> {
    await this.ensureLoaded()
    return Boolean(this.token)
  }

  async getToken(): Promise<string | null> {
    await this.ensureLoaded()
    return this.token
  }

  async saveToken(token: string): Promise<void> {
    const normalized = token.trim()
    if (!normalized || normalized.length > 2048) {
      throw new GitBackupError('INVALID_INPUT', '请输入有效的 GitHub Token')
    }
    if (!this.crypto.isEncryptionAvailable()) {
      throw new GitBackupError('ENCRYPTION_UNAVAILABLE', '本机加密存储不可用，拒绝明文保存 Token')
    }
    const state: GitBackupSecretState = { version: 1, githubToken: normalized }
    await mkdir(dirname(this.filePath), { recursive: true })
    const encrypted = this.crypto.encryptString(JSON.stringify(state))
    await writeFile(this.filePath, encrypted.toString('base64'), { encoding: 'utf-8', mode: 0o600 })
    this.token = normalized
    this.loaded = true
  }

  async clear(): Promise<void> {
    this.token = null
    this.loaded = true
    await rm(this.filePath, { force: true })
  }

  private async ensureLoaded(): Promise<void> {
    if (!this.loaded) await this.load()
  }
}
