import type { AgentConversationState } from '../../stores/agent-store'
import type { ToolResultContentBlock, ToolUseContentBlock } from '../../types'

export type ConversationActivityKind = 'idle' | 'running' | 'error' | 'tool' | 'closed'

export interface ConversationActivitySummary {
  kind: ConversationActivityKind
  label: string
  detail: string
  toolName?: string
  toolCount: number
  errorCount: number
}

export function getConversationActivity(
  conversation: AgentConversationState,
): ConversationActivitySummary {
  const toolUses = getToolUses(conversation)
  const toolResults = getToolResults(conversation)
  const latestToolUse = toolUses.at(-1)
  const latestToolResult = toolResults.at(-1)
  const errorCount = toolResults.filter((block) => block.is_error).length

  if (conversation.archivedAt) {
    return {
      kind: 'closed',
      label: '已关闭',
      detail: `保留 ${conversation.messages.length} 条消息`,
      toolName: latestToolUse?.name,
      toolCount: toolUses.length,
      errorCount,
    }
  }

  if (conversation.backendState === 'error' || latestToolResult?.is_error) {
    return {
      kind: 'error',
      label: conversation.backendState === 'error' ? '连接出错' : '工具出错',
      detail: getLatestErrorDetail(conversation, latestToolResult),
      toolName: latestToolUse?.name,
      toolCount: toolUses.length,
      errorCount: Math.max(1, errorCount),
    }
  }

  if (conversation.loading || conversation.backendState === 'streaming') {
    return {
      kind: 'running',
      label: latestToolUse ? '正在执行工具' : '正在响应',
      detail: latestToolUse ? latestToolUse.name : '等待模型返回',
      toolName: latestToolUse?.name,
      toolCount: toolUses.length,
      errorCount,
    }
  }

  if (latestToolUse) {
    return {
      kind: 'tool',
      label: '最近工具',
      detail: latestToolUse.name,
      toolName: latestToolUse.name,
      toolCount: toolUses.length,
      errorCount,
    }
  }

  return {
    kind: 'idle',
    label: '空闲',
    detail: conversation.messages.length > 1 ? '可继续发送消息' : '还没有任务动作',
    toolCount: 0,
    errorCount: 0,
  }
}

function getToolUses(conversation: AgentConversationState): ToolUseContentBlock[] {
  return conversation.messages.flatMap((message) =>
    message.content.filter((block): block is ToolUseContentBlock => block.type === 'tool_use'),
  )
}

function getToolResults(conversation: AgentConversationState): ToolResultContentBlock[] {
  return conversation.messages.flatMap((message) =>
    message.content.filter(
      (block): block is ToolResultContentBlock => block.type === 'tool_result',
    ),
  )
}

function getLatestErrorDetail(
  conversation: AgentConversationState,
  latestToolResult?: ToolResultContentBlock,
): string {
  if (latestToolResult?.is_error && latestToolResult.content.trim()) {
    return latestToolResult.content.replace(/\s+/g, ' ').trim().slice(0, 96)
  }

  const systemError = [...conversation.messages]
    .reverse()
    .find((message) => message.role === 'system' && message.rawText.trim())
  return systemError?.rawText.replace(/\s+/g, ' ').trim().slice(0, 96) ?? '查看会话详情'
}
