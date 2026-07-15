export type RemoteErrorLayer =
  | 'account'
  | 'transport'
  | 'remote-agent'
  | 'workspace'
  | 'file-provider'
  | 'execution-backend'
  | 'unknown'

export interface RemoteError {
  layer: RemoteErrorLayer
  code: string
  message: string
  retryable: boolean
  context?: Record<string, string | number | boolean | null>
}

export const REMOTE_ERROR_CODE = {
  TRANSPORT_UNAVAILABLE: 'REMOTE_TRANSPORT_UNAVAILABLE',
  TRANSPORT_SEND_FAILED: 'REMOTE_TRANSPORT_SEND_FAILED',
  REQUEST_TIMEOUT: 'REMOTE_REQUEST_TIMEOUT',
  PROTOCOL_INCOMPATIBLE: 'REMOTE_PROTOCOL_INCOMPATIBLE',
  UNEXPECTED_RESPONSE: 'REMOTE_UNEXPECTED_RESPONSE',
  PROVIDER_ERROR: 'REMOTE_PROVIDER_ERROR',
  CAPABILITY_UNAVAILABLE: 'REMOTE_CAPABILITY_UNAVAILABLE',
  ENTITLEMENT_REQUIRED: 'REMOTE_ENTITLEMENT_REQUIRED',
  STREAM_ERROR: 'REMOTE_STREAM_ERROR',
  AGENT_ERROR: 'REMOTE_AGENT_ERROR',
  SESSION_NOT_FOUND: 'REMOTE_SESSION_NOT_FOUND',
  EXECUTION_BACKEND_UNAVAILABLE: 'REMOTE_EXECUTION_BACKEND_UNAVAILABLE',
} as const

export type RemoteErrorCode = typeof REMOTE_ERROR_CODE[keyof typeof REMOTE_ERROR_CODE]
