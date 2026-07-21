import type { FsDirEntry } from '../../../shared/ipc/fs'

export interface FileTreeNode {
  name: string
  path: string
  type: 'directory' | 'file'
  extension?: string
  children?: FileTreeNode[]
  expanded?: boolean
  loading?: boolean
}

export interface WorkspaceTreeProjection {
  path: string
  tree: FileTreeNode[]
  expandedPaths: string[]
  selectedPath: string | null
}

export function normalizeFileTreeState(
  value: unknown,
): { expandedPaths: string[]; selectedPath: string | null } | null {
  if (!value || typeof value !== 'object') return null
  const parsed = value as { expandedPaths?: string[]; selectedPath?: string | null }
  return {
    expandedPaths: Array.isArray(parsed.expandedPaths) ? parsed.expandedPaths.filter(Boolean) : [],
    selectedPath: parsed.selectedPath ?? null,
  }
}

export async function prepareWorkspaceTree(
  path: string,
  restoredFileTree: unknown,
  current: {
    workspacePath: string | null
    expandedPaths: string[]
    selectedPath: string | null
  },
  readDir: (path: string) => Promise<FsDirEntry[]> = (targetPath) =>
    window.cclinkStudio.fs.readDir(targetPath),
): Promise<WorkspaceTreeProjection> {
  const restored = normalizeFileTreeState(restoredFileTree)
  const sameWorkspace = current.workspacePath === path
  const expandedPaths = restored?.expandedPaths ?? (sameWorkspace ? current.expandedPaths : [])
  const selectedPath = restored?.selectedPath ?? (sameWorkspace ? current.selectedPath : null)
  const expandedSet = new Set(expandedPaths)
  const entries = await readDir(path)

  return {
    path,
    expandedPaths,
    selectedPath,
    tree: entries.map((entry) => ({
      name: entry.name,
      path: entry.path,
      type: entry.type,
      extension: entry.extension,
      children: undefined,
      expanded: expandedSet.has(entry.path),
    })),
  }
}
