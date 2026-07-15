import { existsSync, readFileSync, writeFileSync } from 'fs'
import { mkdtemp, rm } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChatccIdentity } from '../../shared/chatcc'

const mockElectron = vi.hoisted(() => ({
  userDataDir: '',
  encryptionAvailable: true,
}))

vi.mock('electron', () => ({
  app: {
    getPath: () => mockElectron.userDataDir,
  },
  safeStorage: {
    isEncryptionAvailable: () => mockElectron.encryptionAvailable,
    encryptString: (value: string) => Buffer.from(`encrypted:${value}`, 'utf-8'),
    decryptString: (value: Buffer) => {
      const raw = value.toString('utf-8')
      if (!raw.startsWith('encrypted:')) {
        throw new Error('decrypt failed')
      }
      return raw.slice('encrypted:'.length)
    },
  },
}))

import { CclinkIdentityStore } from './cclink-identity-store'

const identity: ChatccIdentity = {
  accountUserId: 'account-1',
  imUserId: 'im-1',
  clientImUserId: 'client-1',
  imUserSig: 'sig-secret',
  authToken: 'auth-secret',
  sdkAppId: 12345,
  deviceId: 'device-1',
  deviceName: 'Mac',
  updatedAt: 1783526400000,
}

let tempDir = ''

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'deepink-cclink-identity-store-'))
  mockElectron.userDataDir = tempDir
  mockElectron.encryptionAvailable = true
})

afterEach(async () => {
  vi.restoreAllMocks()
  if (tempDir) await rm(tempDir, { recursive: true, force: true })
})

describe('CclinkIdentityStore', () => {
  it('saves identity only through safeStorage encryption', async () => {
    const store = new CclinkIdentityStore()

    await store.save(identity)

    const raw = readFileSync(join(tempDir, 'cclink-identity.json'), 'utf-8')
    expect(raw).not.toContain('sig-secret')
    expect(raw).not.toContain('auth-secret')

    const reloaded = new CclinkIdentityStore()
    await reloaded.load()
    expect(reloaded.get()).toMatchObject({
      accountUserId: 'account-1',
      imUserSig: 'sig-secret',
      authToken: 'auth-secret',
    })
  })

  it('refuses to write plaintext identity when safeStorage is unavailable', async () => {
    mockElectron.encryptionAvailable = false
    const store = new CclinkIdentityStore()

    await expect(store.save(identity)).rejects.toThrow('拒绝明文保存')

    expect(store.get()).toBeNull()
    expect(existsSync(join(tempDir, 'cclink-identity.json'))).toBe(false)
  })

  it('migrates a legacy plaintext identity to encrypted storage when safeStorage is available', async () => {
    writeFileSync(join(tempDir, 'cclink-identity.json'), JSON.stringify(identity), 'utf-8')
    const store = new CclinkIdentityStore()

    await store.load()

    expect(store.get()).toMatchObject({ authToken: 'auth-secret' })
    const raw = readFileSync(join(tempDir, 'cclink-identity.json'), 'utf-8')
    expect(raw).not.toContain('sig-secret')
    expect(raw).not.toContain('auth-secret')
  })

  it('removes a legacy plaintext identity when safeStorage is unavailable', async () => {
    writeFileSync(join(tempDir, 'cclink-identity.json'), JSON.stringify(identity), 'utf-8')
    mockElectron.encryptionAvailable = false
    const store = new CclinkIdentityStore()

    await store.load()

    expect(store.get()).toBeNull()
    expect(existsSync(join(tempDir, 'cclink-identity.json'))).toBe(false)
  })
})
