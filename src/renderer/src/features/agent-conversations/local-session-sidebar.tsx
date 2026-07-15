import { useState } from 'react'
import type { WorkspaceRef } from '../../../../shared/workspace-ref'
import { workspaceRefKey, workspaceRefLabel } from '../../../../shared/workspace-ref'
import type { AgentConversationState } from '../../stores/agent-store'
import { useAgentStore, useTabStore } from '../../stores'
import { IconChevronDown, IconPlus, IconSearch } from '../../components/common/Icons'
import { getConversationActivity } from './activity'
import {
  formatRelativeSessionTime,
  SessionSidebarGroup,
  SessionSidebarRow,
  type SessionSidebarAction,
  type SessionSidebarStatusKind,
} from './session-sidebar-primitives'

type LocalSessionFilter = 'all' | 'workspace' | 'unbound' | 'running' | 'closed'

const LOCAL_SESSION_FILTERS: Array<{
  value: LocalSessionFilter
  label: string
  title: string
}> = [
  { value: 'all', label: '全部', title: '显示当前项目、未绑定和已关闭会话' },
  { value: 'workspace', label: '当前项目', title: '只显示当前项目会话' },
  { value: 'unbound', label: '未绑定', title: '只显示未绑定到项目的会话' },
  { value: 'running', label: '运行中', title: '只显示正在运行或等待工具的会话' },
  { value: 'closed', label: '已关闭', title: '只显示已关闭历史会话' },
]

export interface WorkspaceConversationGroups {
  current: AgentConversationState[]
  unbound: AgentConversationState[]
  closed: AgentConversationState[]
}

export function getWorkspaceConversationGroups(
  conversationOrder: ReturnType<typeof useAgentStore.getState>['conversationOrder'],
  conversations: ReturnType<typeof useAgentStore.getState>['conversations'],
  workspaceRef: WorkspaceRef,
): WorkspaceConversationGroups {
  const activeWorkspaceKey = workspaceRefKey(workspaceRef)
  const ordered = conversationOrder
    .flatMap((id) => {
      const conversation = conversations[id]
      return conversation ? [conversation] : []
    })
    .filter((conversation) => conversation.surface === 'workbench-tab')
    .sort((a, b) => b.updatedAt - a.updatedAt)

  const belongsToActiveWorkspace = (conversation: AgentConversationState): boolean => {
    const conversationWorkspaceKey = conversation.runtime.workspaceRef
      ? workspaceRefKey(conversation.runtime.workspaceRef)
      : null
    if (workspaceRef.kind === 'global')
      return !conversationWorkspaceKey || conversationWorkspaceKey === activeWorkspaceKey
    return conversationWorkspaceKey === activeWorkspaceKey
  }

  const isUnbound = (conversation: AgentConversationState): boolean =>
    !conversation.runtime.workspaceRef

  return {
    current: ordered.filter(
      (conversation) => !conversation.archivedAt && belongsToActiveWorkspace(conversation),
    ),
    unbound:
      workspaceRef.kind === 'global'
        ? []
        : ordered.filter((conversation) => !conversation.archivedAt && isUnbound(conversation)),
    closed: ordered.filter((conversation) => {
      if (!conversation.archivedAt) return false
      return belongsToActiveWorkspace(conversation) || isUnbound(conversation)
    }),
  }
}

export function LocalSessionsList({
  workspaceRef,
  sessionGroups,
  activeConversationId,
  createConversation,
  switchConversation,
  archiveConversation,
  restoreArchivedConversation,
  deleteConversation,
  renameConversation,
  tabs,
  openTab,
  closeTab,
}: {
  workspaceRef: Exclude<WorkspaceRef, { kind: 'remote' }>
  sessionGroups: WorkspaceConversationGroups
  activeConversationId: string
  createConversation: ReturnType<typeof useAgentStore.getState>['createConversation']
  switchConversation: (id: string) => void
  archiveConversation: ReturnType<typeof useAgentStore.getState>['archiveConversation']
  restoreArchivedConversation: ReturnType<
    typeof useAgentStore.getState
  >['restoreArchivedConversation']
  deleteConversation: ReturnType<typeof useAgentStore.getState>['deleteConversation']
  renameConversation: ReturnType<typeof useAgentStore.getState>['renameConversation']
  tabs: ReturnType<typeof useTabStore.getState>['tabs']
  openTab: ReturnType<typeof useTabStore.getState>['openTab']
  closeTab: ReturnType<typeof useTabStore.getState>['closeTab']
}): React.ReactElement {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<LocalSessionFilter>('all')
  const [showClosed, setShowClosed] = useState(false)
  const filteredSessionGroups = filterConversationGroups(sessionGroups, query, filter)
  const visibleCount =
    filteredSessionGroups.current.length +
    filteredSessionGroups.unbound.length +
    filteredSessionGroups.closed.length
  const runningCount = [...sessionGroups.current, ...sessionGroups.unbound].filter(
    (conversation) =>
      conversation.loading || getConversationActivity(conversation).kind === 'running',
  ).length
  const totalOpenCount = sessionGroups.current.length + sessionGroups.unbound.length

  const openWorkConversation = (conversation: AgentConversationState): void => {
    if (conversation.archivedAt) {
      restoreArchivedConversation(conversation.id)
    }
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

  const createWorkConversation = (): void => {
    const conversationId = createConversation({
      surface: 'workbench-tab',
      runtime: {
        location: 'local',
        transport: 'local',
        backend: 'deepink-agent',
        workspaceRef,
      },
      activate: true,
    })
    openTab({
      type: 'conversation',
      title: '新工作会话',
      icon: '🤖',
      conversation: {
        surface: 'workbench-tab',
        runtime: {
          location: 'local',
          transport: 'local',
          backend: 'deepink-agent',
          workspaceRef,
        },
        sessionId: conversationId,
      },
    })
  }

  return (
    <div className="sidebar-section">
      <div className="sidebar-section-header expanded">
        <IconChevronDown size={10} />
        会话
      </div>
      <button className="project-panel-row" onClick={createWorkConversation} title="新建会话">
        <IconPlus size={14} />
        <span className="project-panel-row-main">
          <span className="project-panel-row-title">新建会话</span>
          <span className="project-panel-row-meta">挂靠到当前工作空间</span>
        </span>
      </button>
      <label className="session-sidebar-search" title="搜索会话标题、摘要或工作空间">
        <IconSearch size={13} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索会话"
        />
      </label>
      <div className="session-sidebar-summary" title="当前会话列表摘要">
        <span>{workspaceRef.kind === 'global' ? '未归档' : '当前项目'}</span>
        <span>
          {totalOpenCount} 个打开
          {runningCount > 0 ? ` · ${runningCount} 个运行中` : ''}
          {sessionGroups.closed.length > 0 ? ` · ${sessionGroups.closed.length} 个已关闭` : ''}
        </span>
      </div>
      <div className="session-sidebar-filters" role="tablist" aria-label="会话筛选">
        {LOCAL_SESSION_FILTERS.map((item) => (
          <button
            key={item.value}
            className={filter === item.value ? 'active' : ''}
            onClick={() => {
              setFilter(item.value)
              if (item.value === 'closed') setShowClosed(true)
            }}
            title={item.title}
          >
            {item.label}
          </button>
        ))}
      </div>
      {visibleCount > 0 ? (
        <>
          {filter !== 'closed' && (
            <>
              <ConversationGroup
                title={workspaceRef.kind === 'global' ? '未归档' : '当前项目'}
                conversations={filteredSessionGroups.current}
                activeConversationId={activeConversationId}
                onOpen={openWorkConversation}
                onRename={(conversation) => {
                  const title = window.prompt('重命名会话', conversation.title)
                  if (title == null) return
                  renameConversation(conversation.id, title)
                }}
                onArchive={(conversationId) => {
                  archiveConversation(conversationId)
                  closeConversationTabs(tabs, closeTab, conversationId)
                }}
              />
              <ConversationGroup
                title="未绑定"
                conversations={filteredSessionGroups.unbound}
                activeConversationId={activeConversationId}
                onOpen={openWorkConversation}
                onRename={(conversation) => {
                  const title = window.prompt('重命名会话', conversation.title)
                  if (title == null) return
                  renameConversation(conversation.id, title)
                }}
                onArchive={(conversationId) => {
                  archiveConversation(conversationId)
                  closeConversationTabs(tabs, closeTab, conversationId)
                }}
              />
            </>
          )}
          {filteredSessionGroups.closed.length > 0 && (
            <ConversationGroup
              title="已关闭"
              conversations={showClosed ? filteredSessionGroups.closed : []}
              activeConversationId={activeConversationId}
              onOpen={openWorkConversation}
              onRename={(conversation) => {
                const title = window.prompt('重命名会话', conversation.title)
                if (title == null) return
                renameConversation(conversation.id, title)
              }}
              onRestore={restoreArchivedConversation}
              onDelete={(conversationId) => {
                if (window.confirm('删除后将移除这个本地会话历史，确定删除吗？')) {
                  deleteConversation(conversationId)
                }
              }}
              muted
              collapsed={!showClosed}
              count={filteredSessionGroups.closed.length}
              onToggleCollapsed={() => setShowClosed((value) => !value)}
            />
          )}
        </>
      ) : (
        <div className="project-panel-empty">
          {query.trim() || filter !== 'all' ? '没有匹配的会话' : '当前工作空间暂无会话'}
        </div>
      )}
    </div>
  )
}

function ConversationGroup({
  title,
  conversations,
  activeConversationId,
  onOpen,
  onRename,
  onArchive,
  onRestore,
  onDelete,
  muted = false,
  collapsed = false,
  count,
  onToggleCollapsed,
}: {
  title: string
  conversations: AgentConversationState[]
  activeConversationId: string
  onOpen: (conversation: AgentConversationState) => void
  onRename?: (conversation: AgentConversationState) => void
  onArchive?: (conversationId: string) => void
  onRestore?: (conversationId: string) => void
  onDelete?: (conversationId: string) => void
  muted?: boolean
  collapsed?: boolean
  count?: number
  onToggleCollapsed?: () => void
}): React.ReactElement | null {
  const groupCount = count ?? conversations.length

  return (
    <SessionSidebarGroup
      title={title}
      count={groupCount}
      collapsed={collapsed}
      collapsedText="点击展开已关闭历史"
      onToggleCollapsed={onToggleCollapsed}
    >
      {conversations.map((conversation) => (
        <ConversationRow
          key={conversation.id}
          conversation={conversation}
          active={conversation.id === activeConversationId}
          muted={muted}
          onOpen={() => onOpen(conversation)}
          onRename={onRename ? () => onRename(conversation) : undefined}
          onArchive={onArchive ? () => onArchive(conversation.id) : undefined}
          onRestore={onRestore ? () => onRestore(conversation.id) : undefined}
          onDelete={onDelete ? () => onDelete(conversation.id) : undefined}
        />
      ))}
    </SessionSidebarGroup>
  )
}

function ConversationRow({
  conversation,
  active,
  muted,
  onOpen,
  onRename,
  onArchive,
  onRestore,
  onDelete,
}: {
  conversation: AgentConversationState
  active: boolean
  muted: boolean
  onOpen: () => void
  onRename?: () => void
  onArchive?: () => void
  onRestore?: () => void
  onDelete?: () => void
}): React.ReactElement {
  const status = getConversationStatus(conversation, active)
  const activity = getConversationActivity(conversation)
  const preview = getConversationPreview(conversation)
  const actions: SessionSidebarAction[] = [
    ...(onRename ? [{ label: '重命名', title: '重命名会话', onAction: onRename }] : []),
    ...(onArchive ? [{ label: '关闭', title: '关闭会话，保留历史', onAction: onArchive }] : []),
    ...(onRestore ? [{ label: '恢复', title: '恢复会话', onAction: onRestore }] : []),
    ...(onDelete
      ? [
          {
            label: '删除',
            title: '删除本地会话历史',
            kind: 'danger' as const,
            onAction: onDelete,
          },
        ]
      : []),
  ]

  return (
    <SessionSidebarRow
      title={conversation.title}
      rowTitle={conversation.title}
      statusKind={status.kind}
      active={active}
      muted={muted}
      time={formatRelativeSessionTime(conversation.updatedAt)}
      preview={preview}
      activity={`${activity.label} · ${activity.detail}`}
      activityTitle={activity.detail}
      meta={`${status.label} · ${conversation.messages.length} 条消息${
        activity.toolCount > 0 ? ` · ${activity.toolCount} 次工具` : ''
      }${activity.errorCount > 0 ? ` · ${activity.errorCount} 个错误` : ''}${
        conversation.mountedResources.length > 0
          ? ` · ${conversation.mountedResources.length} 个资源`
          : ''
      }`}
      actions={actions}
      onOpen={onOpen}
    />
  )
}

function closeConversationTabs(
  tabs: ReturnType<typeof useTabStore.getState>['tabs'],
  closeTab: ReturnType<typeof useTabStore.getState>['closeTab'],
  conversationId: string,
): void {
  tabs
    .filter(
      (tab) =>
        tab.type === 'conversation' &&
        tab.conversation &&
        'runtime' in tab.conversation &&
        tab.conversation.runtime.location === 'local' &&
        tab.conversation.sessionId === conversationId,
    )
    .forEach((tab) => closeTab(tab.id))
}

function filterConversationGroups(
  groups: WorkspaceConversationGroups,
  query: string,
  filter: LocalSessionFilter = 'all',
): WorkspaceConversationGroups {
  const normalized = query.trim().toLowerCase()

  const matches = (conversation: AgentConversationState): boolean => {
    if (normalized) {
      const workspaceLabel = conversation.runtime.workspaceRef
        ? workspaceRefLabel(conversation.runtime.workspaceRef)
        : '未绑定'
      const haystack = [
        conversation.title,
        getConversationPreview(conversation),
        workspaceLabel,
        conversation.backendState,
      ]
        .join(' ')
        .toLowerCase()

      if (!haystack.includes(normalized)) return false
    }

    if (filter === 'running') {
      const activity = getConversationActivity(conversation)
      return conversation.loading || activity.kind === 'running' || activity.kind === 'tool'
    }

    return true
  }

  const matchesSearchOnly = (conversation: AgentConversationState): boolean => {
    if (!normalized) return true
    const workspaceLabel = conversation.runtime.workspaceRef
      ? workspaceRefLabel(conversation.runtime.workspaceRef)
      : '未绑定'
    const haystack = [
      conversation.title,
      getConversationPreview(conversation),
      workspaceLabel,
      conversation.backendState,
    ]
      .join(' ')
      .toLowerCase()

    return haystack.includes(normalized)
  }

  switch (filter) {
    case 'workspace':
      return {
        current: groups.current.filter(matches),
        unbound: [],
        closed: [],
      }
    case 'unbound':
      return {
        current: [],
        unbound: groups.unbound.filter(matches),
        closed: [],
      }
    case 'running':
      return {
        current: groups.current.filter(matches),
        unbound: groups.unbound.filter(matches),
        closed: [],
      }
    case 'closed':
      return {
        current: [],
        unbound: [],
        closed: groups.closed.filter(matchesSearchOnly),
      }
    case 'all':
    default:
      return {
        current: groups.current.filter(matches),
        unbound: groups.unbound.filter(matches),
        closed: groups.closed.filter(matchesSearchOnly),
      }
  }
}

function getConversationPreview(conversation: AgentConversationState): string {
  const message = [...conversation.messages]
    .reverse()
    .find((item) => item.id !== 'welcome' && item.rawText.trim())

  if (!message) return '空会话'

  return message.rawText.replace(/\s+/g, ' ').trim().slice(0, 72)
}

function getConversationStatus(
  conversation: AgentConversationState,
  active: boolean,
): { kind: SessionSidebarStatusKind; label: string } {
  const activity = getConversationActivity(conversation)
  if (conversation.archivedAt) return { kind: 'closed', label: '已关闭' }
  if (activity.kind === 'error') return { kind: 'error', label: activity.label }
  if (activity.kind === 'running') return { kind: 'running', label: activity.label }
  if (active) return { kind: 'active', label: '已激活' }
  return { kind: 'idle', label: '未激活' }
}
