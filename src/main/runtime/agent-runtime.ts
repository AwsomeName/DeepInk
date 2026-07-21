import { AgentBridge } from '../agent/agent-bridge'
import type { CclinkStudioRuntimeState } from './app-runtime'

export function bootstrapAgentRuntime(runtime: CclinkStudioRuntimeState): void {
  if (
    runtime.mainWindow &&
    runtime.toolHost &&
    runtime.capabilities.get('mcp').state === 'ready' &&
    runtime.permissionManager &&
    runtime.mcpClientMgr &&
    runtime.settingsService
  ) {
    try {
      const settings = runtime.settingsService.getRuntimeSettings()
      runtime.agentBridge = new AgentBridge(
        runtime.mainWindow,
        runtime.playwrightBridge,
        runtime.toolHost,
        runtime.permissionManager,
        runtime.mcpClientMgr,
        runtime.adbBridge,
        {
          agentEngine: settings.agentEngine,
          backendType: settings.backendType,
          maxBudgetUsd: settings.maxBudgetUsd,
          claudeCodePath: settings.claudeCodePath,
          apiFormat: settings.apiFormat,
          apiBaseUrl: settings.apiBaseUrl,
          apiKey: settings.apiKey,
          modelName: settings.modelName,
          getWorkspacePath: () => runtime.settingsService!.getAll().lastWorkspacePath,
          getSettingsSnapshot: () => runtime.settingsService!.getAll(),
          agentDeviceAvailable: () => runtime.agentDeviceManager?.isAvailable() ?? false,
          browserManager: runtime.browserManager ?? undefined,
          browserTaskRuntime: runtime.browserTaskRuntime ?? undefined,
        },
      )

      if (runtime.browserManager) {
        runtime.browserManager.onViewDestroyed((tabId) =>
          runtime.agentBridge!.invalidateBrowserScope(tabId),
        )
      }
      runtime.capabilities.ready('agent-backend')
      console.log(`[CCLink Studio] Agent 后端就绪 (${settings.agentEngine})`)
    } catch (error) {
      runtime.agentBridge = null
      runtime.capabilities.failed('agent-backend', error)
      console.error('[CCLink Studio] Agent 后端初始化失败:', error)
    }
    return
  }

  runtime.capabilities.unavailable('agent-backend', 'Agent 核心依赖未就绪')
  console.warn(
    '[CCLink Studio] Agent 后端未就绪：MCP、权限或设置 runtime 初始化失败，Agent IPC 将保持降级状态',
  )
}

export async function shutdownAgentRuntime(runtime: CclinkStudioRuntimeState): Promise<void> {
  try {
    await runtime.agentBridge?.destroy()
  } finally {
    runtime.agentBridge = null
  }
}
