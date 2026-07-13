import type {
  CclinkFileReadRequest,
  CclinkFileReadResult,
  CclinkFileTreeRequest,
  CclinkFileTreeResult,
  CclinkRemoteError,
  CclinkRemoteErrorLayer,
} from '../../shared/ipc/cclink'
import { REMOTE_ERROR_CODE } from '../../shared/remote-error'
import { createChatccEnvelope } from '../../shared/chatcc/protocol'
import type { ChatccFileReadRequestMessage, ChatccFileReadResponseMessage, ChatccFileTreeRequestMessage, ChatccFileTreeResponseMessage } from '../../shared/chatcc/protocol'
import type { ChatccServer, ChatccWorkspace } from '../../shared/chatcc'
import { CclinkProtocolResponseError, CclinkRequestLayerError } from './cclink-request-router'
import type { CclinkRequestClient } from './cclink-request-router'
import type { CclinkStore } from './cclink-store'

const TRANSPORT_UNAVAILABLE_MESSAGE = 'CCLink 文件浏览尚未接入实时 transport；需要 chatcc-agent 在线并支持 file_tree/file_read 响应。'

interface ValidatedWorkspace {
  ok: true
  server: ChatccServer
  workspace: ChatccWorkspace
}

interface WorkspaceValidationError {
  ok: false
  result: CclinkFileTreeResult & CclinkFileReadResult
}

type CclinkFileFailure = CclinkFileTreeResult & CclinkFileReadResult

export class CclinkFileService {
  constructor(
    private readonly store: CclinkStore,
    private readonly requestClient?: CclinkRequestClient,
  ) {}

  async listFileTree(request: CclinkFileTreeRequest): Promise<CclinkFileTreeResult> {
    const validation = await this.validateWorkspace(request.serverId, request.workspaceId)
    if (!validation.ok) return validation.result

    if (!this.requestClient) {
      return this.transportUnavailable()
    }

    const message: ChatccFileTreeRequestMessage = {
      ...createChatccEnvelope('file_tree_request'),
      path: request.path || validation.workspace.path,
      depth: request.depth,
    }

    try {
      const response = await this.requestClient.request(validation.server.id, message, {
        expectedTypes: ['file_tree_response'],
      })
      if (response.cc_type !== 'file_tree_response') {
        return this.failure(
          'file-provider',
          'UNEXPECTED_FILE_TREE_RESPONSE',
          `收到非预期远程文件树响应：${response.cc_type}`,
          true,
          { serverId: validation.server.id, workspaceId: validation.workspace.id },
        )
      }
      return {
        success: true,
        tree: (response as ChatccFileTreeResponseMessage).tree,
      }
    } catch (error) {
      return this.requestFailure(error, {
        serverId: validation.server.id,
        workspaceId: validation.workspace.id,
        operation: 'file_tree',
      })
    }
  }

  async readFile(request: CclinkFileReadRequest): Promise<CclinkFileReadResult> {
    const validation = await this.validateWorkspace(request.serverId, request.workspaceId)
    if (!validation.ok) return validation.result
    if (!request.path.trim()) {
      return this.failure('file-provider', 'REMOTE_FILE_PATH_REQUIRED', '缺少远程文件路径', false, {
        serverId: request.serverId,
        workspaceId: request.workspaceId,
      })
    }

    if (!this.requestClient) {
      return this.transportUnavailable()
    }

    const message: ChatccFileReadRequestMessage = {
      ...createChatccEnvelope('file_read_request'),
      path: request.path,
      start_line: request.startLine,
      end_line: request.endLine,
    }

    try {
      const response = await this.requestClient.request(validation.server.id, message, {
        expectedTypes: ['file_read_response'],
      })
      if (response.cc_type !== 'file_read_response') {
        return this.failure(
          'file-provider',
          'UNEXPECTED_FILE_READ_RESPONSE',
          `收到非预期远程文件响应：${response.cc_type}`,
          true,
          { serverId: validation.server.id, workspaceId: validation.workspace.id, path: request.path },
        )
      }
      const file = response as ChatccFileReadResponseMessage
      return {
        success: true,
        file: {
          path: file.path,
          content: file.content,
          totalLines: file.total_lines,
          agentModifiedLines: [],
        },
      }
    } catch (error) {
      return this.requestFailure(error, {
        serverId: validation.server.id,
        workspaceId: validation.workspace.id,
        path: request.path,
        operation: 'file_read',
      })
    }
  }

  private async validateWorkspace(
    serverId: string,
    workspaceId: string,
  ): Promise<ValidatedWorkspace | WorkspaceValidationError> {
    if (!serverId || !workspaceId) {
      return {
        ok: false,
        result: this.failure('workspace', 'REMOTE_WORKSPACE_ID_REQUIRED', '缺少远程设备或工作空间 ID', false, {
          serverId,
          workspaceId,
        }),
      }
    }

    const servers = await this.store.listServers()
    const server = servers.find((item) => item.id === serverId)
    if (!server) {
      return {
        ok: false,
        result: this.failure('remote-agent', 'REMOTE_SERVER_NOT_FOUND', '远程设备不存在或尚未同步', true, {
          serverId,
        }),
      }
    }

    const workspace = server.workspaces.find((item) => item.id === workspaceId)
    if (!workspace) {
      return {
        ok: false,
        result: this.failure('workspace', 'REMOTE_WORKSPACE_NOT_FOUND', '远程工作空间不存在或尚未同步', true, {
          serverId,
          workspaceId,
        }),
      }
    }

    if (server.status !== 'online') {
      return {
        ok: false,
        result: this.failure(
          'remote-agent',
          'REMOTE_SERVER_NOT_ONLINE',
          `远程设备当前${server.status === 'connecting' ? '连接中' : '离线'}，无法读取文件树`,
          true,
          { serverId, workspaceId, status: server.status },
          true,
        ),
      }
    }

    return { ok: true, server, workspace }
  }

  private transportUnavailable(error?: unknown): CclinkFileFailure {
    const message = error instanceof Error ? error.message : TRANSPORT_UNAVAILABLE_MESSAGE
    return this.failure('transport', REMOTE_ERROR_CODE.TRANSPORT_UNAVAILABLE, message, true, undefined, true)
  }

  private requestFailure(error: unknown, context: CclinkRemoteError['context']): CclinkFileFailure {
    if (error instanceof CclinkProtocolResponseError) {
      return this.failure(
        'file-provider',
        error.errorType || 'REMOTE_FILE_PROVIDER_ERROR',
        error.message,
        true,
        context,
      )
    }
    if (error instanceof CclinkRequestLayerError) {
      return this.failure(
        error.remoteError.layer,
        error.remoteError.code,
        error.remoteError.message,
        error.remoteError.retryable,
        { ...error.remoteError.context, ...context },
        true,
      )
    }
    return this.transportUnavailable(error)
  }

  private failure(
    layer: CclinkRemoteErrorLayer,
    code: string,
    message: string,
    retryable: boolean,
    context?: CclinkRemoteError['context'],
    unavailable = false,
  ): CclinkFileFailure {
    return {
      success: false,
      unavailable,
      error: message,
      remoteError: {
        layer,
        code,
        message,
        retryable,
        context,
      },
    }
  }
}
