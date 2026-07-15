import type { WorkspaceStateSnapshot } from '@shared/ipc/workspace-state'
import { useAgentStore } from '../stores/agent-store'
import { useBrowserStore } from '../stores/browser-store'
import { useEditorStore } from '../stores/editor-store'
import { useTabStore } from '../stores/tab-store'
import {
  beginWorkspaceStateRestore,
  endWorkspaceStateRestore,
  persistWorkspaceSection,
} from './workspace-state'

function isWorkspaceTab(tab: ReturnType<typeof useTabStore.getState>['tabs'][number]): boolean {
  return tab.type !== 'settings'
}

export function hydrateRuntimeSections(snapshot: WorkspaceStateSnapshot | null): void {
  const sections = snapshot?.sections ?? {}
  beginWorkspaceStateRestore()
  try {
    useBrowserStore.getState().hydrateFromWorkspaceState(sections.browserTabs ?? { tabs: {} })
    useTabStore.getState().hydrateFromWorkspaceState(sections.tabs ?? { tabs: [], activeTabId: null })
    useEditorStore.getState().hydrateFromWorkspaceState(sections.editorDrafts ?? { files: {} })
    useAgentStore.getState().hydrateFromWorkspaceState(sections.agentConversations ?? {
      conversations: {},
      conversationOrder: [],
      activeConversationId: null,
    })
  } finally {
    endWorkspaceStateRestore()
  }
}

export function persistRuntimeSections(workspaceKey?: string | null): void {
  const tabState = useTabStore.getState()
  const workspaceTabs = tabState.tabs.filter(isWorkspaceTab)
  const activeTabId = tabState.activeTabId && workspaceTabs.some((tab) => tab.id === tabState.activeTabId)
    ? tabState.activeTabId
    : workspaceTabs[0]?.id ?? null

  const agentState = useAgentStore.getState()

  persistWorkspaceSection('tabs', { tabs: workspaceTabs, activeTabId }, workspaceKey)
  persistWorkspaceSection('browserTabs', { tabs: useBrowserStore.getState().tabs }, workspaceKey)
  persistWorkspaceSection('editorDrafts', { files: useEditorStore.getState().files }, workspaceKey)
  persistWorkspaceSection('agentConversations', {
    conversations: agentState.conversations,
    conversationOrder: agentState.conversationOrder,
    activeConversationId: agentState.activeConversationId,
  }, workspaceKey)
}
