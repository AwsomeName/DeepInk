import { ipcMain } from 'electron'
import type { RemoteProviderRegistry } from '../remote/remote-provider-registry'
import type {
  RemoteAgentMessageRequest,
  RemoteFileCreateRequest,
  RemoteFileDeleteRequest,
  RemoteFileReadRequest,
  RemoteFileRenameRequest,
  RemoteFileTreeRequest,
  RemoteFileWriteRequest,
} from '../../shared/remote-protocol'
import type { RemoteWorkspaceRef } from '../../shared/workspace-ref'
import type { TokenManager } from '../auth/token-manager'
import type { SubscriptionService } from '../subscription/subscription-service'
import { checkEntitlement } from '../subscription/feature-gate'
import type { Entitlement } from '../../shared/ipc/subscription'
import { REMOTE_ERROR_CODE, type RemoteError } from '../../shared/remote-error'
import { buildRemoteProtocolCompatibility } from '../../shared/remote-compatibility'
import { buildRemoteDiagnosticReport } from '../remote/remote-diagnostics'
import { RemoteDiagnosticLog } from '../remote/remote-diagnostic-log'

export function registerRemoteIpc(
  registry: RemoteProviderRegistry,
  tokenManager: TokenManager,
  subscriptionService: SubscriptionService,
  diagnosticLog = new RemoteDiagnosticLog(),
): void {
  ipcMain.handle('remote:getStatus', async (_event, ref: RemoteWorkspaceRef) => {
    const traceId = diagnosticLog.createTraceId()
    const gate = await gateRemote('远程工作空间', 'remote_workspace', tokenManager, subscriptionService)
    if (!gate.allowed) {
      const remoteError = traceRemoteError(entitlementError(gate.reason || '没有远程工作空间权限'), traceId)
      diagnosticLog.record({
        traceId,
        operation: 'remote:getStatus',
        ref,
        message: remoteError.message,
        remoteError,
      })
      return {
        ref,
        transport: ref.transport,
        state: 'unknown',
        workspacePath: ref.path,
        capabilities: emptyCapabilities(),
        compatibility: buildRemoteProtocolCompatibility(),
        remoteError,
      }
    }

    const status = traceStatus(
      diagnosticLog,
      'remote:getStatus',
      ref,
      traceId,
      await registry.get(ref).getStatus(ref),
    )
    const terminalGate = await gateRemote('远程 Terminal', 'remote_terminal', tokenManager, subscriptionService)
    const agentGate = await gateRemote('远程 Agent 会话', 'remote_agent_session', tokenManager, subscriptionService)

    return {
      ...status,
      capabilities: {
        ...status.capabilities,
        shell: terminalGate.allowed
          ? status.capabilities.shell
          : {
              ...status.capabilities.shell,
              command: false,
              pty: false,
              cwd: false,
            },
        agent: agentGate.allowed
          ? status.capabilities.agent
          : {
              codex: false,
              claudeCode: false,
              deepinkAgent: false,
              custom: false,
            },
        session: agentGate.allowed
          ? status.capabilities.session
          : {
              ...status.capabilities.session,
              resume: false,
              stream: false,
              archive: false,
            },
      },
    }
  })

  ipcMain.handle('remote:getDiagnostics', async (_event, ref: RemoteWorkspaceRef) => {
    const traceId = diagnosticLog.createTraceId()
    const workspaceGate = await gateRemote('远程工作空间', 'remote_workspace', tokenManager, subscriptionService)
    const terminalGate = await gateRemote('远程 Terminal', 'remote_terminal', tokenManager, subscriptionService)
    const agentGate = await gateRemote('远程 Agent 会话', 'remote_agent_session', tokenManager, subscriptionService)
    const fileWriteGate = await gateRemote('远程文件写入', 'remote_file_write', tokenManager, subscriptionService)
    const status = workspaceGate.allowed
      ? traceStatus(
          diagnosticLog,
          'remote:getDiagnostics',
          ref,
          traceId,
          await registry.get(ref).getStatus(ref),
        )
      : recordStatusError(diagnosticLog, 'remote:getDiagnostics', ref, traceId, {
          ref,
          transport: ref.transport,
          state: 'unknown' as const,
          workspacePath: ref.path,
          capabilities: emptyCapabilities(),
          compatibility: buildRemoteProtocolCompatibility(),
          remoteError: entitlementError(workspaceGate.reason || '没有远程工作空间权限'),
        })

    return buildRemoteDiagnosticReport({
      ref,
      status,
      traceId,
      recentErrors: diagnosticLog.recentForRef(ref),
      gates: {
        workspace: workspaceGate,
        terminal: terminalGate,
        agentSession: agentGate,
        fileWrite: fileWriteGate,
      },
    })
  })

  ipcMain.handle('remote:listFileTree', async (_event, request: RemoteFileTreeRequest) => {
    const traceId = diagnosticLog.createTraceId()
    const gate = await gateRemote('远程文件读取', 'remote_file_read', tokenManager, subscriptionService)
    if (!gate.allowed) {
      return deniedResult(
        diagnosticLog,
        'remote:listFileTree',
        request.ref,
        traceId,
        gate.reason || '没有远程文件读取权限',
      )
    }
    const provider = registry.get(request.ref)
    if (!provider.listFileTree) {
      return unavailableResult(
        diagnosticLog,
        'remote:listFileTree',
        request.ref,
        traceId,
        '远程文件树能力暂不可用',
        'file-provider',
      )
    }
    return traceResult(
      diagnosticLog,
      'remote:listFileTree',
      request.ref,
      traceId,
      await provider.listFileTree(request),
    )
  })

  ipcMain.handle('remote:readFile', async (_event, request: RemoteFileReadRequest) => {
    const traceId = diagnosticLog.createTraceId()
    const gate = await gateRemote('远程文件读取', 'remote_file_read', tokenManager, subscriptionService)
    if (!gate.allowed) {
      return deniedResult(
        diagnosticLog,
        'remote:readFile',
        request.ref,
        traceId,
        gate.reason || '没有远程文件读取权限',
      )
    }
    const provider = registry.get(request.ref)
    if (!provider.readFile) {
      return unavailableResult(
        diagnosticLog,
        'remote:readFile',
        request.ref,
        traceId,
        '远程文件读取能力暂不可用',
        'file-provider',
      )
    }
    return traceResult(diagnosticLog, 'remote:readFile', request.ref, traceId, await provider.readFile(request))
  })

  ipcMain.handle('remote:writeFile', async (_event, request: RemoteFileWriteRequest) => {
    const traceId = diagnosticLog.createTraceId()
    const gate = await gateRemote('远程文件写入', 'remote_file_write', tokenManager, subscriptionService)
    if (!gate.allowed) {
      return deniedResult(
        diagnosticLog,
        'remote:writeFile',
        request.ref,
        traceId,
        gate.reason || '没有远程文件写入权限',
      )
    }
    const provider = registry.get(request.ref)
    if (!provider.writeFile) {
      return unavailableResult(
        diagnosticLog,
        'remote:writeFile',
        request.ref,
        traceId,
        '远程文件写入能力暂不可用',
        'file-provider',
      )
    }
    return traceResult(diagnosticLog, 'remote:writeFile', request.ref, traceId, await provider.writeFile(request))
  })

  ipcMain.handle('remote:createFile', async (_event, request: RemoteFileCreateRequest) => {
    const traceId = diagnosticLog.createTraceId()
    const gate = await gateRemote('远程文件创建', 'remote_file_write', tokenManager, subscriptionService)
    if (!gate.allowed) {
      return deniedResult(
        diagnosticLog,
        'remote:createFile',
        request.ref,
        traceId,
        gate.reason || '没有远程文件创建权限',
      )
    }
    const provider = registry.get(request.ref)
    if (!provider.createFile) {
      return unavailableResult(
        diagnosticLog,
        'remote:createFile',
        request.ref,
        traceId,
        '远程文件创建能力暂不可用',
        'file-provider',
      )
    }
    return traceResult(diagnosticLog, 'remote:createFile', request.ref, traceId, await provider.createFile(request))
  })

  ipcMain.handle('remote:renameFile', async (_event, request: RemoteFileRenameRequest) => {
    const traceId = diagnosticLog.createTraceId()
    const gate = await gateRemote('远程文件重命名', 'remote_file_write', tokenManager, subscriptionService)
    if (!gate.allowed) {
      return deniedResult(
        diagnosticLog,
        'remote:renameFile',
        request.ref,
        traceId,
        gate.reason || '没有远程文件重命名权限',
      )
    }
    const provider = registry.get(request.ref)
    if (!provider.renameFile) {
      return unavailableResult(
        diagnosticLog,
        'remote:renameFile',
        request.ref,
        traceId,
        '远程文件重命名能力暂不可用',
        'file-provider',
      )
    }
    return traceResult(diagnosticLog, 'remote:renameFile', request.ref, traceId, await provider.renameFile(request))
  })

  ipcMain.handle('remote:deleteFile', async (_event, request: RemoteFileDeleteRequest) => {
    const traceId = diagnosticLog.createTraceId()
    const gate = await gateRemote('远程文件删除', 'remote_file_write', tokenManager, subscriptionService)
    if (!gate.allowed) {
      return deniedResult(
        diagnosticLog,
        'remote:deleteFile',
        request.ref,
        traceId,
        gate.reason || '没有远程文件删除权限',
      )
    }
    const provider = registry.get(request.ref)
    if (!provider.deleteFile) {
      return unavailableResult(
        diagnosticLog,
        'remote:deleteFile',
        request.ref,
        traceId,
        '远程文件删除能力暂不可用',
        'file-provider',
      )
    }
    return traceResult(diagnosticLog, 'remote:deleteFile', request.ref, traceId, await provider.deleteFile(request))
  })

  ipcMain.handle('remote:sendAgentMessage', async (_event, request: RemoteAgentMessageRequest) => {
    const traceId = diagnosticLog.createTraceId()
    const gate = await gateRemote('远程 Agent 会话', 'remote_agent_session', tokenManager, subscriptionService)
    if (!gate.allowed) {
      return deniedResult(
        diagnosticLog,
        'remote:sendAgentMessage',
        request.ref,
        traceId,
        gate.reason || '没有远程 Agent 会话权限',
      )
    }
    const provider = registry.get(request.ref)
    if (!provider.sendAgentMessage) {
      return unavailableResult(
        diagnosticLog,
        'remote:sendAgentMessage',
        request.ref,
        traceId,
        '远程 Agent 会话发送能力暂不可用',
        'execution-backend',
      )
    }
    return traceResult(
      diagnosticLog,
      'remote:sendAgentMessage',
      request.ref,
      traceId,
      await provider.sendAgentMessage(request),
    )
  })
}

function gateRemote(
  featureName: string,
  entitlement: Entitlement,
  tokenManager: TokenManager,
  subscriptionService: SubscriptionService,
) {
  return checkEntitlement(featureName, entitlement, tokenManager, subscriptionService)
}

function entitlementError(message: string): RemoteError {
  return {
    layer: 'account',
    code: REMOTE_ERROR_CODE.ENTITLEMENT_REQUIRED,
    message,
    retryable: false,
  }
}

function capabilityError(layer: RemoteError['layer'], message: string): RemoteError {
  return {
    layer,
    code: REMOTE_ERROR_CODE.CAPABILITY_UNAVAILABLE,
    message,
    retryable: true,
  }
}

function deniedResult(
  diagnosticLog: RemoteDiagnosticLog,
  operation: string,
  ref: RemoteWorkspaceRef,
  traceId: string,
  message: string,
) {
  const remoteError = traceRemoteError(entitlementError(message), traceId)
  diagnosticLog.record({ traceId, operation, ref, message, remoteError })
  return {
    success: false,
    unavailable: true,
    error: message,
    remoteError,
  }
}

function unavailableResult(
  diagnosticLog: RemoteDiagnosticLog,
  operation: string,
  ref: RemoteWorkspaceRef,
  traceId: string,
  message: string,
  layer: RemoteError['layer'],
) {
  const remoteError = traceRemoteError(capabilityError(layer, message), traceId)
  diagnosticLog.record({ traceId, operation, ref, message, remoteError })
  return {
    success: false,
    unavailable: true,
    error: message,
    remoteError,
  }
}

function traceRemoteError(remoteError: RemoteError, traceId: string): RemoteError {
  return {
    ...remoteError,
    context: {
      ...remoteError.context,
      traceId,
    },
  }
}

function recordStatusError<T extends { remoteError?: RemoteError }>(
  diagnosticLog: RemoteDiagnosticLog,
  operation: string,
  ref: RemoteWorkspaceRef,
  traceId: string,
  status: T,
): T {
  if (!status.remoteError) return status
  const remoteError = traceRemoteError(status.remoteError, traceId)
  diagnosticLog.record({ traceId, operation, ref, message: remoteError.message, remoteError })
  return { ...status, remoteError }
}

function traceStatus<T extends { remoteError?: RemoteError }>(
  diagnosticLog: RemoteDiagnosticLog,
  operation: string,
  ref: RemoteWorkspaceRef,
  traceId: string,
  status: T,
): T {
  return recordStatusError(diagnosticLog, operation, ref, traceId, status)
}

function traceResult<T extends { success: boolean; error?: string; remoteError?: RemoteError }>(
  diagnosticLog: RemoteDiagnosticLog,
  operation: string,
  ref: RemoteWorkspaceRef,
  traceId: string,
  result: T,
): T {
  if (result.success && !result.remoteError) return result
  const remoteError = traceRemoteError(
    result.remoteError ?? {
      layer: 'unknown',
      code: REMOTE_ERROR_CODE.PROVIDER_ERROR,
      message: result.error || '远程操作失败',
      retryable: true,
    },
    traceId,
  )
  diagnosticLog.record({ traceId, operation, ref, message: remoteError.message, remoteError })
  return { ...result, remoteError }
}

function emptyCapabilities() {
  return {
    file: {
      tree: false,
      read: false,
      write: false,
      create: false,
      rename: false,
      delete: false,
      search: false,
      watch: false,
    },
    shell: { command: false, pty: false, cwd: false },
    agent: { codex: false, claudeCode: false, deepinkAgent: false, custom: false },
    session: { list: false, resume: false, stream: false, archive: false },
  }
}
