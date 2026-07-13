import {
  useUIStore,
  useTabStore,
  useFsStore,
  useEditorStore,
  useAgentStore,
  useCclinkStore,
  useWorkspaceStore,
} from '../../stores'
import type { ChatccSession } from '@shared/chatcc'
import type { WorkspaceRef } from '../../../../shared/workspace-ref'
import {
  localWorkspaceRef,
  workspaceRefKey,
  workspaceRefLabel,
  workspaceRefSourceLabel,
} from '../../../../shared/workspace-ref'
import type { RemoteWorkspaceItem } from '../../utils/remote-workspaces'
import {
  getArchivedCclinkRemoteWorkspaceSessions,
  getCclinkRemoteWorkspaceItems,
  getCclinkRemoteWorkspaceSessions,
} from '../../utils/remote-workspaces'
import {
  IconFolder,
  IconFile,
  IconBookmark,
  IconHistory,
  IconChevronDown,
  IconRobot,
  IconPlus,
} from '../common/Icons'
import { FileTree } from './FileTree'
import { RemoteFileTree } from './RemoteFileTree'
import { SearchPanel } from './SearchPanel'
import { useState, useEffect } from 'react'

function getProjectName(path: string): string {
  return path.split('/').filter(Boolean).pop() ?? path
}

function getDraftTitle(key: string): string {
  if (key.startsWith('virtual:')) return '未命名草稿'
  return key.split('/').filter(Boolean).pop() ?? key
}

export function Sidebar(): React.ReactElement {
  const activePanel = useUIStore((s) => s.activePanel)
  const sidebarWidth = useUIStore((s) => s.sidebarWidth)
  const workspacePath = useFsStore((s) => s.workspacePath)
  const openWorkspacePicker = useFsStore((s) => s.openWorkspacePicker)
  const startEditing = useFsStore((s) => s.startEditing)
  const editingPath = useFsStore((s) => s.editingPath)
  const loading = useFsStore((s) => s.loading)
  const picking = useFsStore((s) => s.picking)

  const panelTitle: Record<string, string> = {
    files: '工作空间',
    search: '搜索',
    browser: '浏览器',
  }

  return (
    <div className="sidebar" style={{ width: sidebarWidth, minWidth: sidebarWidth }}>
      <div className="sidebar-header">
        <span className="sidebar-header-title">{panelTitle[activePanel] ?? activePanel}</span>
        {activePanel === 'files' && (
          <div className="sidebar-header-actions">
            <button
              className="sidebar-header-action"
              onClick={() => {
                if (workspacePath) startEditing('new-folder', workspacePath)
              }}
              disabled={!workspacePath || editingPath !== null}
              title="新建文件夹"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                <path d="M14 4H7l-1-1H2v10h12V4zM2 2h4l1 1h7a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" />
                <path d="M8 6v3H5v1h3v3h1v-3h3V9H9V6H8z" />
              </svg>
            </button>
            <button
              className="sidebar-header-action"
              onClick={() => openWorkspacePicker()}
              disabled={loading || picking}
              title={workspacePath ? `工作空间：${workspacePath}` : '打开工作空间文件夹'}
            >
              <IconFolder size={14} />
            </button>
          </div>
        )}
      </div>

      <div className="sidebar-content">
        {/* 工作空间面板：当前工作空间文件树 */}
        {activePanel === 'files' && <ProjectSidebarContent />}

        {/* 搜索面板：文件搜索 */}
        {activePanel === 'search' && <SearchPanel />}

        {/* 浏览器面板：书签 + 历史（暂为占位） */}
        {activePanel === 'browser' && (
          <>
            <div className="sidebar-section">
              <div className="sidebar-section-header expanded">
                <IconChevronDown size={10} />
                书签栏
              </div>
              <div className="sidebar-item">
                <IconBookmark size={14} />
                <span className="sidebar-item-label">暂无书签</span>
              </div>
            </div>
            <div className="sidebar-section">
              <div className="sidebar-section-header expanded">
                <IconChevronDown size={10} />
                历史记录
              </div>
              <div className="sidebar-item">
                <IconHistory size={14} />
                <span className="sidebar-item-label">暂无历史</span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function ProjectSidebarContent(): React.ReactElement {
  const workspacePath = useFsStore((s) => s.workspacePath)
  const openWorkspacePicker = useFsStore((s) => s.openWorkspacePicker)
  const openRecentWorkspace = useFsStore((s) => s.openRecentWorkspace)
  const closeWorkspace = useFsStore((s) => s.closeWorkspace)
  const recentWorkspacePaths = useFsStore((s) => s.recentWorkspacePaths)
  const loading = useFsStore((s) => s.loading)
  const picking = useFsStore((s) => s.picking)
  const tabs = useTabStore((s) => s.tabs)
  const openTab = useTabStore((s) => s.openTab)
  const editorFiles = useEditorStore((s) => s.files)
  const conversationOrder = useAgentStore((s) => s.conversationOrder)
  const conversations = useAgentStore((s) => s.conversations)
  const activeConversationId = useAgentStore((s) => s.activeConversationId)
  const switchConversation = useAgentStore((s) => s.switchConversation)
  const createConversation = useAgentStore((s) => s.createConversation)
  const cclinkServers = useCclinkStore((s) => s.servers)
  const cclinkSessions = useCclinkStore((s) => s.sessions)
  const archivedCclinkSessionIds = useCclinkStore((s) => s.archivedSessionIds)
  const archiveCclinkSession = useCclinkStore((s) => s.archiveSession)
  const restoreArchivedCclinkSession = useCclinkStore((s) => s.restoreArchivedSession)
  const loadCclink = useCclinkStore((s) => s.load)
  const loadCclinkMessages = useCclinkStore((s) => s.loadMessages)
  const activeWorkspaceRef = useWorkspaceStore((s) => s.activeWorkspaceRef)
  const activateRemoteWorkspace = useWorkspaceStore((s) => s.activateRemoteWorkspace)
  const switchToGlobalWorkspace = useWorkspaceStore((s) => s.switchToGlobalWorkspace)
  const activatingWorkspace = useWorkspaceStore((s) => s.activating)
  const projectTabs = tabs.filter((tab) => tab.type !== 'settings')
  const drafts = getVisibleDrafts(editorFiles)
  const workConversations = getWorkspaceWorkConversations(
    conversationOrder,
    conversations,
    activeWorkspaceRef,
  )
  const remoteWorkspaces = getCclinkRemoteWorkspaceItems(cclinkServers)
  const activeRemoteSessions =
    activeWorkspaceRef.kind === 'remote'
      ? getCclinkRemoteWorkspaceSessions(
          activeWorkspaceRef,
          cclinkSessions,
          archivedCclinkSessionIds,
        )
      : []
  const activeArchivedRemoteSessions =
    activeWorkspaceRef.kind === 'remote'
      ? getArchivedCclinkRemoteWorkspaceSessions(
          activeWorkspaceRef,
          cclinkSessions,
          archivedCclinkSessionIds,
        )
      : []

  useEffect(() => {
    void loadCclink()
  }, [loadCclink])

  return (
    <>
      <ProjectListSection
        workspacePath={workspacePath}
        recentWorkspacePaths={recentWorkspacePaths}
        loading={loading}
        picking={picking}
        projectTabsCount={projectTabs.length}
        remoteWorkspaces={remoteWorkspaces}
        activeWorkspaceKey={workspaceRefKey(activeWorkspaceRef)}
        activatingWorkspace={activatingWorkspace}
        openWorkspacePicker={openWorkspacePicker}
        openRecentWorkspace={openRecentWorkspace}
        activateRemoteWorkspace={activateRemoteWorkspace}
      />

      {activeWorkspaceRef.kind === 'remote' ? (
        <RemoteWorkspaceContent
          workspaceRef={activeWorkspaceRef}
          sessions={activeRemoteSessions}
          archivedSessions={activeArchivedRemoteSessions}
          openTab={openTab}
          loadMessages={loadCclinkMessages}
          archiveSession={archiveCclinkSession}
          restoreArchivedSession={restoreArchivedCclinkSession}
          openRemoteConnectionSettings={() =>
            openTab({
              type: 'settings',
              title: '远程连接',
              icon: '⚙️',
              settingsSection: 'remote-connections',
            })
          }
        />
      ) : (
        <CurrentWorkSection
          drafts={drafts}
          conversations={workConversations}
          activeConversationId={activeConversationId}
          switchConversation={switchConversation}
        />
      )}

      {activeWorkspaceRef.kind === 'local' && workspacePath && (
        <div className="sidebar-section">
          <div className="sidebar-section-header expanded">
            <IconChevronDown size={10} />
            当前工作空间文件
          </div>
          <FileTree />
        </div>
      )}

      <UnarchivedSection
        activeWorkspaceKind={activeWorkspaceRef.kind}
        loading={loading}
        picking={picking}
        closeWorkspace={closeWorkspace}
        switchToGlobalWorkspace={switchToGlobalWorkspace}
        openTab={openTab}
        createConversation={createConversation}
      />
    </>
  )
}

function ProjectListSection({
  workspacePath,
  recentWorkspacePaths,
  loading,
  picking,
  projectTabsCount,
  remoteWorkspaces,
  activeWorkspaceKey,
  activatingWorkspace,
  openWorkspacePicker,
  openRecentWorkspace,
  activateRemoteWorkspace,
}: {
  workspacePath: string | null
  recentWorkspacePaths: string[]
  loading: boolean
  picking: boolean
  projectTabsCount?: number
  remoteWorkspaces: RemoteWorkspaceItem[]
  activeWorkspaceKey: string | null
  activatingWorkspace: boolean
  openWorkspacePicker: () => Promise<void>
  openRecentWorkspace: (path: string) => Promise<void>
  activateRemoteWorkspace: ReturnType<typeof useWorkspaceStore.getState>['activateRemoteWorkspace']
}): React.ReactElement {
  const recentProjects =
    workspacePath && !recentWorkspacePaths.includes(workspacePath)
      ? [workspacePath, ...recentWorkspacePaths]
      : recentWorkspacePaths
  const hasWorkspaces = recentProjects.length > 0 || remoteWorkspaces.length > 0

  return (
    <div className="sidebar-section project-panel-section-primary">
      <div className="sidebar-section-header expanded">
        <IconChevronDown size={10} />
        工作空间
      </div>
      {hasWorkspaces ? (
        <>
          {recentProjects.map((path) => {
            const ref = localWorkspaceRef(path)
            const active = workspaceRefKey(ref) === activeWorkspaceKey
            return (
              <button
                key={path}
                className={`project-panel-project-item ${active ? 'active' : ''}`}
                onClick={() => (active ? undefined : void openRecentWorkspace(path))}
                disabled={loading || picking || active}
                title={active ? '当前工作空间' : path}
              >
                <IconFolder size={14} />
                <span className="project-panel-recent-main">
                  <span className="project-panel-recent-title">{getProjectName(path)}</span>
                  <span className="project-panel-recent-meta">
                    {active
                      ? `本地 · ${projectTabsCount ?? 0} 个标签页 · 已激活`
                      : `本地 · ${path}`}
                  </span>
                </span>
              </button>
            )
          })}
          {remoteWorkspaces.map(({ server, workspace, ref }) => {
            const active = workspaceRefKey(ref) === activeWorkspaceKey

            return (
              <button
                key={`${server.id}:${workspace.id}`}
                className={`project-panel-project-item ${active ? 'active' : ''}`}
                onClick={() => (active ? undefined : void activateRemoteWorkspace(ref))}
                disabled={activatingWorkspace || active}
                title={
                  active
                    ? '当前远程工作空间'
                    : `${workspaceRefSourceLabel(ref)} · ${workspace.path}`
                }
              >
                <IconFolder size={14} />
                <span className="project-panel-recent-main">
                  <span className="project-panel-recent-title">{workspaceRefLabel(ref)}</span>
                  <span className="project-panel-recent-meta">
                    {workspaceRefSourceLabel(ref)} ·{' '}
                    {active ? '已激活' : `${workspace.sessionCount} 个会话`}
                  </span>
                </span>
              </button>
            )
          })}
        </>
      ) : (
        <div className="project-panel-empty">暂无最近工作空间</div>
      )}
      <button
        className="project-panel-project-item add"
        onClick={() => openWorkspacePicker()}
        disabled={loading || picking}
        title="打开工作空间文件夹"
      >
        <IconPlus size={14} />
        <span className="project-panel-row-main">
          <span className="project-panel-row-title">打开工作空间文件夹</span>
          <span className="project-panel-row-meta">添加到工作空间列表</span>
        </span>
      </button>
    </div>
  )
}

function RemoteWorkspaceContent({
  workspaceRef,
  sessions,
  archivedSessions,
  openTab,
  loadMessages,
  archiveSession,
  restoreArchivedSession,
  openRemoteConnectionSettings,
}: {
  workspaceRef: Extract<WorkspaceRef, { kind: 'remote' }>
  sessions: ChatccSession[]
  archivedSessions: ChatccSession[]
  openTab: ReturnType<typeof useTabStore.getState>['openTab']
  loadMessages: (sessionId: string) => Promise<void>
  archiveSession: (sessionId: string) => void
  restoreArchivedSession: (sessionId: string) => void
  openRemoteConnectionSettings: () => void
}): React.ReactElement {
  const openRemoteSession = (session: ChatccSession): void => {
    void loadMessages(session.id)
    openTab({
      type: 'conversation',
      title: session.name,
      icon: '🤖',
      conversation: {
        surface: 'workbench-tab',
        runtime: {
          location: 'remote',
          transport: 'cclink',
          backend: 'deepink-agent',
          workspaceRef,
        },
        sessionId: session.id,
      },
    })
  }

  return (
    <>
      <div className="sidebar-section">
        <div className="sidebar-section-header expanded">
          <IconChevronDown size={10} />
          文件
        </div>
        <RemoteFileTree
          serverId={workspaceRef.endpointId}
          workspaceId={workspaceRef.workspaceId}
          rootPath={workspaceRef.path}
        />
        <button
          className="project-panel-row"
          onClick={openRemoteConnectionSettings}
          title="打开远程连接设置"
        >
          <IconRobot size={14} />
          <span className="project-panel-row-main">
            <span className="project-panel-row-title">远程连接设置</span>
            <span className="project-panel-row-meta">账号、通道和诊断</span>
          </span>
        </button>
      </div>

      <div className="sidebar-section">
        <div className="sidebar-section-header expanded">
          <IconChevronDown size={10} />
          会话
        </div>
        {sessions.length > 0 ? (
          sessions.map((session) => (
            <button
              key={session.id}
              className="project-panel-row"
              onClick={() => openRemoteSession(session)}
              title={session.workspacePath}
            >
              <IconRobot size={14} />
              <span className="project-panel-row-main">
                <span className="project-panel-row-title">{session.name}</span>
                <span className="project-panel-row-meta">
                  {session.messageCount} 条消息 · {formatRelativeSessionTime(session.updatedAt)}
                </span>
              </span>
              <span
                className="project-panel-row-action"
                role="button"
                tabIndex={0}
                title="在 DeepInk 中归档这个远程会话；不会删除远端历史"
                onClick={(event) => {
                  event.stopPropagation()
                  archiveSession(session.id)
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    event.stopPropagation()
                    archiveSession(session.id)
                  }
                }}
              >
                归档
              </span>
            </button>
          ))
        ) : (
          <div className="project-panel-empty">当前工作空间暂无会话</div>
        )}
        {archivedSessions.length > 0 && (
          <div className="project-panel-archived-group">
            <div className="project-panel-archived-title">已归档远程会话</div>
            {archivedSessions.map((session) => (
              <button
                key={session.id}
                className="project-panel-row muted"
                onClick={() => {
                  restoreArchivedSession(session.id)
                  openRemoteSession(session)
                }}
                title="恢复并打开远程会话"
              >
                <IconRobot size={14} />
                <span className="project-panel-row-main">
                  <span className="project-panel-row-title">{session.name}</span>
                  <span className="project-panel-row-meta">本地归档 · 点击恢复</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  )
}

function formatRelativeSessionTime(timestamp: number): string {
  if (!timestamp) return '未知'
  const normalized = timestamp < 10_000_000_000 ? timestamp * 1000 : timestamp
  const diff = Date.now() - normalized
  if (diff < 60_000) return '刚刚'
  if (diff < 3_600_000) return `${Math.max(1, Math.floor(diff / 60_000))} 分钟前`
  if (diff < 86_400_000) return `${Math.max(1, Math.floor(diff / 3_600_000))} 小时前`
  return `${Math.max(1, Math.floor(diff / 86_400_000))} 天前`
}

function UnarchivedSection({
  activeWorkspaceKind,
  loading,
  picking,
  closeWorkspace,
  switchToGlobalWorkspace,
  openTab,
  createConversation,
}: {
  activeWorkspaceKind: 'local' | 'remote' | 'global'
  loading: boolean
  picking: boolean
  closeWorkspace: () => Promise<void>
  switchToGlobalWorkspace: () => Promise<void>
  openTab: ReturnType<typeof useTabStore.getState>['openTab']
  createConversation: () => void
}): React.ReactElement {
  const isActive = activeWorkspaceKind === 'global'
  return (
    <div className="sidebar-section">
      <div className="sidebar-section-header expanded">
        <IconChevronDown size={10} />
        未归档
      </div>
      <button
        className={`project-panel-project-item system ${isActive ? 'active' : ''}`}
        onClick={() => {
          if (isActive) return
          if (activeWorkspaceKind === 'local') void closeWorkspace()
          else void switchToGlobalWorkspace()
        }}
        disabled={loading || picking || isActive}
        title={isActive ? '当前为未归档' : '切换到未归档'}
      >
        <IconFolder size={14} />
        <span className="project-panel-recent-main">
          <span className="project-panel-recent-title">未归档</span>
          <span className="project-panel-recent-meta">
            {isActive ? '已激活 · 新内容暂存到这里' : '临时草稿与全局会话'}
          </span>
        </span>
      </button>
      {isActive && (
        <div className="project-panel-quick-actions" aria-label="未归档快速开始">
          <button
            className="project-panel-quick-action"
            onClick={() =>
              openTab({ type: 'editor', title: '未命名.md', icon: '📄', forceNew: true })
            }
            title="新建 Markdown 草稿"
          >
            <IconPlus size={14} />
            新建草稿
          </button>
          <button
            className="project-panel-quick-action"
            onClick={() => createConversation()}
            title="新建全局会话"
          >
            <IconRobot size={14} />
            新建会话
          </button>
        </div>
      )}
    </div>
  )
}

function getVisibleDrafts(files: ReturnType<typeof useEditorStore.getState>['files']) {
  return Object.entries(files)
    .filter(([key, file]) => key.startsWith('virtual:') || file.dirty)
    .slice(0, 3)
}

function getWorkspaceWorkConversations(
  conversationOrder: ReturnType<typeof useAgentStore.getState>['conversationOrder'],
  conversations: ReturnType<typeof useAgentStore.getState>['conversations'],
  workspaceRef: WorkspaceRef,
) {
  const activeWorkspaceKey = workspaceRefKey(workspaceRef)
  return conversationOrder
    .flatMap((id) => {
      const conversation = conversations[id]
      return conversation ? [conversation] : []
    })
    .filter((conversation) => {
      if (conversation.archivedAt) return false
      if (conversation.surface !== 'workbench-tab') return false
      const conversationWorkspaceKey = conversation.runtime.workspaceRef
        ? workspaceRefKey(conversation.runtime.workspaceRef)
        : null
      return conversationWorkspaceKey === activeWorkspaceKey
    })
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 6)
}

function CurrentWorkSection({
  drafts,
  conversations,
  activeConversationId,
  switchConversation,
}: {
  drafts: ReturnType<typeof getVisibleDrafts>
  conversations: ReturnType<typeof getWorkspaceWorkConversations>
  activeConversationId: string
  switchConversation: (id: string) => void
}): React.ReactElement {
  const tabs = useTabStore((s) => s.tabs)
  const openTab = useTabStore((s) => s.openTab)
  const activateTab = useTabStore((s) => s.activateTab)
  const closeFile = useEditorStore((s) => s.closeFile)
  const hasWork = drafts.length > 0 || conversations.length > 0

  const openDraft = (key: string, content: string): void => {
    if (key.startsWith('virtual:')) {
      const tabId = key.slice('virtual:'.length)
      if (tabs.some((tab) => tab.id === tabId)) {
        activateTab(tabId)
        return
      }
      openTab({
        type: 'editor',
        title: getDraftTitle(key),
        icon: '📄',
        initialContent: content,
        forceNew: true,
      })
      closeFile(key)
      return
    }

    openTab({
      type: 'editor',
      title: getDraftTitle(key),
      icon: '📄',
      filePath: key,
    })
  }

  const openWorkConversation = (conversation: (typeof conversations)[number]): void => {
    switchConversation(conversation.id)
    openTab({
      type: 'conversation',
      title: conversation.title === '新会话' ? '新工作会话' : conversation.title,
      icon: '🤖',
      conversation: {
        surface: 'workbench-tab',
        runtime: conversation.runtime,
        sessionId: conversation.id,
      },
    })
  }

  return (
    <div className="sidebar-section">
      <div className="sidebar-section-header expanded">
        <IconChevronDown size={10} />
        当前工作
      </div>
      {hasWork ? (
        <>
          {drafts.map(([key, file]) => (
            <button
              key={key}
              className="project-panel-row"
              onClick={() => openDraft(key, file.currentContent)}
              title={key}
            >
              <IconFile size={14} />
              <span className="project-panel-row-main">
                <span className="project-panel-row-title">{getDraftTitle(key)}</span>
                <span className="project-panel-row-meta">{file.dirty ? '未保存' : '草稿'}</span>
              </span>
            </button>
          ))}
          {conversations.map((conversation) => (
            <button
              key={conversation.id}
              className={`project-panel-row ${conversation.id === activeConversationId ? 'active' : ''}`}
              onClick={() => openWorkConversation(conversation)}
              title={conversation.title}
            >
              <IconRobot size={14} />
              <span className="project-panel-row-main">
                <span className="project-panel-row-title">{conversation.title}</span>
                <span className="project-panel-row-meta">
                  工作会话 · {conversation.messages.length} 条消息
                  {conversation.loading ? ' · 执行中' : ''}
                </span>
              </span>
            </button>
          ))}
        </>
      ) : (
        <div className="project-panel-empty">暂无草稿或会话</div>
      )}
    </div>
  )
}
