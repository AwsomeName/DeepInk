import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  filterExistingWorkspacePaths,
  getRecentWorkspacePaths,
  mergeRecentWorkspacePaths,
  resolveWorkspaceCandidate,
  saveRecentWorkspaceFallback,
} from './workspace-paths'

describe('workspace paths', () => {
  const storage = new Map<string, string>()

  beforeEach(() => {
    storage.clear()
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => storage.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => storage.set(key, value)),
    })
    vi.stubGlobal('window', {
      cclinkStudio: {
        fs: {
          isDirectory: vi.fn(async (path: string) => path !== '/missing'),
        },
        workspaceState: {
          resolveLocalWorkspace: vi.fn(async (path: string) => ({
            valid: path !== '/invalid',
            workspacePath: path === '/canonical/..' ? '/canonical' : path,
          })),
        },
      },
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('normalizes, de-duplicates, and bounds recent workspace paths', () => {
    expect(
      mergeRecentWorkspacePaths([' /one ', '/two', '', null], '/one', [
        '/three',
        '/four',
        '/five',
        '/six',
        '/seven',
        '/eight',
        '/nine',
      ]),
    ).toEqual(['/one', '/two', '/three', '/four', '/five', '/six', '/seven', '/eight'])
  })

  it('merges settings, fallback, and persisted workspace state in priority order', () => {
    saveRecentWorkspaceFallback(['/fallback', '/duplicate'])

    expect(
      getRecentWorkspacePaths(
        {
          recentWorkspacePaths: ['/settings', '/duplicate'],
          lastWorkspacePath: '/last',
        },
        ['/persisted'],
      ),
    ).toEqual(['/settings', '/duplicate', '/last', '/fallback', '/persisted'])
  })

  it('filters missing paths and returns only validated canonical candidates', async () => {
    await expect(filterExistingWorkspacePaths(['/exists', '/missing'])).resolves.toEqual([
      '/exists',
    ])
    await expect(resolveWorkspaceCandidate('/canonical/..')).resolves.toBe('/canonical')
    await expect(resolveWorkspaceCandidate('/invalid')).resolves.toBeNull()
  })
})
