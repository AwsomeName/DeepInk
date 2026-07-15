import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCclinkStore } from './cclink-store'

beforeEach(() => {
  useCclinkStore.setState(useCclinkStore.getInitialState(), true)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useCclinkStore remote session local archive', () => {
  function seedRemoteSession(): void {
    useCclinkStore.setState({
      servers: [
        {
          id: 'server-1',
          name: 'Mac mini',
          hostname: 'mac-mini',
          os: 'Darwin',
          status: 'online',
          agentVersion: '0.8.3',
          claudeVersion: 'unknown',
          lastSeen: 100,
          workspaces: [
            {
              id: 'workspace-1',
              serverId: 'server-1',
              path: '/workspace',
              name: 'workspace',
              sessionCount: 1,
            },
          ],
        },
      ],
      sessions: [
        {
          id: 'remote-session-1',
          name: 'Remote',
          workspacePath: '/workspace',
          serverId: 'server-1',
          status: 'idle',
          createdAt: 100,
          updatedAt: 100,
          messageCount: 0,
          contextUsage: 0,
        },
      ],
    })
  }

  it('归档远程会话只记录本地覆盖状态', () => {
    useCclinkStore.getState().archiveSession('remote-session-1')

    expect(useCclinkStore.getState().archivedSessionIds['remote-session-1']).toEqual(
      expect.any(Number),
    )
  })

  it('恢复远程会话会移除本地归档覆盖状态', () => {
    useCclinkStore.getState().archiveSession('remote-session-1')

    useCclinkStore.getState().restoreArchivedSession('remote-session-1')

    expect(useCclinkStore.getState().archivedSessionIds['remote-session-1']).toBeUndefined()
  })

  it('远程会话消息加载失败时记录错误并继续抛出', async () => {
    vi.stubGlobal('window', {
      deepink: {
        cclink: {
          listMessages: vi.fn().mockRejectedValue(new Error('load failed')),
        },
      },
    })

    await expect(useCclinkStore.getState().loadMessages('remote-session-1')).rejects.toThrow('load failed')
    expect(useCclinkStore.getState().error).toBe('load failed')
  })

  it('远程会话发送失败时记录错误并继续抛出', async () => {
    seedRemoteSession()
    vi.stubGlobal('window', {
      deepink: {
        remote: {
          sendAgentMessage: vi.fn().mockRejectedValue(new Error('send failed')),
        },
      },
    })

    await expect(useCclinkStore.getState().sendLocalMessage('remote-session-1', 'hello')).rejects.toThrow('send failed')
    expect(useCclinkStore.getState().error).toBe('send failed')
  })

  it('远程会话发送 result 失败时保留结构化错误', async () => {
    seedRemoteSession()
    vi.stubGlobal('window', {
      deepink: {
        remote: {
          sendAgentMessage: vi.fn().mockResolvedValue({
            success: false,
            error: '远程会话不存在或尚未同步',
            remoteError: {
              layer: 'execution-backend',
              code: 'REMOTE_SESSION_NOT_FOUND',
              message: '远程会话不存在或尚未同步',
              retryable: true,
              context: { sessionId: 'remote-session-1' },
            },
          }),
        },
      },
    })

    await expect(useCclinkStore.getState().sendLocalMessage('remote-session-1', 'hello')).rejects.toThrow('远程会话不存在')
    expect(useCclinkStore.getState().remoteError).toMatchObject({
      layer: 'execution-backend',
      code: 'REMOTE_SESSION_NOT_FOUND',
    })
  })
})
