import { describe, expect, it } from 'vitest'
import type { ChatccServer, ChatccSession } from '@shared/chatcc'
import { workspaceRefKey, workspaceRefSourceLabel } from '../../../shared/workspace-ref'
import {
  getArchivedCclinkRemoteWorkspaceSessions,
  getCclinkRemoteWorkspaceItems,
  getCclinkRemoteWorkspaceSessions,
} from './remote-workspaces'

function server(overrides: Partial<ChatccServer> = {}): ChatccServer {
  return {
    id: 'server-1',
    name: 'Mac mini',
    hostname: 'mac-mini',
    os: 'Darwin',
    status: 'online',
    agentVersion: '0.1.0',
    claudeVersion: '1.0.0',
    lastSeen: 1,
    workspaces: [
      {
        id: 'workspace-a',
        name: 'project-a',
        path: '/data/project-a',
        serverId: 'server-1',
        sessionCount: 2,
      },
    ],
    ...overrides,
  }
}

function session(overrides: Partial<ChatccSession> = {}): ChatccSession {
  return {
    id: 'session-1',
    name: '远程任务',
    workspacePath: '/data/project-a',
    serverId: 'server-1',
    status: 'active',
    createdAt: 1,
    updatedAt: 10,
    messageCount: 1,
    contextUsage: 0,
    ...overrides,
  }
}

describe('remote-workspaces', () => {
  it('把 CCLink 服务器工作区平铺为稳定远程工作空间引用', () => {
    const [first] = getCclinkRemoteWorkspaceItems([server()])
    const [renamed] = getCclinkRemoteWorkspaceItems([server({ name: 'Renamed Mac mini' })])

    expect(workspaceRefKey(first.ref)).toBe('cclink://server-1/workspace-a')
    expect(workspaceRefKey(renamed.ref)).toBe(workspaceRefKey(first.ref))
    expect(workspaceRefSourceLabel(renamed.ref)).toBe('远程 · CCLink · Renamed Mac mini')
  })

  it('按远程工作空间筛选会话，并按更新时间倒序展示', () => {
    const [workspace] = getCclinkRemoteWorkspaceItems([server()])
    const sessions = [
      session({ id: 'old', updatedAt: 1 }),
      session({ id: 'new', updatedAt: 20 }),
      session({ id: 'other-server', serverId: 'server-2', updatedAt: 30 }),
      session({ id: 'other-workspace', workspacePath: '/data/other', updatedAt: 40 }),
    ]

    expect(getCclinkRemoteWorkspaceSessions(workspace.ref, sessions).map((item) => item.id)).toEqual(
      ['new', 'old'],
    )
  })

  it('远程会话归档只是本地视图覆盖，不污染未归档列表', () => {
    const [workspace] = getCclinkRemoteWorkspaceItems([server()])
    const sessions = [session({ id: 'visible' }), session({ id: 'archived', updatedAt: 30 })]
    const archivedSessionIds = { archived: 100 }

    expect(
      getCclinkRemoteWorkspaceSessions(workspace.ref, sessions, archivedSessionIds).map(
        (item) => item.id,
      ),
    ).toEqual(['visible'])
    expect(
      getArchivedCclinkRemoteWorkspaceSessions(workspace.ref, sessions, archivedSessionIds).map(
        (item) => item.id,
      ),
    ).toEqual(['archived'])
  })
})
