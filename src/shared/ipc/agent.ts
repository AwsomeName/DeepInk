export * from '../agent-protocol'

import type {
  AgentApiContract as CoreAgentApiContract,
  AgentCommandResult,
} from '../agent-protocol'

export type AgentSendResourceKind =
  | 'file'
  | 'tab'
  | 'browser'
  | 'android'
  | 'terminal'
  | 'artifact'
  | 'project'

export interface AgentSendResource {
  id: string
  kind: AgentSendResourceKind
  label: string
  detail?: string
  ref: {
    type: AgentSendResourceKind
    path?: string
    tabId?: string
    workspaceKey?: string | null
  }
}

export interface AgentSendSkill {
  id: string
  name: string
  label: string
  description?: string
  source?: 'builtin' | 'user' | 'workspace'
}

export interface AgentSendMessagePayload {
  message: string
  resources?: AgentSendResource[]
  skills?: AgentSendSkill[]
}

export type AgentSendMessageInput = string | AgentSendMessagePayload

export interface AgentApiContract extends Omit<CoreAgentApiContract, 'sendMessage'> {
  sendMessage: {
    (message: AgentSendMessageInput): Promise<AgentCommandResult>
    (conversationId: string, message: AgentSendMessageInput): Promise<AgentCommandResult>
  }
}
