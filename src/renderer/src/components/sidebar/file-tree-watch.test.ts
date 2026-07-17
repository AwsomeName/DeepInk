import { describe, expect, it } from 'vitest'
import { getFileTreeRefreshDirectory } from './file-tree-watch'

describe('getFileTreeRefreshDirectory', () => {
  const workspacePath = '/Users/apple/project'

  it('ignores project state writes that would otherwise refresh the tree continuously', () => {
    expect(
      getFileTreeRefreshDirectory(workspacePath, {
        watchId: 'watch-1',
        event: 'add',
        filePath: `${workspacePath}/.cclink-studio/state/local-owner.json.tmp`,
      }),
    ).toBeNull()
    expect(
      getFileTreeRefreshDirectory(workspacePath, {
        watchId: 'watch-1',
        event: 'change',
        filePath: `${workspacePath}/.git/index`,
      }),
    ).toBeNull()
  })

  it('refreshes only the changed entry parent directory', () => {
    expect(
      getFileTreeRefreshDirectory(workspacePath, {
        watchId: 'watch-1',
        event: 'add',
        filePath: `${workspacePath}/docs/new.md`,
      }),
    ).toBe(`${workspacePath}/docs`)
  })

  it('rejects events outside the active workspace', () => {
    expect(
      getFileTreeRefreshDirectory(workspacePath, {
        watchId: 'watch-1',
        event: 'add',
        filePath: '/Users/apple/other/file.md',
      }),
    ).toBeNull()
  })
})
