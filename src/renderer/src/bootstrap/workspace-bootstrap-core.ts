import type { AppSettings } from '@shared/ipc/settings'
import type { WorkspaceStateSnapshot } from '@shared/ipc/workspace-state'

export interface WorkspaceBootstrapDeps {
  getSettings: () => Promise<AppSettings | null>
  getWorkspaceState: (workspacePath?: string | null) => Promise<WorkspaceStateSnapshot>
  setWorkspacePath: (workspacePath: string | null) => void
  beginRestore: () => void
  endRestore: () => void
  hydrateLayout: (value: unknown) => void
  hydrateBrowserTabs: (value: unknown) => void
  hydrateTabs: (value: unknown) => void
  hydrateEditorDrafts: (value: unknown) => void
  hydrateAgentConversations: (value: unknown) => void
  initWorkspace: () => Promise<void>
  warn: (message: string, error: unknown) => void
}

/** 恢复 main process 持久化的工作台状态；作为纯函数便于无 DOM 单测。 */
export async function restoreWorkspaceState(deps: WorkspaceBootstrapDeps): Promise<void> {
  try {
    const settings = await deps.getSettings().catch(() => null)
    const workspacePath = settings?.lastWorkspacePath || null
    deps.setWorkspacePath(workspacePath)

    const snapshot = await deps.getWorkspaceState(workspacePath)
    const sections = snapshot.sections
    deps.beginRestore()
    deps.hydrateLayout(sections.layout)
    deps.hydrateBrowserTabs(sections.browserTabs ?? { tabs: {} })
    deps.hydrateTabs(sections.tabs ?? { tabs: [], activeTabId: null })
    deps.hydrateEditorDrafts(sections.editorDrafts ?? { files: {} })
    deps.hydrateAgentConversations(
      sections.agentConversations ?? {
        conversations: {},
        conversationOrder: [],
        activeConversationId: null,
      },
    )
  } catch (error) {
    deps.warn('[WorkspaceBootstrap] 全局工作台状态恢复失败:', error)
  } finally {
    deps.endRestore()
  }

  try {
    await deps.initWorkspace()
  } catch (error) {
    deps.warn('[WorkspaceBootstrap] 工作区恢复失败:', error)
  }
}
