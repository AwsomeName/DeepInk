import type {
  ChatccAgentToolMessage,
  ChatccMessage,
  ChatccServer,
  ChatccSession,
  ChatccToolType,
} from '../../shared/chatcc'
import { REMOTE_ERROR_CODE, type RemoteError } from '../../shared/remote-error'
import type { ChatccProtocolMessage } from '../../shared/chatcc/protocol'
import { isChatccProtocolCompatible } from '../../shared/chatcc/protocol'
import type { CclinkStore } from './cclink-store'

interface StreamBuffer {
  sessionId: string
  msgId: string
  chunks: string[]
  startedAt: number
}

const STREAM_BUFFER_TTL_MS = 10 * 60_000

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000)
}

function messageId(prefix: string, id: string): string {
  return `${prefix}-${id}`
}

function streamKey(serverId: string, msgId: string): string {
  return `${serverId}:${msgId}`
}

function toolTypeFromName(toolName: string): ChatccToolType {
  const normalized = toolName.toLowerCase()
  if (normalized.includes('read')) return 'read'
  if (normalized.includes('edit')) return 'edit'
  if (normalized.includes('write')) return 'write'
  if (normalized.includes('bash') || normalized.includes('shell')) return 'bash'
  return 'unknown'
}

function remoteExecutionError(
  code: string,
  message: string,
  context: NonNullable<RemoteError['context']>,
): RemoteError {
  return {
    layer: 'execution-backend',
    code,
    message,
    retryable: true,
    context,
  }
}

function remoteErrorFromProtocolError(
  serverId: string,
  message: Extract<ChatccProtocolMessage, { cc_type: 'error' }>,
): RemoteError {
  return {
    layer: message.layer ?? 'execution-backend',
    code: message.code ?? message.error_type ?? REMOTE_ERROR_CODE.AGENT_ERROR,
    message: message.message,
    retryable: message.retryable ?? true,
    context: {
      ...message.context,
      serverId,
      sessionId: message.session_id ?? null,
      requestId: message.request_id ?? null,
    },
  }
}

export class CclinkProtocolRouter {
  private readonly streamBuffers = new Map<string, StreamBuffer>()

  constructor(private readonly store: Pick<CclinkStore, 'upsertServer' | 'upsertSession' | 'appendMessage'>) {}

  async handleMessage(serverId: string, message: ChatccProtocolMessage): Promise<boolean> {
    if (!isChatccProtocolCompatible(message)) {
      throw new Error('CCLink 协议版本不兼容')
    }

    this.cleanupExpiredStreams()

    switch (message.cc_type) {
      case 'server_meta':
        await this.handleServerMeta(message)
        return true
      case 'session_sync_response':
        await this.handleSessionSync(serverId, message.sessions)
        return true
      case 'user_text':
        await this.store.appendMessage(message.session_id, {
          type: 'user',
          id: messageId('remote-user', message.request_id ?? `${Date.now()}`),
          content: message.content,
          timestamp: nowSeconds(),
        })
        return true
      case 'stream_start':
        this.streamBuffers.set(streamKey(serverId, message.msg_id), {
          sessionId: message.session_id,
          msgId: message.msg_id,
          chunks: [],
          startedAt: Date.now(),
        })
        return true
      case 'stream_chunk': {
        const key = streamKey(serverId, message.msg_id)
        const buffer = this.streamBuffers.get(key) ?? {
          sessionId: message.session_id,
          msgId: message.msg_id,
          chunks: [],
          startedAt: Date.now(),
        }
        buffer.chunks.push(message.delta)
        this.streamBuffers.set(key, buffer)
        return true
      }
      case 'stream_end':
        await this.handleStreamEnd(serverId, message.session_id, message.msg_id, message.error)
        return true
      case 'agent_tool':
        await this.store.appendMessage(message.session_id, this.toToolMessage(message))
        return true
      case 'terminal_output':
        await this.store.appendMessage(message.session_id, {
          type: 'system',
          id: messageId('remote-terminal', message.request_id ?? `${Date.now()}`),
          content: message.content,
          timestamp: nowSeconds(),
        })
        return true
      case 'error':
        if (!message.session_id) return false
        await this.store.appendMessage(message.session_id, {
          type: 'system',
          id: messageId('remote-error', message.request_id ?? `${Date.now()}`),
          content: message.message,
          timestamp: nowSeconds(),
          remoteError: remoteErrorFromProtocolError(serverId, message),
        })
        return true
      default:
        return false
    }
  }

  private async handleServerMeta(message: Extract<ChatccProtocolMessage, { cc_type: 'server_meta' }>): Promise<void> {
    const server: ChatccServer = {
      id: message.agent_id,
      name: message.hostname,
      hostname: message.hostname,
      os: message.os,
      status: 'online',
      agentVersion: message.agent_version,
      claudeVersion: message.claude_version ?? 'unknown',
      lastSeen: nowSeconds(),
      workspaces: (message.workspaces ?? []).map((workspace) => ({
        id: `${message.agent_id}:${workspace.path}`,
        path: workspace.path,
        name: workspace.name,
        serverId: message.agent_id,
        sessionCount: workspace.session_count ?? 0,
      })),
    }
    await this.store.upsertServer(server)
  }

  private async handleSessionSync(
    serverId: string,
    sessions: Extract<ChatccProtocolMessage, { cc_type: 'session_sync_response' }>['sessions'],
  ): Promise<void> {
    for (const session of sessions) {
      const record: ChatccSession = {
        id: session.session_id,
        name: session.name,
        workspacePath: session.workspace_path,
        serverId,
        status: 'idle',
        createdAt: session.updated_at,
        updatedAt: session.updated_at,
        messageCount: session.message_count ?? 0,
        contextUsage: session.context_usage ?? 0,
      }
      await this.store.upsertSession(record)
    }
  }

  private async handleStreamEnd(serverId: string, sessionId: string, msgId: string, error?: string): Promise<void> {
    const key = streamKey(serverId, msgId)
    const buffer = this.streamBuffers.get(key)
    this.streamBuffers.delete(key)

    if (error) {
      await this.store.appendMessage(sessionId, {
        type: 'system',
        id: messageId('remote-stream-error', msgId),
        content: error,
        timestamp: nowSeconds(),
        remoteError: remoteExecutionError(REMOTE_ERROR_CODE.STREAM_ERROR, error, {
          serverId,
          sessionId,
          msgId,
        }),
      })
      return
    }

    const content = buffer?.chunks.join('') ?? ''
    if (!content.trim()) return

    await this.store.appendMessage(sessionId, {
      type: 'agentText',
      id: messageId('remote-agent', msgId),
      content,
      timestamp: nowSeconds(),
      fileRefs: [],
    })
  }

  private toToolMessage(message: Extract<ChatccProtocolMessage, { cc_type: 'agent_tool' }>): ChatccAgentToolMessage {
    return {
      type: 'agentTool',
      id: messageId('remote-tool', message.msg_id),
      timestamp: nowSeconds(),
      tool: {
        id: message.tool_use_id,
        toolType: toolTypeFromName(message.tool),
        toolState: message.state,
        target: message.tool,
        preview: message.preview,
        result: message.output,
        diffLines: message.diff,
        requiresApproval: message.requires_approval ?? false,
        output: message.output,
        summary: message.summary,
        exitCode: message.exit_code,
      },
    }
  }

  private cleanupExpiredStreams(): void {
    const deadline = Date.now() - STREAM_BUFFER_TTL_MS
    for (const [key, buffer] of this.streamBuffers.entries()) {
      if (buffer.startedAt < deadline) {
        this.streamBuffers.delete(key)
      }
    }
  }
}
