import { useState } from 'react'
import type { ChatccSession } from '@shared/chatcc'
import type { WorkspaceRef } from '../../../../shared/workspace-ref'
import type { useCclinkStore, useTabStore } from '../../stores'
import { IconChevronDown, IconRobot, IconSearch } from '../../components/common/Icons'
import {
  formatRelativeSessionTime,
  SessionSidebarGroup,
  SessionSidebarRow,
  type SessionSidebarAction,
  type SessionSidebarStatusKind,
} from './session-sidebar-primitives'

export function RemoteSessionsList({
  workspaceRef,
  sessions,
  archivedSessions,
  openTab,
  loadMessages,
  archiveSession,
  restoreArchivedSession,
}: {
  workspaceRef: Extract<WorkspaceRef, { kind: 'remote' }>
  sessions: ChatccSession[]
  archivedSessions: ChatccSession[]
  openTab: ReturnType<typeof useTabStore.getState>['openTab']
  loadMessages: (sessionId: string) => Promise<void>
  archiveSession: ReturnType<typeof useCclinkStore.getState>['archiveSession']
  restoreArchivedSession: ReturnType<typeof useCclinkStore.getState>['restoreArchivedSession']
}): React.ReactElement {
  const [query, setQuery] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const filteredSessions = filterRemoteSessions(sessions, query)
  const filteredArchivedSessions = filterRemoteSessions(archivedSessions, query)
  const visibleCount = filteredSessions.length + filteredArchivedSessions.length
  const totalMessages = sessions.reduce((sum, session) => sum + session.messageCount, 0)

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
    <div className="sidebar-section">
      <div className="sidebar-section-header expanded">
        <IconChevronDown size={10} />
        会话
      </div>
      <label className="session-sidebar-search" title="搜索远程会话标题、路径或状态">
        <IconSearch size={13} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索远程会话"
        />
      </label>
      <div className="session-sidebar-summary" title="当前远程工作空间会话摘要">
        <span>远程 · CCLink</span>
        <span>
          {sessions.length} 个打开
          {archivedSessions.length > 0 ? ` · ${archivedSessions.length} 个已归档` : ''}
          {totalMessages > 0 ? ` · ${totalMessages} 条消息` : ''}
        </span>
      </div>
      {visibleCount > 0 ? (
        <>
          <RemoteSessionGroup
            title="当前远程工作空间"
            sessions={filteredSessions}
            onOpen={openRemoteSession}
            onArchive={archiveSession}
          />
          {filteredArchivedSessions.length > 0 && (
            <RemoteSessionGroup
              title="已归档远程会话"
              sessions={showArchived ? filteredArchivedSessions : []}
              onOpen={(session) => {
                restoreArchivedSession(session.id)
                openRemoteSession(session)
              }}
              muted
              collapsed={!showArchived}
              count={filteredArchivedSessions.length}
              onToggleCollapsed={() => setShowArchived((value) => !value)}
            />
          )}
        </>
      ) : (
        <div className="project-panel-empty">
          {query.trim() ? '没有匹配的远程会话' : '当前工作空间暂无会话'}
        </div>
      )}
    </div>
  )
}

function RemoteSessionGroup({
  title,
  sessions,
  onOpen,
  onArchive,
  muted = false,
  collapsed = false,
  count,
  onToggleCollapsed,
}: {
  title: string
  sessions: ChatccSession[]
  onOpen: (session: ChatccSession) => void
  onArchive?: (sessionId: string) => void
  muted?: boolean
  collapsed?: boolean
  count?: number
  onToggleCollapsed?: () => void
}): React.ReactElement | null {
  const groupCount = count ?? sessions.length

  return (
    <SessionSidebarGroup
      title={title}
      count={groupCount}
      collapsed={collapsed}
      collapsedText="点击展开远程历史"
      onToggleCollapsed={onToggleCollapsed}
    >
      {sessions.map((session) => (
        <RemoteSessionRow
          key={session.id}
          session={session}
          muted={muted}
          onOpen={() => onOpen(session)}
          onArchive={onArchive ? () => onArchive(session.id) : undefined}
        />
      ))}
    </SessionSidebarGroup>
  )
}

function RemoteSessionRow({
  session,
  muted,
  onOpen,
  onArchive,
}: {
  session: ChatccSession
  muted: boolean
  onOpen: () => void
  onArchive?: () => void
}): React.ReactElement {
  const actions: SessionSidebarAction[] = onArchive
    ? [
        {
          label: '归档',
          title: '在 DeepInk 中归档这个远程会话；不会删除远端历史',
          onAction: onArchive,
        },
      ]
    : []

  return (
    <SessionSidebarRow
      title={session.name}
      rowTitle={session.workspacePath}
      statusKind={sessionStatusKind(session.status)}
      muted={muted}
      time={formatRelativeSessionTime(session.updatedAt)}
      preview={session.workspacePath}
      meta={`${sessionStatusLabel(session.status)} · ${session.messageCount} 条消息${
        session.contextUsage > 0 ? ` · ${Math.round(session.contextUsage)}% 上下文` : ''
      }`}
      actions={actions}
      onOpen={onOpen}
    />
  )
}

export function filterRemoteSessions(sessions: ChatccSession[], query: string): ChatccSession[] {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return sessions

  return sessions.filter((session) =>
    [session.name, session.workspacePath, session.status, session.serverId]
      .join(' ')
      .toLowerCase()
      .includes(normalized),
  )
}

function sessionStatusLabel(status: ChatccSession['status']): string {
  switch (status) {
    case 'active':
      return '运行中'
    case 'archived':
      return '远端归档'
    case 'idle':
    default:
      return '空闲'
  }
}

function sessionStatusKind(status: ChatccSession['status']): SessionSidebarStatusKind {
  switch (status) {
    case 'active':
      return 'running'
    case 'archived':
      return 'closed'
    case 'idle':
    default:
      return 'idle'
  }
}
