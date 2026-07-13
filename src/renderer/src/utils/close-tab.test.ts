import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAgentStore } from '../stores/agent-store'
import { useTabStore } from '../stores/tab-store'
import { closeTabWithDraftPolicy } from './close-tab'

beforeEach(() => {
  vi.restoreAllMocks()
  useAgentStore.setState(useAgentStore.getInitialState(), true)
  useTabStore.setState({
    tabs: [{ id: 'browser', type: 'browser', title: '浏览器', icon: '🌐' }],
    activeTabId: 'browser',
  })
  vi.stubGlobal('window', {
    deepink: {
      dialog: {
        showMessageBox: vi.fn().mockResolvedValue({ response: 0 }),
      },
      terminal: {
        recordLifecycleEvent: vi.fn().mockResolvedValue({ success: true }),
      },
    },
  })
})

describe('closeTabWithDraftPolicy conversation lifecycle', () => {
  it('关闭本地工作会话 Tab 只关闭视图，不删除会话', async () => {
    const conversationId = useAgentStore.getState().createConversation({
      surface: 'workbench-tab',
      runtime: {
        location: 'local',
        transport: 'local',
        backend: 'deepink-agent',
      },
    })
    useAgentStore.getState().addUserMessage('保留这条消息', conversationId)

    useTabStore.getState().openTab({
      type: 'conversation',
      title: '工作会话',
      icon: '🤖',
      conversation: {
        surface: 'workbench-tab',
        runtime: {
          location: 'local',
          transport: 'local',
          backend: 'deepink-agent',
        },
        sessionId: conversationId,
      },
    })
    const tabId = useTabStore.getState().activeTabId!

    await closeTabWithDraftPolicy(tabId)

    expect(useTabStore.getState().tabs.some((tab) => tab.id === tabId)).toBe(false)
    expect(useAgentStore.getState().conversations[conversationId]).toBeDefined()
    expect(useAgentStore.getState().conversations[conversationId].messages.at(-1)?.rawText).toBe(
      '保留这条消息',
    )
  })

  it('关闭旧 CCLink 会话 Tab 只关闭视图', async () => {
    useTabStore.getState().openTab({
      type: 'cclink',
      title: '旧远程会话',
      icon: '🔗',
      cclinkSessionId: 'remote-session-1',
    })
    const tabId = useTabStore.getState().activeTabId!

    await closeTabWithDraftPolicy(tabId)

    expect(useTabStore.getState().tabs.some((tab) => tab.id === tabId)).toBe(false)
    expect(useTabStore.getState().activeTabId).toBe('browser')
  })
})

describe('closeTabWithDraftPolicy terminal lifecycle', () => {
  it('关闭 idle Terminal Tab 不弹确认', async () => {
    const runtime = {
      location: 'local' as const,
      transport: 'local' as const,
      backend: 'local-shell' as const,
      workspaceRef: { kind: 'local' as const, path: '/workspace' },
      cwd: '/workspace',
    }

    useTabStore.getState().openTab({
      type: 'terminal',
      title: 'Terminal',
      icon: '⌨️',
      terminal: {
        runtime,
        permissionPolicy: {
          mode: 'ask-risky-command',
          requireConfirmationFor: ['write', 'destructive', 'privileged', 'unknown'],
        },
        status: 'idle',
        closePolicy: 'terminate-process',
        sessionId: 'terminal-idle',
      },
    })
    const tabId = useTabStore.getState().activeTabId!

    await closeTabWithDraftPolicy(tabId)

    expect(window.deepink.dialog.showMessageBox).not.toHaveBeenCalled()
    expect(window.deepink.terminal.recordLifecycleEvent).toHaveBeenCalledWith({
      terminalSessionId: 'terminal-idle',
      workspaceKey: '/workspace',
      kind: 'closed',
      message: 'Terminal 视图已关闭',
      runtime,
    })
    expect(useTabStore.getState().tabs.some((tab) => tab.id === tabId)).toBe(false)
  })

  it('关闭 running Terminal Tab 需要确认终止语义', async () => {
    const runtime = {
      location: 'remote' as const,
      transport: 'cclink' as const,
      backend: 'remote-shell' as const,
      workspaceRef: {
        kind: 'remote' as const,
        transport: 'cclink' as const,
        endpointId: 'agent-1',
        workspaceId: 'agent-1:/workspace',
        path: '/workspace',
      },
      cwd: '/workspace',
    }

    useTabStore.getState().openTab({
      type: 'terminal',
      title: 'Terminal',
      icon: '⌨️',
      terminal: {
        runtime,
        permissionPolicy: {
          mode: 'ask-every-command',
          requireConfirmationFor: ['read', 'write', 'network', 'destructive', 'privileged', 'unknown'],
        },
        status: 'running',
        closePolicy: 'terminate-process',
        sessionId: 'terminal-running',
      },
    })
    const tabId = useTabStore.getState().activeTabId!

    await closeTabWithDraftPolicy(tabId)

    expect(window.deepink.dialog.showMessageBox).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'warning',
        title: '结束 Terminal',
        buttons: ['结束并关闭', '取消'],
      }),
    )
    expect(window.deepink.terminal.recordLifecycleEvent).toHaveBeenCalledWith({
      terminalSessionId: 'terminal-running',
      workspaceKey: 'cclink://agent-1/agent-1%3A%2Fworkspace',
      kind: 'terminated',
      message: 'Terminal 关闭时请求结束进程',
      runtime,
    })
    expect(useTabStore.getState().tabs.some((tab) => tab.id === tabId)).toBe(false)
  })

  it('取消关闭 running Terminal Tab 会保留 Tab', async () => {
    vi.mocked(window.deepink.dialog.showMessageBox).mockResolvedValueOnce({ response: 1 })
    useTabStore.getState().openTab({
      type: 'terminal',
      title: 'Terminal',
      icon: '⌨️',
      terminal: {
        runtime: {
          location: 'local',
          transport: 'local',
          backend: 'local-shell',
          workspaceRef: { kind: 'local', path: '/workspace' },
          cwd: '/workspace',
        },
        permissionPolicy: {
          mode: 'ask-risky-command',
          requireConfirmationFor: ['write', 'destructive', 'privileged', 'unknown'],
        },
        status: 'running',
        closePolicy: 'terminate-process',
        sessionId: 'terminal-cancel',
      },
    })
    const tabId = useTabStore.getState().activeTabId!

    await closeTabWithDraftPolicy(tabId)

    expect(useTabStore.getState().tabs.some((tab) => tab.id === tabId)).toBe(true)
    expect(window.deepink.terminal.recordLifecycleEvent).not.toHaveBeenCalled()
  })
})
