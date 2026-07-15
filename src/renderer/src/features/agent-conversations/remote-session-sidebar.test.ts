import { describe, expect, it } from 'vitest'
import type { ChatccSession } from '@shared/chatcc'
import { filterRemoteSessions } from './remote-session-sidebar'

describe('remote session sidebar', () => {
  it('filters remote sessions by name, path, status, and server', () => {
    const sessions = [
      session({ id: 'deploy', name: '部署任务', workspacePath: '/srv/deepink', status: 'active' }),
      session({ id: 'docs', name: '文档整理', workspacePath: '/data/docs', serverId: 'server-a' }),
    ]

    expect(filterRemoteSessions(sessions, '部署').map((item) => item.id)).toEqual(['deploy'])
    expect(filterRemoteSessions(sessions, 'server-a').map((item) => item.id)).toEqual(['docs'])
    expect(filterRemoteSessions(sessions, 'active').map((item) => item.id)).toEqual(['deploy'])
    expect(filterRemoteSessions(sessions, '').map((item) => item.id)).toEqual(['deploy', 'docs'])
  })
})

function session(overrides: Partial<ChatccSession> = {}): ChatccSession {
  return {
    id: overrides.id ?? 'session',
    name: overrides.name ?? '远程会话',
    workspacePath: overrides.workspacePath ?? '/workspace',
    serverId: overrides.serverId ?? 'server-1',
    status: overrides.status ?? 'idle',
    createdAt: overrides.createdAt ?? 1_000,
    updatedAt: overrides.updatedAt ?? 2_000,
    messageCount: overrides.messageCount ?? 3,
    contextUsage: overrides.contextUsage ?? 0,
  }
}
