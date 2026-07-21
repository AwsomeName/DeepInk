import { ipcRenderer } from 'electron'
import type {
  AgentApiContract,
  AgentCompactConversationPayload,
  AgentScope,
  ExternalMcpServer,
} from '../shared/ipc/agent'
import type { AgentSendMessageInput } from '../shared/ipc/agent'

export const agentApi: AgentApiContract = {
  sendMessage: (
    conversationIdOrMessage: string | AgentSendMessageInput,
    maybeMessage?: AgentSendMessageInput,
  ) =>
    maybeMessage === undefined
      ? ipcRenderer.invoke('agent:sendMessage', conversationIdOrMessage)
      : ipcRenderer.invoke('agent:sendMessage', conversationIdOrMessage, maybeMessage),
  abort: (conversationId?: string) => ipcRenderer.invoke('agent:abort', conversationId),
  getStatus: (conversationId?: string) => ipcRenderer.invoke('agent:getStatus', conversationId),
  getContextUsage: (conversationId?: string) =>
    ipcRenderer.invoke('agent:getContextUsage', conversationId),
  compactConversation: (conversationId: string, payload: AgentCompactConversationPayload) =>
    ipcRenderer.invoke('agent:compactConversation', conversationId, payload),
  setScope: (conversationIdOrScope: string | AgentScope, maybeScope?: AgentScope) =>
    maybeScope === undefined
      ? ipcRenderer.invoke('agent:setScope', conversationIdOrScope)
      : ipcRenderer.invoke('agent:setScope', conversationIdOrScope, maybeScope),
  getScope: (conversationId?: string) => ipcRenderer.invoke('agent:getScope', conversationId),
  resetSession: (conversationId?: string) =>
    ipcRenderer.invoke('agent:resetSession', conversationId),
  restoreConversation: (conversationId: string, sessionId: string | null) =>
    ipcRenderer.invoke('agent:restoreConversation', conversationId, sessionId),
  closeConversation: (conversationId: string) =>
    ipcRenderer.invoke('agent:closeConversation', conversationId),
  onStreamEvent: (callback) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      data: Parameters<typeof callback>[0],
    ): void => callback(data)
    ipcRenderer.on('agent:stream', listener)
    return () => ipcRenderer.removeListener('agent:stream', listener)
  },
  onComplete: (callback) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      data: Parameters<typeof callback>[0],
    ): void => callback(data)
    ipcRenderer.on('agent:complete', listener)
    return () => ipcRenderer.removeListener('agent:complete', listener)
  },
  onError: (callback) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      data: Parameters<typeof callback>[0],
    ): void => callback(data)
    ipcRenderer.on('agent:error', listener)
    return () => ipcRenderer.removeListener('agent:error', listener)
  },
  getCapabilities: () => ipcRenderer.invoke('agent:getCapabilities'),
  listToolModules: () => ipcRenderer.invoke('agent:listToolModules'),
  setToolModuleEnabled: (moduleId: string, enabled: boolean) =>
    ipcRenderer.invoke('agent:setToolModuleEnabled', moduleId, enabled),
  onRequestConfirmation: (callback) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      data: Parameters<typeof callback>[0],
    ): void => callback(data)
    ipcRenderer.on('agent:requestConfirmation', listener)
    return () => ipcRenderer.removeListener('agent:requestConfirmation', listener)
  },
  resolveToolConfirmation: (id: string, approved: boolean, alwaysAllow?: boolean) =>
    ipcRenderer.invoke('agent:resolveToolConfirmation', id, approved, alwaysAllow),
  getPermissionMode: () => ipcRenderer.invoke('agent:getPermissionMode'),
  setPermissionMode: (mode) => ipcRenderer.invoke('agent:setPermissionMode', mode),
  listMcpServers: () => ipcRenderer.invoke('mcp:listServers'),
  addMcpServer: (server: ExternalMcpServer) => ipcRenderer.invoke('mcp:addServer', server),
  removeMcpServer: (name: string) => ipcRenderer.invoke('mcp:removeServer', name),
  updateMcpServer: (name: string, updates: Partial<ExternalMcpServer>) =>
    ipcRenderer.invoke('mcp:updateServer', name, updates),
  reloadMcpConfig: () => ipcRenderer.invoke('mcp:reloadConfig'),
}
