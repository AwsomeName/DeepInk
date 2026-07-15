import { describe, expect, it } from 'vitest'
import type { ChatccMessage, ChatccServer, ChatccSession } from '../../shared/chatcc'
import { CclinkProtocolRouter } from './cclink-protocol-router'

class FakeStore {
  servers: ChatccServer[] = []
  sessions: ChatccSession[] = []
  messages: Record<string, ChatccMessage[]> = {}

  async upsertServer(server: ChatccServer): Promise<void> {
    this.servers = [server, ...this.servers.filter((item) => item.id !== server.id)]
  }

  async upsertSession(session: ChatccSession): Promise<void> {
    this.sessions = [session, ...this.sessions.filter((item) => item.id !== session.id)]
  }

  async appendMessage(sessionId: string, message: ChatccMessage): Promise<void> {
    this.messages[sessionId] = [...(this.messages[sessionId] ?? []), message]
  }
}

describe('CclinkProtocolRouter', () => {
  it('stores server metadata and workspaces', async () => {
    const store = new FakeStore()
    const router = new CclinkProtocolRouter(store)

    const handled = await router.handleMessage('agent-1', {
      cc_type: 'server_meta',
      v: 2,
      min_v: 2,
      agent_id: 'agent-1',
      hostname: 'Mac mini',
      os: 'Darwin',
      agent_version: '0.8.0',
      protocol_version: 2,
      claude_version: '1.0.0',
      workspaces: [{ path: '/workspace', name: 'workspace', session_count: 2 }],
    })

    expect(handled).toBe(true)
    expect(store.servers[0]).toMatchObject({
      id: 'agent-1',
      hostname: 'Mac mini',
      status: 'online',
      protocolVersion: '2',
      workspaces: [{ id: 'agent-1:/workspace', path: '/workspace', sessionCount: 2 }],
    })
  })

  it('stores synced sessions', async () => {
    const store = new FakeStore()
    const router = new CclinkProtocolRouter(store)

    await router.handleMessage('agent-1', {
      cc_type: 'session_sync_response',
      v: 2,
      min_v: 2,
      sessions: [{
        session_id: 'sess-1',
        name: '远程任务',
        workspace_path: '/workspace',
        updated_at: 100,
        message_count: 3,
        context_usage: 10,
      }],
    })

    expect(store.sessions[0]).toMatchObject({
      id: 'sess-1',
      name: '远程任务',
      serverId: 'agent-1',
      workspacePath: '/workspace',
      messageCount: 3,
    })
  })

  it('stores streamed agent text on stream end', async () => {
    const store = new FakeStore()
    const router = new CclinkProtocolRouter(store)

    await router.handleMessage('agent-1', {
      cc_type: 'stream_start',
      v: 2,
      min_v: 2,
      session_id: 'sess-1',
      msg_id: 'msg-1',
    })
    await router.handleMessage('agent-1', {
      cc_type: 'stream_chunk',
      v: 2,
      min_v: 2,
      session_id: 'sess-1',
      msg_id: 'msg-1',
      delta: '你好，',
    })
    await router.handleMessage('agent-1', {
      cc_type: 'stream_chunk',
      v: 2,
      min_v: 2,
      session_id: 'sess-1',
      msg_id: 'msg-1',
      delta: 'DeepInk',
    })
    await router.handleMessage('agent-1', {
      cc_type: 'stream_end',
      v: 2,
      min_v: 2,
      session_id: 'sess-1',
      msg_id: 'msg-1',
    })

    expect(store.messages['sess-1'][0]).toMatchObject({
      type: 'agentText',
      id: 'remote-agent-msg-1',
      content: '你好，DeepInk',
    })
  })

  it('stores stream end errors with structured remote error', async () => {
    const store = new FakeStore()
    const router = new CclinkProtocolRouter(store)

    await router.handleMessage('agent-1', {
      cc_type: 'stream_end',
      v: 2,
      min_v: 2,
      session_id: 'sess-1',
      msg_id: 'msg-1',
      error: '远端执行失败',
    })

    expect(store.messages['sess-1'][0]).toMatchObject({
      type: 'system',
      content: '远端执行失败',
      remoteError: {
        layer: 'execution-backend',
        code: 'REMOTE_STREAM_ERROR',
        retryable: true,
        context: {
          serverId: 'agent-1',
          sessionId: 'sess-1',
          msgId: 'msg-1',
        },
      },
    })
  })

  it('stores remote protocol errors with structured remote error', async () => {
    const store = new FakeStore()
    const router = new CclinkProtocolRouter(store)

    await router.handleMessage('agent-1', {
      cc_type: 'error',
      v: 2,
      min_v: 2,
      session_id: 'sess-1',
      request_id: 'req-1',
      message: '远端 Agent 不可用',
      error_type: 'REMOTE_AGENT_UNAVAILABLE',
    })

    expect(store.messages['sess-1'][0]).toMatchObject({
      type: 'system',
      content: '远端 Agent 不可用',
      remoteError: {
        layer: 'execution-backend',
        code: 'REMOTE_AGENT_UNAVAILABLE',
        retryable: true,
        context: {
          serverId: 'agent-1',
          sessionId: 'sess-1',
          requestId: 'req-1',
        },
      },
    })
  })

  it('preserves structured remote protocol error fields', async () => {
    const store = new FakeStore()
    const router = new CclinkProtocolRouter(store)

    await router.handleMessage('agent-1', {
      cc_type: 'error',
      v: 2,
      min_v: 2,
      session_id: 'sess-1',
      request_id: 'req-1',
      message: '远程工作空间不存在',
      layer: 'workspace',
      code: 'REMOTE_WORKSPACE_NOT_FOUND',
      retryable: false,
      context: {
        workspaceId: 'ws-1',
        operation: 'openWorkspace',
      },
    })

    expect(store.messages['sess-1'][0]).toMatchObject({
      type: 'system',
      content: '远程工作空间不存在',
      remoteError: {
        layer: 'workspace',
        code: 'REMOTE_WORKSPACE_NOT_FOUND',
        retryable: false,
        context: {
          workspaceId: 'ws-1',
          operation: 'openWorkspace',
          serverId: 'agent-1',
          sessionId: 'sess-1',
          requestId: 'req-1',
        },
      },
    })
  })
})
