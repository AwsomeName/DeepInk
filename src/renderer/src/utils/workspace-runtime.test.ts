import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAgentStore } from '../stores/agent-store'
import { useBrowserStore } from '../stores/browser-store'
import { useEditorStore } from '../stores/editor-store'
import { useTabStore } from '../stores/tab-store'
import { hydrateRuntimeSections, persistRuntimeSections } from './workspace-runtime'

beforeEach(() => {
  vi.stubGlobal('window', {
    cclinkStudio: {
      workspaceState: {
        setSection: vi.fn().mockResolvedValue({ success: true }),
      },
    },
  })
  vi.stubGlobal('localStorage', {
    getItem: vi.fn().mockReturnValue(null),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
  })
  useTabStore.setState(useTabStore.getInitialState(), true)
  useBrowserStore.setState(useBrowserStore.getInitialState(), true)
  useEditorStore.setState(useEditorStore.getInitialState(), true)
  useAgentStore.setState(useAgentStore.getInitialState(), true)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('workspace-runtime', () => {
  it('保存和恢复工作空间运行态时，项目 Tab 与工作会话跟随工作空间快照切换', () => {
    const conversationId = useAgentStore.getState().createConversation({
      surface: 'workbench-tab',
      runtime: {
        location: 'local',
        transport: 'local',
        backend: 'cclink-studio-agent',
      },
      activate: false,
    })
    useTabStore.getState().openTab({
      type: 'conversation',
      title: '工作会话',
      icon: '🤖',
      conversation: {
        surface: 'workbench-tab',
        runtime: {
          location: 'local',
          transport: 'local',
          backend: 'cclink-studio-agent',
        },
        sessionId: conversationId,
      },
    })
    useTabStore.getState().openTab({ type: 'settings', title: '设置', icon: '⚙️' })

    persistRuntimeSections('/workspace/a')

    const setSection = window.cclinkStudio.workspaceState.setSection as ReturnType<typeof vi.fn>
    const tabsPayload = setSection.mock.calls.find((call) => call[1] === 'tabs')?.[2]
    const agentPayload = setSection.mock.calls.find((call) => call[1] === 'agentConversations')?.[2]

    expect(tabsPayload.tabs.map((tab: { type: string }) => tab.type)).toEqual(['conversation'])
    expect(agentPayload.conversations[conversationId].surface).toBe('workbench-tab')

    hydrateRuntimeSections({
      version: 1,
      workspaceId: '/workspace/b',
      ownerKey: null,
      workspaceKey: '/workspace/b',
      workspacePath: '/workspace/b',
      sections: {
        tabs: {
          tabs: [{ id: 'browser-b', type: 'browser', title: 'B', icon: '🌐' }],
          activeTabId: 'browser-b',
        },
        browserTabs: { tabs: {} },
        editorDrafts: { files: {} },
        agentConversations: {
          conversations: {},
          conversationOrder: [],
          activeConversationId: null,
        },
      },
      updatedAt: Date.now(),
    })

    expect(useTabStore.getState().tabs.map((tab) => tab.type)).toEqual(['settings', 'browser'])
    expect(useTabStore.getState().tabs.some((tab) => tab.id === 'browser-b')).toBe(true)
    expect(useTabStore.getState().activeTabId).toBe(
      useTabStore.getState().tabs.find((tab) => tab.type === 'settings')?.id,
    )
  })

  it('hydrate 期间不触发 store 订阅持久化，避免恢复中间态写回', () => {
    const setSection = window.cclinkStudio.workspaceState.setSection as ReturnType<typeof vi.fn>
    setSection.mockClear()

    hydrateRuntimeSections({
      version: 1,
      workspaceId: '/workspace/restored',
      ownerKey: null,
      workspaceKey: '/workspace/restored',
      workspacePath: '/workspace/restored',
      sections: {
        tabs: {
          tabs: [{ id: 'browser-restored', type: 'browser', title: 'Restored', icon: '🌐' }],
          activeTabId: 'browser-restored',
        },
        browserTabs: {
          tabs: {
            'browser-restored': {
              url: 'https://example.com',
              urlInput: 'https://example.com',
              viewMode: 'desktop',
              zoomMode: 'fit',
              zoomFactor: 1,
              history: ['https://example.com'],
              historyIndex: 0,
              ready: false,
            },
          },
        },
        editorDrafts: { files: {} },
        agentConversations: {
          conversations: {},
          conversationOrder: [],
          activeConversationId: null,
        },
      },
      updatedAt: Date.now(),
    })

    expect(setSection).not.toHaveBeenCalled()
  })

  it('runtime store 只写 WorkspaceState，不再写全局 localStorage 镜像', () => {
    const setSection = window.cclinkStudio.workspaceState.setSection as ReturnType<typeof vi.fn>
    const setLocalStorage = localStorage.setItem as ReturnType<typeof vi.fn>
    setSection.mockClear()
    setLocalStorage.mockClear()

    useBrowserStore.getState().ensureTab('browser-a', 'https://example.com')
    useTabStore.getState().openTab({ type: 'browser', title: '浏览器', icon: '🌐' })
    useEditorStore.getState().initVirtualFile('virtual:draft', 'draft')
    useAgentStore.getState().createConversation({ activate: true })

    expect(setSection.mock.calls.map((call) => call[1])).toEqual(
      expect.arrayContaining(['browserTabs', 'tabs', 'editorDrafts', 'agentConversations']),
    )
    expect(setLocalStorage).not.toHaveBeenCalled()
  })
})
