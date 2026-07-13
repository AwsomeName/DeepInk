import type {
  TerminalCommandActor,
  TerminalCommandConfirmationRequest,
  TerminalPermissionRisk,
  TerminalRuntimeRef,
} from '@shared/terminal'
import { workspaceRefLabel, workspaceRefSourceLabel } from '../../../shared/workspace-ref'

export const TERMINAL_RISK_LABEL: Record<TerminalPermissionRisk, string> = {
  read: '只读',
  network: '网络',
  write: '写入',
  destructive: '破坏性',
  privileged: '提权',
  unknown: '未知',
}

export const TERMINAL_RISK_COLOR: Record<TerminalPermissionRisk, string> = {
  read: '#22c55e',
  network: '#38bdf8',
  write: '#eab308',
  destructive: '#ef4444',
  privileged: '#f97316',
  unknown: '#a855f7',
}

export const TERMINAL_ACTOR_LABEL: Record<TerminalCommandActor, string> = {
  user: '用户',
  agent: 'Agent',
  system: '系统',
}

export function formatTerminalRuntime(runtime: TerminalRuntimeRef): string {
  const source = workspaceRefSourceLabel(runtime.workspaceRef)
  const workspace = workspaceRefLabel(runtime.workspaceRef)
  const backend = runtime.backend
  return `${source} · ${workspace} · ${backend}`
}

export function formatTerminalExpiresIn(
  request: Pick<TerminalCommandConfirmationRequest, 'expiresAt'>,
  now = Date.now(),
): string {
  const seconds = Math.max(0, Math.ceil((request.expiresAt - now) / 1000))
  return seconds > 0 ? `${seconds} 秒` : '已超时'
}
