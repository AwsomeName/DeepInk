import type { ToolConfirmationRequest } from '@shared/ipc/agent'
import type { TerminalCommandConfirmationRequest } from '@shared/terminal'
import { workspaceRefKey } from '@shared/workspace-ref'

export function isAgentConfirmationVisible(
  request: Pick<ToolConfirmationRequest, 'conversationId'>,
  activeConversationId: string,
): boolean {
  return request.conversationId === activeConversationId
}

export function isTerminalConfirmationVisible(
  request: Pick<TerminalCommandConfirmationRequest, 'workspaceKey' | 'runtime'>,
  activeWorkspaceKey: string | null,
): boolean {
  return (
    (request.workspaceKey ?? workspaceRefKey(request.runtime.workspaceRef)) === activeWorkspaceKey
  )
}
