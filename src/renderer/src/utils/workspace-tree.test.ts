import { describe, expect, it, vi } from 'vitest'
import { prepareWorkspaceTree } from './workspace-tree'

describe('workspace tree projection', () => {
  const readDir = vi.fn(async (path: string) => [
    {
      name: 'docs',
      path: `${path}/docs`,
      type: 'directory' as const,
      size: 0,
      modifiedAt: 1,
    },
  ])

  it('does not inherit file-tree selection from a different workspace', async () => {
    const projection = await prepareWorkspaceTree(
      '/workspace/b',
      undefined,
      {
        workspacePath: '/workspace/a',
        expandedPaths: ['/workspace/a/docs'],
        selectedPath: '/workspace/a/note.md',
      },
      readDir,
    )

    expect(projection.expandedPaths).toEqual([])
    expect(projection.selectedPath).toBeNull()
    expect(projection.tree).toEqual([
      expect.objectContaining({ path: '/workspace/b/docs', expanded: false }),
    ])
  })

  it('restores the target workspace file-tree projection', async () => {
    const projection = await prepareWorkspaceTree(
      '/workspace/b',
      {
        expandedPaths: ['/workspace/b/docs'],
        selectedPath: '/workspace/b/note.md',
      },
      {
        workspacePath: '/workspace/a',
        expandedPaths: [],
        selectedPath: null,
      },
      readDir,
    )

    expect(projection.expandedPaths).toEqual(['/workspace/b/docs'])
    expect(projection.selectedPath).toBe('/workspace/b/note.md')
    expect(projection.tree[0]?.expanded).toBe(true)
  })
})
