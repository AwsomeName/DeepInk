import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockPaths = vi.hoisted(() => ({ userDataDir: '' }))

vi.mock('electron', () => ({
  app: {
    getPath: () => mockPaths.userDataDir,
  },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (value: string) => Buffer.from(value, 'utf-8'),
    decryptString: (value: Buffer) => value.toString('utf-8'),
  },
}))

import { DataSourceConfigStore } from './config-store'
import { DataSourceCredentialStore } from './credential-store'

let tempDir = ''

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'deepink-data-source-store-'))
  mockPaths.userDataDir = tempDir
})

afterEach(async () => {
  if (tempDir) await rm(tempDir, { recursive: true, force: true })
})

describe('DataSourceConfigStore', () => {
  it('persists non-sensitive data source config', async () => {
    const store = new DataSourceConfigStore()
    await store.upsert({
      id: 'source-1',
      type: 'elasticsearch',
      scope: 'workspace',
      name: 'Articles',
      endpoint: 'https://es.example.com',
      authRef: 'data-source:source-1',
      readOnly: true,
      timeoutMs: 10000,
      maxRows: 100,
      createdAt: '2026-07-15T00:00:00.000Z',
      updatedAt: '2026-07-15T00:00:00.000Z',
    })

    const raw = await readFile(join(tempDir, 'data-source/connections.json'), 'utf-8')
    expect(raw).toContain('https://es.example.com')
    expect(raw).toContain('data-source:source-1')
    expect(raw).not.toContain('super-secret')

    const reloaded = new DataSourceConfigStore()
    expect(await reloaded.list()).toHaveLength(1)
  })
})

describe('DataSourceCredentialStore', () => {
  it('encrypts secrets and reloads them through injected crypto', async () => {
    const store = new DataSourceCredentialStore()
    await store.saveSecret({
      sourceId: 'source-1',
      authType: 'apiKey',
      apiKey: 'super-secret',
    })

    const raw = await readFile(join(tempDir, 'data-source/secrets.enc'), 'utf-8')
    expect(raw).not.toContain('super-secret')

    const reloaded = new DataSourceCredentialStore()
    expect(await reloaded.getSecret('source-1')).toMatchObject({
      sourceId: 'source-1',
      authType: 'apiKey',
      apiKey: 'super-secret',
    })
  })

  it('refuses to save secrets without encryption', async () => {
    const store = new DataSourceCredentialStore('data-source/secrets.enc', {
      isEncryptionAvailable: () => false,
      encryptString: () => Buffer.from(''),
      decryptString: () => '',
    })

    await expect(
      store.saveSecret({
        sourceId: 'source-1',
        authType: 'bearer',
        token: 'token',
      }),
    ).rejects.toMatchObject({ code: 'DATA_SOURCE_SECRET_ENCRYPTION_UNAVAILABLE' })
  })
})
