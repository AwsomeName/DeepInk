import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockPaths = vi.hoisted(() => ({ userDataDir: '' }))

vi.mock('electron', () => ({
  app: { getPath: () => mockPaths.userDataDir },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (value: string) => Buffer.from(`encrypted:${value}`, 'utf-8'),
    decryptString: (value: Buffer) => value.toString('utf-8').replace(/^encrypted:/, ''),
  },
}))

import { GitBackupCredentialStore } from './git-backup-credential-store'
import { GitBackupProjectStore } from './git-backup-project-store'

let tempDir = ''

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'cclink-studio-git-backup-store-'))
  mockPaths.userDataDir = tempDir
})

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true })
})

describe('GitBackupCredentialStore', () => {
  it('encrypts the token and never persists plaintext', async () => {
    const store = new GitBackupCredentialStore()
    await store.saveToken('github-secret-token')

    const raw = await readFile(join(tempDir, 'git-backup/secrets.enc'), 'utf-8')
    expect(raw).not.toContain('github-secret-token')
    expect(await new GitBackupCredentialStore().getToken()).toBe('github-secret-token')
  })

  it('refuses plaintext fallback when encryption is unavailable', async () => {
    const store = new GitBackupCredentialStore('git-backup/secrets.enc', {
      isEncryptionAvailable: () => false,
      encryptString: () => Buffer.from(''),
      decryptString: () => '',
    })
    await expect(store.saveToken('github-secret-token')).rejects.toMatchObject({
      code: 'ENCRYPTION_UNAVAILABLE',
    })
  })
})

describe('GitBackupProjectStore', () => {
  it('persists non-sensitive binding state by project id', async () => {
    const store = new GitBackupProjectStore()
    await store.set({
      projectId: 'project-1',
      remoteUrl: 'https://github.com/user/repo.git',
      repositoryLabel: 'user/repo',
      remoteName: 'cclink-backup',
      lastBackupAt: null,
    })

    expect(await new GitBackupProjectStore().get('project-1')).toMatchObject({
      remoteUrl: 'https://github.com/user/repo.git',
      repositoryLabel: 'user/repo',
    })
    const raw = await readFile(join(tempDir, 'git-backup/projects.json'), 'utf-8')
    expect(raw).not.toMatch(/token|secret/i)
  })
})
