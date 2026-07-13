import type { AppSettings } from '@shared/ipc/settings'
import type { WorkspaceStateSnapshot } from '@shared/ipc/workspace-state'

export interface WorkspaceBootstrapDeps {
  getSettings: () => Promise<AppSettings | null>
  getWorkspaceState: (workspacePath?: string | null) => Promise<WorkspaceStateSnapshot>
  setWorkspacePath: (workspacePath: string | null) => void
  hydrateLayout: (value: unknown) => void
  hydrateBrowserTabs: (value: unknown) => void
  hydrateTabs: (value: unknown) => void
  hydrateEditorDrafts: (value: unknown) => void
  hydrateAgentConversations: (value: unknown) => void
  initWorkspace: () => Promise<void>
  warn: (message: string, error: unknown) => void
}

function hasSections(snapshot: WorkspaceStateSnapshot | null): snapshot is WorkspaceStateSnapshot {
  return Boolean(snapshot && Object.keys(snapshot.sections).length > 0)
}

/** 恢复 main process 持久化的工作台状态；作为纯函数便于无 DOM 单测。 */
export async function restoreWorkspaceState(deps: WorkspaceBootstrapDeps): Promise<void> {
  try {
    const settings = await deps.getSettings().catch(() => null)
    const workspacePath = settings?.lastWorkspacePath || null
    deps.setWorkspacePath(workspacePath)

    let snapshot = await deps.getWorkspaceState(workspacePath)
    if (workspacePath && !hasSections(snapshot)) {
      const globalSnapshot = await deps.getWorkspaceState(null).catch(() => null)
      if (hasSections(globalSnapshot)) {
        snapshot = globalSnapshot
      }
    }

    const sections = snapshot.sections
    deps.hydrateLayout(sections.layout)
    deps.hydrateBrowserTabs(sections.browserTabs)
    deps.hydrateTabs(sections.tabs)
    deps.hydrateEditorDrafts(sections.editorDrafts)
    deps.hydrateAgentConversations(sections.agentConversations)
  } catch (error) {
    deps.warn('[WorkspaceBootstrap] 全局工作台状态恢复失败:', error)
  }

  try {
    await deps.initWorkspace()
  } catch (error) {
    deps.warn('[WorkspaceBootstrap] 工作区恢复失败:', error)
  }
}
