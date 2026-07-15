import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorkspaceStateSnapshot } from '@shared/ipc/workspace-state'
import { useAgentStore } from './agent-store'
import { useBrowserStore } from './browser-store'
import { useEditorStore } from './editor-store'
import { useFsStore } from './fs-store'
import { useTabStore } from './tab-store'
import { useWorkspaceStore } from './workspace-store'
import { setWorkspaceStateOwnerKey, setWorkspaceStatePath } from '../utils/workspace-state'

function snapshot(
  workspaceKey: string | null,
  sections: Record<string, unknown>,
): WorkspaceStateSnapshot {
  return {
    version: 1,
    workspaceId: workspaceKey ?? 'global',
    ownerKey: null,
    workspaceKey,
    workspacePath: workspaceKey,
    sections,
    updatedAt: Date.now(),
  }
}

describe('fs-store workspace switching', () => {
  beforeEach(() => {
    vi.stubGlobal('window', {
      deepink: {
        fs: {
          readDir: vi.fn().mockResolvedValue([]),
        },
        workspaceState: {
          get: vi.fn(),
          setSection: vi.fn().mockResolvedValue({ success: true }),
        },
        settings: {
          set: vi.fn().mockResolvedValue({ success: true }),
        },
      },
    })
    useAgentStore.setState(useAgentStore.getInitialState(), true)
    useBrowserStore.setState(useBrowserStore.getInitialState(), true)
    useEditorStore.setState(useEditorStore.getInitialState(), true)
    useFsStore.setState(useFsStore.getInitialState(), true)
    useTabStore.setState(useTabStore.getInitialState(), true)
    useWorkspaceStore.setState(useWorkspaceStore.getInitialState(), true)
    setWorkspaceStatePath(null)
    setWorkspaceStateOwnerKey('local:owner-1')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    setWorkspaceStatePath(null)
    setWorkspaceStateOwnerKey(null)
  })

  it('re-enters a local project with the owner-scoped conversation snapshot', async () => {
    const workspacePath = '/Users/apple/project'
    const conversationId = 'agent-project-session'
    const ownerSnapshot = snapshot(workspacePath, {
      agentConversations: {
        conversations: {
          [conversationId]: {
            id: conversationId,
            title: '项目会话',
            surface: 'assistant-panel',
            runtime: {
              location: 'local',
              transport: 'local',
              backend: 'deepink-agent',
              workspaceRef: { kind: 'local', path: workspacePath },
            },
            messages: [
              {
                id: 'msg-1',
                role: 'user',
                content: [{ type: 'text', text: '恢复项目里的这条消息' }],
                rawText: '恢复项目里的这条消息',
                timestamp: 1,
              },
            ],
            input: '',
            loading: false,
            backendState: 'connected',
            sessionId: 'claude-session-1',
            streamingMessageId: null,
            lastCost: null,
            scope: { kind: 'all' },
            mountedResources: [],
            mountedSkills: [],
            createdAt: 1,
            updatedAt: 2,
            archivedAt: null,
          },
        },
        conversationOrder: [conversationId],
        activeConversationId: conversationId,
      },
      tabs: { tabs: [], activeTabId: null },
      browserTabs: { tabs: {} },
      editorDrafts: { files: {} },
      fileTree: { expandedPaths: [], selectedPath: null },
    })

    const getWorkspaceState = window.deepink.workspaceState.get as ReturnType<typeof vi.fn>
    getWorkspaceState.mockImplementation((key: string | null, ownerKey?: string | null) => {
      if (key === workspacePath && ownerKey === 'local:owner-1') {
        return Promise.resolve(ownerSnapshot)
      }
      return Promise.resolve(snapshot(key, {}))
    })

    await useFsStore.getState().openRecentWorkspace(workspacePath)

    expect(getWorkspaceState).toHaveBeenCalledWith(workspacePath, 'local:owner-1')
    expect(useWorkspaceStore.getState().activeWorkspaceRef).toEqual({
      kind: 'local',
      path: workspacePath,
    })
    expect(useAgentStore.getState().activeConversationId).toBe(conversationId)
    expect(useAgentStore.getState().messages.at(-1)?.rawText).toBe('恢复项目里的这条消息')
  })
})
