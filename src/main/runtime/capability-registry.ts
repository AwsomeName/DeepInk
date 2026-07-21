import type { AgentCapabilityName, AgentCapabilityState } from '../../shared/agent-protocol'

export interface RuntimeCapabilitySnapshot {
  name: AgentCapabilityName
  state: AgentCapabilityState
  reason?: string
  updatedAt: number
}

const DEFAULT_REASON = '能力尚未初始化'
const SENSITIVE_ASSIGNMENT_RE =
  /((?:password|passwd|pwd|token|secret|cookie|authorization|api[-_]?key|session|验证码|校验码|短信验证码|密码)\s*[:：=]\s*)([^\s,;，。]+)/gi
const QUERY_SECRET_RE =
  /([?&](?:token|access_token|auth|authorization|session|code|key|secret)=)[^&#\s]+/gi
const AUTH_SCHEME_RE = /\b(Bearer|Basic)\s+[^\s,;]+/gi

export class RuntimeCapabilityRegistry {
  private readonly snapshots = new Map<AgentCapabilityName, RuntimeCapabilitySnapshot>()

  get(name: AgentCapabilityName): RuntimeCapabilitySnapshot {
    return (
      this.snapshots.get(name) ?? {
        name,
        state: 'unavailable',
        reason: DEFAULT_REASON,
        updatedAt: 0,
      }
    )
  }

  set(name: AgentCapabilityName, state: AgentCapabilityState, reason?: string): void {
    const normalizedReason = reason ? sanitizeCapabilityReason(reason) : undefined
    this.snapshots.set(name, {
      name,
      state,
      ...(normalizedReason ? { reason: normalizedReason } : {}),
      updatedAt: Date.now(),
    })
  }

  ready(name: AgentCapabilityName): void {
    this.set(name, 'ready')
  }

  degraded(name: AgentCapabilityName, reason: string): void {
    this.set(name, 'degraded', reason)
  }

  unavailable(name: AgentCapabilityName, reason: string): void {
    this.set(name, 'unavailable', reason)
  }

  failed(name: AgentCapabilityName, error: unknown): void {
    this.set(name, 'failed', describeCapabilityError(error))
  }
}

export function describeCapabilityError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return sanitizeCapabilityReason(error.message)
  const message = String(error).trim()
  return sanitizeCapabilityReason(message || '未知初始化错误')
}

export function sanitizeCapabilityReason(reason: string): string {
  return reason
    .trim()
    .slice(0, 2_000)
    .replace(SENSITIVE_ASSIGNMENT_RE, '$1[redacted]')
    .replace(QUERY_SECRET_RE, '$1[redacted]')
    .replace(AUTH_SCHEME_RE, '$1 [redacted]')
}
