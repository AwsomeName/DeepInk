/**
 * Agent IPC 处理器
 *
 * 管理所有 agent 相关的 IPC 通道：
 * - Claude Code CLI 后端通信（sendMessage / abort / stream 事件）
 * - 旧 Playwright 兼容入口（无项目归属，保留协议但禁用执行）
 */

import type { IpcMainInvokeEvent } from 'electron'
import { z } from 'zod'
import type { AgentBridge } from '../agent/agent-bridge'
import type { PermissionManager } from '../mcp/permission'
import type { McpClientManager, ExternalMcpServer } from '../mcp/client-manager'
import type { AgentScope } from '../agent/scope'
import type {
  AgentCompactConversationPayload,
  AgentCapabilityStatus,
  AgentConversationContinuity,
  AgentSendMessageInput,
  AgentSendMessagePayload,
  AgentToolModuleStatus,
} from '../../shared/ipc/agent'
import type { WorkspaceRef } from '../../shared/workspace-ref'
import { registerTrustedIpcHandler, type TrustedRendererGuard } from './trusted-renderer-guard'
import {
  agentCompactPayloadSchema,
  agentConfirmationIdSchema,
  agentConversationIdSchema,
  agentPermissionModeSchema,
  agentScopeSchema,
  agentSendMessageInputSchema,
  agentToolModuleIdSchema,
  mcpServerNameSchema,
  mcpServerSchema,
  mcpServerUpdatesSchema,
  nullableAgentSessionIdSchema,
  optionalAgentConversationIdSchema,
} from './agent-ipc-schema'

interface AgentIpcDeps {
  trustedRendererGuard: TrustedRendererGuard
  getAgentBridge: () => AgentBridge | null
  permissionManager: PermissionManager
  getMcpClientMgr: () => McpClientManager | null
  getCapabilities?: () => AgentCapabilityStatus[]
  getToolModules?: () => AgentToolModuleStatus[]
  setToolModuleEnabled?: (
    moduleId: string,
    enabled: boolean,
  ) => Promise<{
    success: boolean
    error?: string
  }>
}

function normalizeSendMessageInput(input: AgentSendMessageInput): AgentSendMessagePayload {
  if (typeof input === 'string') return { message: input }
  return {
    message: input.message,
    runId: typeof input.runId === 'string' && input.runId.trim() ? input.runId.trim() : undefined,
    resources: Array.isArray(input.resources) ? input.resources : undefined,
    skills: Array.isArray(input.skills) ? input.skills : undefined,
    sessionId:
      input.sessionId === null || typeof input.sessionId === 'string' ? input.sessionId : undefined,
    workspaceRef: normalizeWorkspaceRef(input.workspaceRef),
    continuity: normalizeContinuity(input.continuity),
  }
}

function normalizeContinuity(value: unknown): AgentConversationContinuity | undefined {
  if (!value || typeof value !== 'object') return undefined
  const candidate = value as {
    recentMessages?: unknown
    tasks?: unknown
  }
  const recentMessages = Array.isArray(candidate.recentMessages)
    ? candidate.recentMessages.slice(-10).flatMap((entry) => {
        if (!entry || typeof entry !== 'object') return []
        const message = entry as { role?: unknown; text?: unknown }
        if (
          (message.role !== 'user' && message.role !== 'assistant' && message.role !== 'system') ||
          typeof message.text !== 'string' ||
          !message.text.trim()
        ) {
          return []
        }
        return [
          {
            role: message.role,
            text: message.text.trim().slice(0, 1200),
          } as AgentConversationContinuity['recentMessages'][number],
        ]
      })
    : []
  const tasks = Array.isArray(candidate.tasks)
    ? candidate.tasks.slice(0, 12).flatMap((entry) => {
        if (!entry || typeof entry !== 'object') return []
        const task = entry as { content?: unknown; status?: unknown }
        if (
          typeof task.content !== 'string' ||
          !task.content.trim() ||
          (task.status !== 'pending' &&
            task.status !== 'in_progress' &&
            task.status !== 'completed')
        ) {
          return []
        }
        return [
          {
            content: task.content.trim().slice(0, 300),
            status: task.status,
          } as AgentConversationContinuity['tasks'][number],
        ]
      })
    : []
  return recentMessages.length > 0 || tasks.length > 0 ? { recentMessages, tasks } : undefined
}

function normalizeWorkspaceRef(value: unknown): WorkspaceRef | undefined {
  if (!value || typeof value !== 'object') return undefined
  const candidate = value as { kind?: unknown; path?: unknown }
  if (candidate.kind === 'global') return { kind: 'global' }
  if (candidate.kind !== 'local' || typeof candidate.path !== 'string') return undefined
  const path = candidate.path.trim()
  return path ? { kind: 'local', path } : undefined
}

/**
 * 注册所有 Agent 相关 IPC 处理器
 */
export function registerAgentIpc(deps: AgentIpcDeps): void {
  const handle = <Args extends unknown[], Result>(
    channel: string,
    handler: (event: IpcMainInvokeEvent, ...args: Args) => Result,
  ): void => registerTrustedIpcHandler(channel, deps.trustedRendererGuard, handler)
  const requireAgentBridge = (): AgentBridge | null => deps.getAgentBridge()
  const requireMcpClientMgr = (): McpClientManager | null => deps.getMcpClientMgr()
  const permissionManager = deps.permissionManager

  // ─── AI 后端通信 ─────────────────────────────────

  // 发送用户消息给 Claude Agent SDK 后端
  handle(
    'agent:sendMessage',
    async (
      _event,
      conversationIdOrMessage: string | AgentSendMessageInput,
      maybeMessage?: AgentSendMessageInput,
    ) => {
      const agentBridge = requireAgentBridge()
      if (!agentBridge) return { success: false, error: 'Agent 后端未就绪' }
      const conversationId =
        maybeMessage === undefined
          ? undefined
          : agentConversationIdSchema.parse(conversationIdOrMessage)
      const input = agentSendMessageInputSchema.parse(maybeMessage ?? conversationIdOrMessage)
      const payload = normalizeSendMessageInput(input)
      await agentBridge.sendMessage(
        payload.message,
        typeof conversationId === 'string' ? conversationId : undefined,
        {
          runId: payload.runId,
          resources: payload.resources,
          skills: payload.skills,
          sessionId: payload.sessionId,
          workspaceRef: payload.workspaceRef,
          continuity: payload.continuity,
        },
      )
      return { success: true }
    },
  )

  // 中止当前 AI 响应
  handle('agent:abort', async (_event, conversationId?: string) => {
    const agentBridge = requireAgentBridge()
    if (!agentBridge) return
    await agentBridge.abort(optionalAgentConversationIdSchema.parse(conversationId))
  })

  // 获取 AI 后端状态
  handle('agent:getStatus', (_event, conversationId?: string) => {
    const agentBridge = requireAgentBridge()
    if (!agentBridge) return { connected: false, busy: false, sessionId: null, ready: false }
    return agentBridge.getStatus(optionalAgentConversationIdSchema.parse(conversationId))
  })

  handle('agent:getContextUsage', async (_event, conversationId?: string) => {
    const agentBridge = requireAgentBridge()
    if (!agentBridge) return null
    return agentBridge.getContextUsage(optionalAgentConversationIdSchema.parse(conversationId))
  })

  handle(
    'agent:compactConversation',
    async (_event, conversationId: string, input: AgentCompactConversationPayload) => {
      const agentBridge = requireAgentBridge()
      if (!agentBridge) return { success: false, error: 'Agent 后端未就绪' }
      const parsedConversationId = agentConversationIdSchema.parse(conversationId)
      const parsedInput = agentCompactPayloadSchema.parse(input)
      try {
        await agentBridge.compactConversation(parsedConversationId, {
          sessionId: parsedInput.sessionId,
          runId: parsedInput.runId,
          workspaceRef: parsedInput.workspaceRef,
          instructions: parsedInput.instructions,
        })
        return { success: true }
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        }
      }
    },
  )

  // 设置操作作用域（选择 Agent 操作目标 + 工具收窄）
  // 响应进行中切换会被拒绝（agentBridge 内部回传 error 事件）
  handle(
    'agent:setScope',
    (_event, conversationIdOrScope: string | AgentScope, maybeScope?: AgentScope) => {
      const agentBridge = requireAgentBridge()
      if (!agentBridge) return false
      const conversationId =
        maybeScope === undefined
          ? undefined
          : agentConversationIdSchema.parse(conversationIdOrScope)
      const scope = agentScopeSchema.parse(maybeScope ?? conversationIdOrScope) as AgentScope
      return agentBridge.setScope(scope, conversationId)
    },
  )

  // 获取当前操作作用域
  handle('agent:getScope', (_event, conversationId?: string) => {
    const agentBridge = requireAgentBridge()
    if (!agentBridge) return { kind: 'all' }
    return agentBridge.getScope(optionalAgentConversationIdSchema.parse(conversationId))
  })

  // 清除会话（开始新对话）
  handle('agent:resetSession', (_event, conversationId?: string) => {
    const agentBridge = requireAgentBridge()
    if (!agentBridge) return
    agentBridge.resetSession(optionalAgentConversationIdSchema.parse(conversationId))
  })

  // 恢复历史会话的后端 session id
  handle(
    'agent:restoreConversation',
    (_event, conversationId: string, sessionId: string | null) => {
      const agentBridge = requireAgentBridge()
      if (!agentBridge) return
      agentBridge.restoreConversation(
        agentConversationIdSchema.parse(conversationId),
        nullableAgentSessionIdSchema.parse(sessionId),
      )
    },
  )

  // 关闭指定会话并释放后端资源
  handle('agent:closeConversation', async (_event, conversationId: string) => {
    const agentBridge = requireAgentBridge()
    if (!agentBridge) return
    await agentBridge.closeConversation(agentConversationIdSchema.parse(conversationId))
  })

  // 获取 Agent 可用能力状态（用于 UI 展示降级原因）
  handle('agent:getCapabilities', () => {
    return deps.getCapabilities?.() ?? []
  })

  handle('agent:listToolModules', () => deps.getToolModules?.() ?? [])

  handle('agent:setToolModuleEnabled', (_event, moduleId: string, enabled: boolean) => {
    const parsedModuleId = agentToolModuleIdSchema.parse(moduleId)
    const parsedEnabled = z.boolean().parse(enabled)
    return (
      deps.setToolModuleEnabled?.(parsedModuleId, parsedEnabled) ??
      Promise.resolve({ success: false, error: '工具模块管理器未就绪' })
    )
  })

  // ─── 权限管理 ──────────────────────────────────────

  // 渲染进程回传用户确认/拒绝
  handle(
    'agent:resolveToolConfirmation',
    (_event, id: string, approved: boolean, alwaysAllow?: boolean) => {
      permissionManager.resolveConfirmation(
        agentConfirmationIdSchema.parse(id),
        z.boolean().parse(approved),
        z.boolean().optional().parse(alwaysAllow),
      )
    },
  )

  // 获取当前权限模式
  handle('agent:getPermissionMode', () => {
    return permissionManager.getMode()
  })

  // 设置权限模式
  handle('agent:setPermissionMode', (_event, mode: string) => {
    permissionManager.setMode(agentPermissionModeSchema.parse(mode))
  })

  // ─── 外部 MCP Server 管理 ──────────────────────────

  // 列出所有外部 server
  handle('mcp:listServers', () => {
    const mcpClientMgr = requireMcpClientMgr()
    if (!mcpClientMgr) return []
    return mcpClientMgr.getAllServers()
  })

  // 添加外部 server
  handle('mcp:addServer', (_event, server: ExternalMcpServer) => {
    const mcpClientMgr = requireMcpClientMgr()
    if (!mcpClientMgr) return { success: false, error: 'MCP 管理器未就绪' }
    try {
      mcpClientMgr.addServer(mcpServerSchema.parse(server) as ExternalMcpServer)
      return { success: true }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })

  // 移除外部 server
  handle('mcp:removeServer', (_event, name: string) => {
    const mcpClientMgr = requireMcpClientMgr()
    if (!mcpClientMgr) return false
    return mcpClientMgr.removeServer(mcpServerNameSchema.parse(name))
  })

  // 更新外部 server
  handle('mcp:updateServer', (_event, name: string, updates: Partial<ExternalMcpServer>) => {
    const mcpClientMgr = requireMcpClientMgr()
    if (!mcpClientMgr) return false
    return mcpClientMgr.updateServer(
      mcpServerNameSchema.parse(name),
      mcpServerUpdatesSchema.parse(updates) as Partial<ExternalMcpServer>,
    )
  })

  // 重新加载配置文件
  handle('mcp:reloadConfig', () => {
    const mcpClientMgr = requireMcpClientMgr()
    if (!mcpClientMgr) return []
    mcpClientMgr.loadFromConfig()
    return mcpClientMgr.getAllServers()
  })
}
