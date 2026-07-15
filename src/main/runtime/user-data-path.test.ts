import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { configureFixedUserDataPath, getUserDataMigrationDiagnostics } from './user-data-path'

describe('configureFixedUserDataPath', () => {
  let tempDir = ''

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'deepink-user-data-'))
  })

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true })
    }
  })

  it('pins userData to the fixed DeepInk app data directory and migrates whitelisted state files', async () => {
    const appData = join(tempDir, 'Application Support')
    const legacyUserData = join(appData, 'Electron')
    await mkdir(join(legacyUserData, 'cache-dir'), { recursive: true })
    await writeFile(join(legacyUserData, 'settings.json'), '{"lastWorkspacePath":"/workspace"}')
    await writeFile(join(legacyUserData, 'cache-dir', 'cache.bin'), 'cache')
    await writeFile(join(legacyUserData, 'random.txt'), 'not app state')

    const setName = vi.fn()
    const setPath = vi.fn()
    const app = {
      getPath: vi.fn((name: string) => {
        if (name === 'appData') return appData
        if (name === 'userData') return legacyUserData
        throw new Error(`unexpected path: ${name}`)
      }),
      setName,
      setPath,
    }

    const fixedPath = configureFixedUserDataPath(app as never)

    expect(fixedPath).toBe(join(appData, 'DeepInk'))
    expect(setName).toHaveBeenCalledWith('DeepInk')
    expect(setPath).toHaveBeenCalledWith('userData', join(appData, 'DeepInk'))
    expect(existsSync(join(appData, 'DeepInk', 'settings.json'))).toBe(true)
    expect(existsSync(join(appData, 'DeepInk', 'cache-dir'))).toBe(false)
    expect(existsSync(join(appData, 'DeepInk', 'random.txt'))).toBe(false)
    expect(getUserDataMigrationDiagnostics()?.fixedUserDataPath).toBe(join(appData, 'DeepInk'))
    expect(getUserDataMigrationDiagnostics()?.candidates[0]?.migrated).toContain('settings.json')
  })

  it('also migrates settings from known historical app data directories', async () => {
    const appData = join(tempDir, 'Application Support')
    const electronUserData = join(appData, 'Electron')
    const historicalUserData = join(appData, 'deepink')
    await mkdir(electronUserData, { recursive: true })
    await mkdir(historicalUserData, { recursive: true })
    await writeFile(
      join(historicalUserData, 'settings.json'),
      '{"recentWorkspacePaths":["/old/project"]}',
    )

    const app = {
      getPath: vi.fn((name: string) => {
        if (name === 'appData') return appData
        if (name === 'userData') return electronUserData
        throw new Error(`unexpected path: ${name}`)
      }),
      setName: vi.fn(),
      setPath: vi.fn(),
    }

    configureFixedUserDataPath(app as never)

    expect(existsSync(join(appData, 'DeepInk', 'settings.json'))).toBe(true)
  })

  it('repairs an already-created empty fixed settings file from legacy settings', async () => {
    const appData = join(tempDir, 'Application Support')
    const electronUserData = join(appData, 'Electron')
    const fixedUserData = join(appData, 'DeepInk')
    await mkdir(electronUserData, { recursive: true })
    await mkdir(fixedUserData, { recursive: true })
    await writeFile(
      join(electronUserData, 'settings.json'),
      '{"lastWorkspacePath":"/workspace","recentWorkspacePaths":["/workspace","/older"]}',
    )
    await writeFile(
      join(electronUserData, 'workspace-state.json'),
      '{"version":1,"workspaces":{"abc":{"workspaceId":"abc"}}}',
    )
    await writeFile(
      join(fixedUserData, 'settings.json'),
      '{"lastWorkspacePath":"","recentWorkspacePaths":[]}',
    )
    await writeFile(join(fixedUserData, 'workspace-state.json'), '{"version":1,"workspaces":{}}')

    const app = {
      getPath: vi.fn((name: string) => {
        if (name === 'appData') return appData
        if (name === 'userData') return electronUserData
        throw new Error(`unexpected path: ${name}`)
      }),
      setName: vi.fn(),
      setPath: vi.fn(),
    }

    configureFixedUserDataPath(app as never)

    const settings = JSON.parse(await readFile(join(fixedUserData, 'settings.json'), 'utf-8'))
    const workspaceState = JSON.parse(await readFile(join(fixedUserData, 'workspace-state.json'), 'utf-8'))
    expect(settings.lastWorkspacePath).toBe('/workspace')
    expect(settings.recentWorkspacePaths).toEqual(['/workspace', '/older'])
    expect(Object.keys(workspaceState.workspaces)).toEqual(['abc'])
  })

  it('backfills missing recent workspaces even when fixed settings already has a last workspace', async () => {
    const appData = join(tempDir, 'Application Support')
    const legacyUserData = join(appData, 'Electron')
    const fixedUserData = join(appData, 'DeepInk')
    await mkdir(legacyUserData, { recursive: true })
    await mkdir(fixedUserData, { recursive: true })
    await writeFile(
      join(legacyUserData, 'settings.json'),
      '{"lastWorkspacePath":"/old/current","recentWorkspacePaths":["/old/current","/old/next"]}',
    )
    await writeFile(
      join(fixedUserData, 'settings.json'),
      '{"lastWorkspacePath":"/new/current","recentWorkspacePaths":[]}',
    )

    const app = {
      getPath: vi.fn((name: string) => {
        if (name === 'appData') return appData
        if (name === 'userData') return fixedUserData
        throw new Error(`unexpected path: ${name}`)
      }),
      setName: vi.fn(),
      setPath: vi.fn(),
    }

    configureFixedUserDataPath(app as never)

    const settings = JSON.parse(await readFile(join(fixedUserData, 'settings.json'), 'utf-8'))
    expect(settings.lastWorkspacePath).toBe('/new/current')
    expect(settings.recentWorkspacePaths).toEqual(['/old/current', '/old/next'])
  })
})
