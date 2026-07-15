import { describe, it, expect, beforeEach } from 'vitest'
import { useTabStore } from './tab-store'
import { useBrowserStore } from './browser-store'
import { useEditorStore } from './editor-store'
import type { BrowserTabState } from './browser-store'

const browserTab = (overrides: Partial<BrowserTabState> = {}): BrowserTabState => ({
  url: 'https://www.baidu.com',
  urlInput: 'https://www.baidu.com',
  viewMode: 'desktop',
  zoomMode: 'fit',
  zoomFactor: 1,
  ready: true,
  history: ['https://www.baidu.com'],
  historyIndex: 0,
  ...overrides,
})

beforeEach(() => {
  useTabStore.setState({
    tabs: [{ id: 'browser', type: 'browser', title: '浏览器', icon: '🌐' }],
    activeTabId: 'browser',
  })
  useBrowserStore.setState({
    tabs: { browser: browserTab() },
  })
  useEditorStore.setState({ files: {}, pendingUpdates: [] })
})

describe('useTabStore', () => {
  describe('openTab', () => {
    it('添加新 Tab 并自动激活', () => {
      useTabStore.getState().openTab({ type: 'editor', title: 'README.md', icon: '📄' })

      const state = useTabStore.getState()
      expect(state.tabs).toHaveLength(2)
      expect(state.tabs[1].type).toBe('editor')
      expect(state.activeTabId).toBe(state.tabs[1].id)
    })

    it('相同 filePath 的 Tab 不重复创建，而是激活已有的', () => {
      useTabStore.getState().openTab({
        type: 'editor',
        title: 'README.md',
        icon: '📄',
        filePath: '/Users/test/README.md',
      })
      const firstId = useTabStore.getState().activeTabId

      useTabStore.getState().openTab({
        type: 'editor',
        title: 'README.md',
        icon: '📄',
        filePath: '/Users/test/README.md',
      })

      const state = useTabStore.getState()
      expect(state.tabs).toHaveLength(2) // browser + 1 editor
      expect(state.activeTabId).toBe(firstId)
    })

    it('browser Tab 不去重（无 forceNew 也能开多个）', () => {
      const len0 = useTabStore.getState().tabs.length
      useTabStore.getState().openTab({ type: 'browser', title: '浏览器', icon: '🌐' })
      useTabStore.getState().openTab({ type: 'browser', title: '浏览器', icon: '🌐' })
      expect(useTabStore.getState().tabs.length).toBe(len0 + 2)
    })

    it('两个未命名编辑器可共存', () => {
      useTabStore.getState().openTab({ type: 'editor', title: '未命名.md', icon: '📄' })
      useTabStore.getState().openTab({ type: 'editor', title: '未命名.md', icon: '📄' })
      expect(useTabStore.getState().tabs.filter((t) => t.type === 'editor')).toHaveLength(2)
    })

    it('settings Tab 保持单例，并更新目标设置分组', () => {
      useTabStore.getState().openTab({
        type: 'settings',
        title: '设置',
        icon: '⚙️',
        settingsSection: 'sync',
      })
      const firstSettingsId = useTabStore.getState().activeTabId

      useTabStore.getState().openTab({
        type: 'settings',
        title: '远程连接',
        icon: '⚙️',
        settingsSection: 'remote-connections',
      })

      const state = useTabStore.getState()
      const settingsTabs = state.tabs.filter((tab) => tab.type === 'settings')
      expect(settingsTabs).toHaveLength(1)
      expect(state.activeTabId).toBe(firstSettingsId)
      expect(settingsTabs[0].title).toBe('远程连接')
      expect(settingsTabs[0].settingsSection).toBe('remote-connections')
    })

    it('forceNew 绕过 filePath 去重', () => {
      useTabStore.getState().openTab({ type: 'editor', title: 'A', icon: '📄', filePath: '/x.md' })
      const len1 = useTabStore.getState().tabs.length
      useTabStore
        .getState()
        .openTab({ type: 'editor', title: 'A', icon: '📄', filePath: '/x.md', forceNew: true })
      expect(useTabStore.getState().tabs.length).toBe(len1 + 1)
    })

    it('相同 filePath 可从文本 Tab 切换为 Gerber 预览 Tab', () => {
      useTabStore.getState().openTab({
        type: 'editor',
        title: 'board.GKO',
        icon: '📄',
        filePath: '/project/board.GKO',
      })
      const firstId = useTabStore.getState().activeTabId

      useTabStore.getState().openTab({
        type: 'hardware-gerber',
        title: 'board.GKO',
        icon: '🧩',
        filePath: '/project/board.GKO',
        hardwareGerber: {
          workspacePath: '/project',
          packagePath: '/project/board.GKO',
          entry: 'board.GKO',
        },
      })

      const state = useTabStore.getState()
      expect(state.tabs).toHaveLength(2)
      expect(state.activeTabId).toBe(firstId)
      const tab = state.tabs.find((item) => item.id === firstId)!
      expect(tab.type).toBe('hardware-gerber')
      expect(tab.hardwareGerber).toEqual({
        workspacePath: '/project',
        packagePath: '/project/board.GKO',
        entry: 'board.GKO',
      })
    })

    it('conversation Tab 按远程会话去重，并兼容旧 cclink Tab', () => {
      useTabStore.getState().openTab({
        type: 'conversation',
        title: '远程会话',
        icon: '🤖',
        conversation: {
          surface: 'workbench-tab',
          runtime: {
            location: 'remote',
            transport: 'cclink',
            backend: 'deepink-agent',
          },
          sessionId: 'session-1',
        },
      })
      const firstId = useTabStore.getState().activeTabId

      useTabStore.getState().openTab({
        type: 'cclink',
        title: '旧远程会话',
        icon: '🔗',
        cclinkSessionId: 'session-1',
      })

      const state = useTabStore.getState()
      expect(state.tabs).toHaveLength(2)
      expect(state.activeTabId).toBe(firstId)
    })

    it('conversation Tab 按 transport 区分远程会话', () => {
      useTabStore.getState().openTab({
        type: 'conversation',
        title: 'CCLink 会话',
        icon: '🤖',
        conversation: {
          surface: 'workbench-tab',
          runtime: {
            location: 'remote',
            transport: 'cclink',
            backend: 'deepink-agent',
          },
          sessionId: 'session-1',
        },
      })
      useTabStore.getState().openTab({
        type: 'conversation',
        title: '直连会话',
        icon: '🤖',
        conversation: {
          surface: 'workbench-tab',
          runtime: {
            location: 'remote',
            transport: 'direct',
            backend: 'deepink-agent',
          },
          sessionId: 'session-1',
        },
      })

      const conversations = useTabStore.getState().tabs.filter((tab) => tab.type === 'conversation')
      expect(conversations).toHaveLength(2)
      expect(
        conversations.map((tab) =>
          tab.conversation && 'runtime' in tab.conversation
            ? tab.conversation.runtime.transport
            : tab.conversation?.transport,
        ),
      ).toEqual(['cclink', 'direct'])
    })

    it('本地工作会话 Tab 按 local runtime 和会话 ID 去重', () => {
      const conversation = {
        surface: 'workbench-tab' as const,
        runtime: {
          location: 'local' as const,
          transport: 'local' as const,
          backend: 'deepink-agent' as const,
        },
        sessionId: 'agent-work-1',
      }

      useTabStore.getState().openTab({
        type: 'conversation',
        title: '工作会话',
        icon: '🤖',
        conversation,
      })
      const firstId = useTabStore.getState().activeTabId
      useTabStore.getState().openTab({
        type: 'conversation',
        title: '工作会话',
        icon: '🤖',
        conversation,
      })

      expect(useTabStore.getState().tabs).toHaveLength(2)
      expect(useTabStore.getState().activeTabId).toBe(firstId)
    })

    it('数据源查询按 source、collection、Saved Query 区分去重', () => {
      useTabStore.getState().openTab({
        type: 'data-source-query',
        title: '查询 articles-*',
        icon: '🗄️',
        dataSourceQuery: { sourceId: 'source-1', collection: 'articles-*' },
      })
      const adHocId = useTabStore.getState().activeTabId

      useTabStore.getState().openTab({
        type: 'data-source-query',
        title: '查询 articles-*',
        icon: '🗄️',
        dataSourceQuery: { sourceId: 'source-1', collection: 'articles-*' },
      })
      useTabStore.getState().openTab({
        type: 'data-source-query',
        title: '最近文章',
        icon: '🗄️',
        dataSourceQuery: { sourceId: 'source-1', collection: 'articles-*', savedQueryId: 'saved-1' },
      })
      useTabStore.getState().openTab({
        type: 'data-source-query',
        title: '热门文章',
        icon: '🗄️',
        dataSourceQuery: { sourceId: 'source-1', collection: 'articles-*', savedQueryId: 'saved-2' },
      })

      const dataSourceTabs = useTabStore.getState().tabs.filter((tab) => tab.type === 'data-source-query')
      expect(dataSourceTabs).toHaveLength(3)
      expect(dataSourceTabs[0].id).toBe(adHocId)
    })
  })

  describe('closeTab', () => {
    it('关闭当前活跃 Tab → 切换到最后一个剩余 Tab', () => {
      useTabStore.getState().openTab({ type: 'editor', title: '文件', icon: '📄' })
      const editorId = useTabStore.getState().activeTabId

      useTabStore.getState().closeTab(editorId!)
      expect(useTabStore.getState().activeTabId).toBe('browser')
      expect(useTabStore.getState().tabs).toHaveLength(1)
    })

    it('关闭非活跃 Tab → 活跃 Tab 不变', () => {
      useTabStore.getState().openTab({ type: 'editor', title: '文件', icon: '📄' })
      useTabStore.getState().activateTab('browser')

      const editorTab = useTabStore.getState().tabs.find((t) => t.type === 'editor')!
      useTabStore.getState().closeTab(editorTab.id)

      expect(useTabStore.getState().activeTabId).toBe('browser')
      expect(useTabStore.getState().tabs).toHaveLength(1)
    })

    it('关闭最后一个 Tab → 进入空工作台', () => {
      useTabStore.getState().closeTab('browser')
      expect(useTabStore.getState().tabs).toHaveLength(0)
      expect(useTabStore.getState().activeTabId).toBeNull()
    })
  })

  describe('activateTab', () => {
    it('切换活跃 Tab', () => {
      useTabStore.getState().openTab({ type: 'settings', title: '设置', icon: '⚙️' })
      const settingsTab = useTabStore.getState().tabs.find((t) => t.type === 'settings')!

      useTabStore.getState().activateTab('browser')
      expect(useTabStore.getState().activeTabId).toBe('browser')

      useTabStore.getState().activateTab(settingsTab.id)
      expect(useTabStore.getState().activeTabId).toBe(settingsTab.id)
    })
  })

  describe('updateTabTitle', () => {
    it('更新 Tab 标题', () => {
      useTabStore.getState().openTab({ type: 'editor', title: 'untitled', icon: '📄' })
      const editorTab = useTabStore.getState().tabs.find((t) => t.type === 'editor')!

      useTabStore.getState().updateTabTitle(editorTab.id, '新标题')
      expect(useTabStore.getState().tabs.find((t) => t.id === editorTab.id)!.title).toBe('新标题')
    })
  })

  describe('updateTabFilePath', () => {
    it('Save-As 后回填文件路径', () => {
      useTabStore.getState().openTab({ type: 'editor', title: '未命名.md', icon: '📄' })
      const editorTab = useTabStore.getState().tabs.find((t) => t.type === 'editor')!

      useTabStore.getState().updateTabFilePath(editorTab.id, '/docs/saved.md')
      expect(useTabStore.getState().tabs.find((t) => t.id === editorTab.id)!.filePath).toBe(
        '/docs/saved.md',
      )
    })
  })

  describe('reorderTabs', () => {
    it('把末尾 Tab 移到开头', () => {
      useTabStore.getState().openTab({ type: 'editor', title: 'A', icon: '📄', forceNew: true })
      useTabStore.getState().openTab({ type: 'editor', title: 'B', icon: '📄', forceNew: true })
      const tabs = useTabStore.getState().tabs
      const lastId = tabs[tabs.length - 1].id
      const firstId = tabs[0].id

      useTabStore.getState().reorderTabs(lastId, firstId)
      expect(useTabStore.getState().tabs[0].id).toBe(lastId)
    })

    it('fromId === toId → 无变化', () => {
      useTabStore.getState().openTab({ type: 'editor', title: 'A', icon: '📄', forceNew: true })
      const before = useTabStore.getState().tabs.map((t) => t.id)
      const id = before[0]

      useTabStore.getState().reorderTabs(id, id)
      expect(useTabStore.getState().tabs.map((t) => t.id)).toEqual(before)
    })

    it('非法 id → 无变化', () => {
      const before = useTabStore.getState().tabs.map((t) => t.id)
      useTabStore.getState().reorderTabs('nope', 'browser')
      expect(useTabStore.getState().tabs.map((t) => t.id)).toEqual(before)
    })
  })

  describe('duplicateTab', () => {
    it('浏览器 → 克隆当前 URL 为新 Tab', () => {
      useBrowserStore.setState({
        tabs: {
          browser: browserTab({
            url: 'https://github.com',
            urlInput: 'https://github.com',
            history: ['https://github.com'],
          }),
        },
      })
      const before = useTabStore.getState().tabs.length

      useTabStore.getState().duplicateTab('browser')
      const tabs = useTabStore.getState().tabs
      expect(tabs).toHaveLength(before + 1)

      const clone = tabs[tabs.length - 1]
      expect(clone.type).toBe('browser')
      expect(clone.initialUrl).toBe('https://github.com')
    })

    it('编辑器 → 克隆当前内容为未命名副本', () => {
      useTabStore.getState().openTab({ type: 'editor', title: '笔记.md', icon: '📄' })
      const editorTab = useTabStore.getState().tabs.find((t) => t.type === 'editor')!
      useEditorStore.setState({
        files: {
          [`virtual:${editorTab.id}`]: {
            savedContent: '',
            currentContent: '# 标题',
            dirty: true,
            loading: false,
          },
        },
      })
      const before = useTabStore.getState().tabs.length

      useTabStore.getState().duplicateTab(editorTab.id)
      const tabs = useTabStore.getState().tabs
      expect(tabs).toHaveLength(before + 1)

      const clone = tabs[tabs.length - 1]
      expect(clone.title).toBe('副本: 笔记.md')
      expect(clone.initialContent).toBe('# 标题')
      expect(clone.filePath).toBeUndefined()
    })

    it('settings/preview/android → 无操作', () => {
      useTabStore.getState().openTab({ type: 'settings', title: '设置', icon: '⚙️' })
      const settingsTab = useTabStore.getState().tabs.find((t) => t.type === 'settings')!
      const before = useTabStore.getState().tabs.length

      useTabStore.getState().duplicateTab(settingsTab.id)
      expect(useTabStore.getState().tabs.length).toBe(before)
    })
  })

  describe('hydrateFromWorkspaceState', () => {
    it('从工作台快照恢复 Tab 顺序和活跃 Tab', () => {
      useTabStore.getState().hydrateFromWorkspaceState({
        tabs: [
          { id: 'browser', type: 'browser', title: '浏览器', icon: '🌐' },
          { id: 'doc-1', type: 'editor', title: '计划.md', icon: '📄', filePath: '/docs/plan.md' },
          {
            id: 'cc-1',
            type: 'conversation',
            title: '远程会话',
            icon: '🤖',
            conversation: {
              surface: 'workbench-tab',
              runtime: {
                location: 'remote',
                transport: 'cclink',
                backend: 'deepink-agent',
              },
              sessionId: 'session-1',
            },
          },
        ],
        activeTabId: 'doc-1',
      })

      const state = useTabStore.getState()
      expect(state.tabs.map((tab) => tab.id)).toEqual(['browser', 'doc-1', 'cc-1'])
      expect(state.activeTabId).toBe('doc-1')
      expect(state.tabs[1].filePath).toBe('/docs/plan.md')
      expect(state.tabs[2].conversation).toEqual({
        surface: 'workbench-tab',
        runtime: {
          location: 'remote',
          transport: 'cclink',
          backend: 'deepink-agent',
        },
        sessionId: 'session-1',
      })
    })

    it('旧 cclink Tab 快照仍可恢复', () => {
      useTabStore.getState().hydrateFromWorkspaceState({
        tabs: [
          {
            id: 'cc-legacy',
            type: 'cclink',
            title: '旧远程会话',
            icon: '🔗',
            cclinkSessionId: 'session-1',
          },
        ],
        activeTabId: 'cc-legacy',
      })

      const state = useTabStore.getState()
      expect(state.tabs).toHaveLength(1)
      expect(state.tabs[0].type).toBe('cclink')
      expect(state.tabs[0].cclinkSessionId).toBe('session-1')
    })

    it('Terminal Tab 快照保留权限、审计和关闭语义', () => {
      useTabStore.getState().hydrateFromWorkspaceState({
        tabs: [
          {
            id: 'terminal-1',
            type: 'terminal',
            title: 'Terminal',
            icon: '⌨️',
            terminal: {
              runtime: {
                location: 'remote',
                transport: 'cclink',
                backend: 'remote-shell',
                workspaceRef: {
                  kind: 'remote',
                  transport: 'cclink',
                  endpointId: 'agent-1',
                  workspaceId: 'agent-1:/workspace',
                  path: '/workspace',
                },
                cwd: '/workspace',
                endpointId: 'agent-1',
              },
              permissionPolicy: {
                mode: 'ask-risky-command',
                requireConfirmationFor: ['write', 'destructive', 'privileged'],
              },
              status: 'idle',
              closePolicy: 'terminate-process',
              auditLogId: 'audit-1',
            },
          },
        ],
        activeTabId: 'terminal-1',
      })

      const terminal = useTabStore.getState().tabs[0].terminal
      expect(useTabStore.getState().activeTabId).toBe('terminal-1')
      expect(terminal?.runtime.location).toBe('remote')
      expect(terminal?.permissionPolicy.mode).toBe('ask-risky-command')
      expect(terminal?.closePolicy).toBe('terminate-process')
    })

    it('快照 activeTabId 无效时回退到第一个 Tab', () => {
      useTabStore.getState().hydrateFromWorkspaceState({
        tabs: [
          { id: 'browser', type: 'browser', title: '浏览器', icon: '🌐' },
          { id: 'doc-1', type: 'editor', title: '计划.md', icon: '📄' },
        ],
        activeTabId: 'missing',
      })

      expect(useTabStore.getState().activeTabId).toBe('browser')
    })

    it('空 Tab 快照恢复为空工作台，用于中间 Codex 会话模式', () => {
      useTabStore.getState().hydrateFromWorkspaceState({
        tabs: [],
        activeTabId: null,
      })

      expect(useTabStore.getState().tabs).toEqual([])
      expect(useTabStore.getState().activeTabId).toBeNull()
    })
  })
})
