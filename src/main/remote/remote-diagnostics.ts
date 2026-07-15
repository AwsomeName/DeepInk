import type {
  RemoteDiagnosticCheck,
  RemoteDiagnosticEvent,
  RemoteDiagnosticReport,
  RemoteStatus,
} from '../../shared/remote-protocol'
import type { RemoteWorkspaceRef } from '../../shared/workspace-ref'

export interface RemoteDiagnosticGate {
  allowed: boolean
  reason?: string
}

export interface RemoteDiagnosticInput {
  ref: RemoteWorkspaceRef
  status: RemoteStatus
  traceId?: string
  generatedAt?: number
  recentErrors?: RemoteDiagnosticEvent[]
  gates: {
    workspace: RemoteDiagnosticGate
    terminal: RemoteDiagnosticGate
    agentSession: RemoteDiagnosticGate
    fileWrite: RemoteDiagnosticGate
  }
}

export function buildRemoteDiagnosticReport(input: RemoteDiagnosticInput): RemoteDiagnosticReport {
  return {
    ref: input.ref,
    traceId: input.traceId ?? 'remote-diagnostic',
    generatedAt: input.generatedAt ?? Date.now(),
    status: input.status,
    recentErrors: input.recentErrors ?? [],
    checks: [
      gateCheck('entitlement.remote_workspace', '远程工作空间授权', input.gates.workspace),
      connectionCheck(input.status),
      protocolCompatibilityCheck(input.status),
      capabilityCheck(
        'capability.file_read',
        '远程文件读取',
        input.status.capabilities.file.read,
        '文件读取可用',
        '文件读取不可用',
      ),
      gateCheck('entitlement.remote_file_write', '远程文件写入授权', input.gates.fileWrite),
      capabilityCheck(
        'capability.file_write',
        '远程文件写入协议',
        input.status.capabilities.file.write,
        '文件写入协议可用',
        '文件写入协议未接入',
        'warn',
      ),
      gateCheck('entitlement.remote_terminal', '远程 Terminal 授权', input.gates.terminal),
      capabilityCheck(
        'capability.terminal',
        '远程 Terminal 能力',
        input.status.capabilities.shell.command,
        '远程 Terminal 可用',
        '远程 Terminal 不可用',
      ),
      gateCheck('entitlement.remote_agent_session', '远程 Agent 会话授权', input.gates.agentSession),
      capabilityCheck(
        'capability.agent_session',
        '远程 Agent 会话能力',
        input.status.capabilities.session.stream || input.status.capabilities.agent.deepinkAgent,
        '远程 Agent 会话可用',
        '远程 Agent 会话不可用',
      ),
    ],
  }
}

function protocolCompatibilityCheck(status: RemoteStatus): RemoteDiagnosticCheck {
  const compatibility = status.compatibility
  if (!compatibility) {
    return {
      id: 'protocol.compatibility',
      label: '远端协议兼容性',
      status: 'unknown',
      message: '尚未完成远端协议兼容性检查。',
    }
  }

  return {
    id: 'protocol.compatibility',
    label: '远端协议兼容性',
    status:
      compatibility.status === 'compatible'
        ? 'pass'
        : compatibility.status === 'upgrade-required'
          ? 'fail'
          : 'warn',
    message: compatibility.message,
  }
}

function gateCheck(id: string, label: string, gate: RemoteDiagnosticGate): RemoteDiagnosticCheck {
  return {
    id,
    label,
    status: gate.allowed ? 'pass' : 'fail',
    message: gate.allowed ? '已授权' : (gate.reason || '未授权'),
  }
}

function connectionCheck(status: RemoteStatus): RemoteDiagnosticCheck {
  if (status.remoteError) {
    return {
      id: 'connection.remote_agent',
      label: '远端连接',
      status: status.remoteError.retryable ? 'warn' : 'fail',
      message: status.remoteError.message,
      remoteError: status.remoteError,
    }
  }
  return {
    id: 'connection.remote_agent',
    label: '远端连接',
    status: status.state === 'online' ? 'pass' : 'warn',
    message: status.state === 'online' ? '远端在线' : `远端当前状态：${status.state}`,
  }
}

function capabilityCheck(
  id: string,
  label: string,
  enabled: boolean,
  passMessage: string,
  failMessage: string,
  disabledStatus: RemoteDiagnosticCheck['status'] = 'fail',
): RemoteDiagnosticCheck {
  return {
    id,
    label,
    status: enabled ? 'pass' : disabledStatus,
    message: enabled ? passMessage : failMessage,
  }
}
