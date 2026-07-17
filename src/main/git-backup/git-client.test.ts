import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const execFileAsync = promisify(execFile)
const mockPaths = vi.hoisted(() => ({ userDataDir: '' }))

vi.mock('electron', () => ({
  app: { getPath: () => mockPaths.userDataDir },
}))

import { GitClient } from './git-client'
import { GitExecutor } from './git-executor'

let tempDir = ''

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'cclink-studio-git-client-'))
  mockPaths.userDataDir = tempDir
})

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true })
})

describe('GitClient', () => {
  it('initializes, commits and pushes to a local bare remote', async () => {
    const workspacePath = join(tempDir, 'workspace')
    const remotePath = join(tempDir, 'remote.git')
    await Promise.all([mkdir(workspacePath), execFileAsync('git', ['init', '--bare', remotePath])])

    const client = new GitClient(
      new GitExecutor({ askPassDirectory: join(tempDir, 'askpass'), timeoutMs: 20_000 }),
    )
    expect((await client.detect()).available).toBe(true)
    await client.initialize(workspacePath)
    await client.ensureLocalExcludes(workspacePath)
    await writeFile(join(workspacePath, 'README.md'), '# backup\n', 'utf-8')
    expect(await client.hasChanges(workspacePath)).toBe(true)
    await client.stageAll(workspacePath)
    await client.commit(workspacePath, 'CCLink backup test')
    await client.setRemote(workspacePath, 'cclink-backup', remotePath)
    await client.push(workspacePath, 'cclink-backup', await client.currentBranch(workspacePath))

    const { stdout } = await execFileAsync('git', [
      '--git-dir',
      remotePath,
      'show',
      'refs/heads/main:README.md',
    ])
    expect(stdout).toBe('# backup\n')
  })
})
