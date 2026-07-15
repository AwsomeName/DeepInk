import type { CclinkFileService } from '../cclink/cclink-file-service'
import type { CclinkRequestClient } from '../cclink/cclink-request-router'
import type { CclinkStore } from '../cclink/cclink-store'
import type {
  RemoteCapabilitySet,
  RemoteAgentMessageRequest,
  RemoteAgentMessageResult,
  RemoteFileCreateRequest,
  RemoteFileDeleteRequest,
  RemoteFileMutationResult,
  RemoteFileReadRequest,
  RemoteFileReadResult,
  RemoteFileRenameRequest,
  RemoteFileTreeRequest,
  RemoteFileTreeResult,
  RemoteFileWriteRequest,
  RemoteProvider,
  RemoteStatus,
} from '../../shared/remote-protocol'
import { emptyRemoteCapabilities } from '../../shared/remote-protocol'
import { createChatccEnvelope } from '../../shared/chatcc/protocol'
import type { ChatccCapabilityProbeResponseMessage } from '../../shared/chatcc/protocol'
import type { RemoteWorkspaceRef } from '../../shared/workspace-ref'
import { buildRemoteProtocolCompatibility } from '../../shared/remote-compatibility'
import { REMOTE_ERROR_CODE } from '../../shared/remote-error'
import type { RemoteError } from '../../shared/remote-error'

export class CclinkRemoteProvider implements RemoteProvider {
  readonly transport = 'cclink' as const

  constructor(
    private readonly store: CclinkStore,
    private readonly fileService?: CclinkFileService,
    private readonly requestClient?: CclinkRequestClient,
  ) {}

  async getStatus(ref: RemoteWorkspaceRef): Promise<RemoteStatus> {
    const capabilities = await this.getCapabilities(ref)
    const servers = await this.store.listServers()
    const server = servers.find((item) => item.id === ref.endpointId)
    const workspace = server?.workspaces.find((item) => item.id === ref.workspaceId)

    if (!server) {
      const compatibility = buildRemoteProtocolCompatibility()
      return {
        ref,
        transport: 'cclink',
        state: 'unknown',
        workspacePath: ref.path,
        capabilities,
        compatibility,
        remoteError: this.error('remote-agent', 'REMOTE_SERVER_NOT_FOUND', '远程设备不存在或尚未同步', true, {
          endpointId: ref.endpointId,
        }),
      }
    }

    const compatibility = buildRemoteProtocolCompatibility(server.protocolVersion)

    if (!workspace) {
      return {
        ref,
        transport: 'cclink',
        state: server.status,
        endpointName: server.name,
        endpointHost: server.hostname,
        agentVersion: server.agentVersion,
        protocolVersion: server.protocolVersion,
        compatibility,
        lastSeen: server.lastSeen,
        workspacePath: ref.path,
        capabilities,
        remoteError: this.error('workspace', 'REMOTE_WORKSPACE_NOT_FOUND', '远程工作空间不存在或尚未同步', true, {
          endpointId: ref.endpointId,
          workspaceId: ref.workspaceId,
        }),
      }
    }

    return {
      ref,
      transport: 'cclink',
      state: server.status,
      endpointName: server.name,
      endpointHost: server.hostname,
      agentVersion: server.agentVersion,
      protocolVersion: server.protocolVersion,
      compatibility,
      lastSeen: server.lastSeen,
      workspacePath: workspace.path,
      capabilities,
      remoteError:
        server.status === 'online'
          ? undefined
          : this.error(
              'remote-agent',
              'REMOTE_SERVER_NOT_ONLINE',
              `远程设备当前${server.status === 'connecting' ? '连接中' : '离线'}`,
              true,
              { endpointId: ref.endpointId, status: server.status },
            ),
    }
  }

  async getCapabilities(ref: RemoteWorkspaceRef): Promise<RemoteCapabilitySet> {
    const capabilities = emptyRemoteCapabilities()
    const servers = await this.store.listServers()
    const server = servers.find((item) => item.id === ref.endpointId)
    const workspace = server?.workspaces.find((item) => item.id === ref.workspaceId)
    const online = server?.status === 'online' && Boolean(workspace)
    const probe = online ? await this.getLiveCapabilityProbe(ref) : null
    const serverCapabilities = probe?.capability_map ?? server?.capabilities
    const groupedCapabilities = probe?.capabilities

    if (groupedCapabilities) {
      capabilities.file.tree = online && groupedCapabilities.file?.tree === true && Boolean(this.fileService)
      capabilities.file.read = online && groupedCapabilities.file?.read === true && Boolean(this.fileService)
      capabilities.file.create = false
      capabilities.shell.command = online && groupedCapabilities.shell?.terminal_basic === true
      capabilities.shell.cwd = capabilities.shell.command
      capabilities.agent.claudeCode = online && server?.claudeVersion !== 'unknown'
      capabilities.agent.deepinkAgent =
        online &&
        (groupedCapabilities.agent?.runtime_select === true ||
          groupedCapabilities.agent?.stream_json_input === true)
      capabilities.session.list = Boolean(server) && groupedCapabilities.session?.sync !== false
      capabilities.session.resume = Boolean(server)
      capabilities.session.stream = online && groupedCapabilities.session?.streaming === true
    } else if (serverCapabilities) {
      capabilities.file.tree =
        online && this.hasCapability(serverCapabilities, 'file_tree') && Boolean(this.fileService)
      capabilities.file.read =
        online && this.hasCapability(serverCapabilities, 'file_read') && Boolean(this.fileService)
      capabilities.file.create = false
      capabilities.shell.command = online && this.hasCapability(serverCapabilities, 'terminal_basic')
      capabilities.shell.cwd = capabilities.shell.command
      capabilities.agent.claudeCode = online && server?.claudeVersion !== 'unknown'
      capabilities.agent.deepinkAgent =
        online &&
        (this.hasCapability(serverCapabilities, 'runtime_select') ||
          this.hasCapability(serverCapabilities, 'stream_json_input'))
      capabilities.session.list = Boolean(server)
      capabilities.session.resume = Boolean(server)
      capabilities.session.stream = online && this.hasCapability(serverCapabilities, 'stream_json_input')
    } else {
      capabilities.file.tree = online && Boolean(this.fileService)
      capabilities.file.read = online && Boolean(this.fileService)
      capabilities.session.list = Boolean(server)
      capabilities.session.resume = Boolean(server)
      capabilities.session.stream = online
      capabilities.agent.claudeCode = online && server?.claudeVersion !== 'unknown'
      capabilities.agent.deepinkAgent = online
      capabilities.shell.command = online
      capabilities.shell.cwd = online
    }

    return capabilities
  }

  private async getLiveCapabilityProbe(
    ref: RemoteWorkspaceRef,
  ): Promise<ChatccCapabilityProbeResponseMessage | null> {
    if (!this.requestClient) return null
    try {
      const response = await this.requestClient.request(
        ref.endpointId,
        createChatccEnvelope('capability_probe_request'),
        { expectedTypes: ['capability_probe_response'], timeoutMs: 3_000 },
      )
      return response.cc_type === 'capability_probe_response' ? response : null
    } catch {
      return null
    }
  }

  async listFileTree(request: RemoteFileTreeRequest): Promise<RemoteFileTreeResult> {
    if (!this.fileService) {
      return this.unavailable('CCLink 文件服务未初始化')
    }
    return this.fileService.listFileTree({
      serverId: request.ref.endpointId,
      workspaceId: request.ref.workspaceId,
      path: request.path,
      depth: request.depth,
    })
  }

  async readFile(request: RemoteFileReadRequest): Promise<RemoteFileReadResult> {
    if (!this.fileService) {
      return this.unavailable('CCLink 文件服务未初始化')
    }
    return this.fileService.readFile({
      serverId: request.ref.endpointId,
      workspaceId: request.ref.workspaceId,
      path: request.path,
      startLine: request.startLine,
      endLine: request.endLine,
    })
  }

  async writeFile(_request: RemoteFileWriteRequest): Promise<RemoteFileMutationResult> {
    return this.fileWriteUnavailable('CCLink 远程文件写入协议尚未接入')
  }

  async createFile(_request: RemoteFileCreateRequest): Promise<RemoteFileMutationResult> {
    return this.fileWriteUnavailable('CCLink 远程文件创建协议尚未接入')
  }

  async renameFile(_request: RemoteFileRenameRequest): Promise<RemoteFileMutationResult> {
    return this.fileWriteUnavailable('CCLink 远程文件重命名协议尚未接入')
  }

  async deleteFile(_request: RemoteFileDeleteRequest): Promise<RemoteFileMutationResult> {
    return this.fileWriteUnavailable('CCLink 远程文件删除协议尚未接入')
  }

  async sendAgentMessage(request: RemoteAgentMessageRequest): Promise<RemoteAgentMessageResult> {
    return this.store.sendLocalMessage(request.sessionId, request.content)
  }

  private unavailable(message: string): RemoteFileTreeResult & RemoteFileReadResult {
    return {
      success: false,
      unavailable: true,
      error: message,
      remoteError: this.error('file-provider', REMOTE_ERROR_CODE.PROVIDER_ERROR, message, true),
    }
  }

  private fileWriteUnavailable(message: string): RemoteFileMutationResult {
    return {
      success: false,
      unavailable: true,
      error: message,
      remoteError: this.error('file-provider', REMOTE_ERROR_CODE.CAPABILITY_UNAVAILABLE, message, true),
    }
  }

  private hasCapability(capabilities: Record<string, boolean>, key: string): boolean {
    return capabilities[key] === true
  }

  private error(
    layer: RemoteError['layer'],
    code: string,
    message: string,
    retryable: boolean,
    context?: RemoteError['context'],
  ): RemoteError {
    return { layer, code, message, retryable, context }
  }
}
