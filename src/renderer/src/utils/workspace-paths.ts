const RECENT_WORKSPACES_STORAGE_KEY = 'cclink-studio-recent-workspaces'
const MAX_RECENT_WORKSPACES = 8

export function normalizeWorkspacePath(path: unknown): string | null {
  if (typeof path !== 'string') return null
  const normalized = path.trim()
  return normalized.length > 0 ? normalized : null
}

export function mergeRecentWorkspacePaths(...sources: unknown[]): string[] {
  const result: string[] = []
  const push = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(push)
      return
    }
    const path = normalizeWorkspacePath(value)
    if (!path || result.includes(path)) return
    result.push(path)
  }
  sources.forEach(push)
  return result.slice(0, MAX_RECENT_WORKSPACES)
}

export function updateRecentWorkspacePaths(paths: string[], path: string): string[] {
  return mergeRecentWorkspacePaths(path, paths)
}

export function loadRecentWorkspaceFallback(): string[] {
  try {
    if (typeof localStorage === 'undefined') return []
    return mergeRecentWorkspacePaths(
      JSON.parse(localStorage.getItem(RECENT_WORKSPACES_STORAGE_KEY) ?? '[]'),
    )
  } catch {
    return []
  }
}

export function saveRecentWorkspaceFallback(paths: string[]): void {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(
      RECENT_WORKSPACES_STORAGE_KEY,
      JSON.stringify(mergeRecentWorkspacePaths(paths)),
    )
  } catch {
    // Recent-project persistence must not block the active workspace.
  }
}

export function getRecentWorkspacePaths(
  settings: {
    recentWorkspacePaths?: unknown
    lastWorkspacePath?: unknown
  },
  workspaceStatePaths: unknown[] = [],
): string[] {
  return mergeRecentWorkspacePaths(
    settings.recentWorkspacePaths,
    settings.lastWorkspacePath,
    loadRecentWorkspaceFallback(),
    workspaceStatePaths,
  )
}

export async function filterExistingWorkspacePaths(paths: string[]): Promise<string[]> {
  const result: string[] = []
  for (const path of paths) {
    if (await window.cclinkStudio.fs.isDirectory(path).catch(() => false)) result.push(path)
  }
  return result
}

export async function resolveWorkspaceCandidate(path: string): Promise<string | null> {
  const result = await window.cclinkStudio.workspaceState
    .resolveLocalWorkspace(path)
    .catch(() => ({ valid: false, workspacePath: null }))
  return result.valid ? result.workspacePath : null
}
