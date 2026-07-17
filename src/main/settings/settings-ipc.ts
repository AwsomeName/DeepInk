/**
 * SettingsIPC — 设置 IPC 处理器
 *
 * 提供 3 个 IPC channel：
 * - settings:getAll  — 获取所有设置
 * - settings:set     — 更新部分设置（立即持久化 + 实时生效）
 * - settings:reset   — 恢复默认设置
 */

import { ipcMain } from 'electron'
import type { SettingsService } from './settings-service'
import type { PermissionManager } from '../mcp/permission'
import type { AgentBridge } from '../agent/agent-bridge'
import type { AppSettings, PermissionMode } from './types'
import { detectClaudeCode } from '../agent/claude-code-detector'
import type { McpToolHost } from '../mcp/tool-host'

/** 合法的 permissionMode 值 */
const VALID_PERMISSION_MODES = new Set<string>(['auto', 'categorized', 'strict'])

/** 影响 Agent 后端的设置字段 */
const AGENT_SETTING_KEYS = new Set([
  'agentEngine',
  'claudeCodePath',
  'maxBudgetUsd',
  'provider',
  'apiFormat',
  'apiBaseUrl',
  'apiKey',
  'modelName',
])

export function registerSettingsIpc(
  settingsService: SettingsService,
  permissionManager: PermissionManager,
  getAgentBridge: () => AgentBridge | null,
  getToolHost: () => McpToolHost | null = () => null,
): void {
  /** 获取所有设置 */
  ipcMain.handle('settings:getAll', () => {
    return settingsService.getAll()
  })

  /**
   * 更新部分设置
   *
   * 持久化到磁盘，并对需要实时生效的字段立即应用：
   * - permissionMode → PermissionManager.setMode()
   * - API 配置变更 → AgentBridge.reconfigure()
   */
  ipcMain.handle('settings:set', async (_event, partial: Partial<AppSettings>) => {
    try {
      const updated = await settingsService.set(partial)

      // 权限模式：校验后立即生效
      if (partial.permissionMode) {
        const mode = partial.permissionMode as string
        if (VALID_PERMISSION_MODES.has(mode)) {
          permissionManager.setMode(mode as PermissionMode)
        } else {
          console.warn('[SettingsIPC] 无效的权限模式:', mode)
        }
      }

      if (partial.disabledAgentToolModules) {
        applyToolModuleSettings(getToolHost(), updated.disabledAgentToolModules)
      }

      // API 配置变更：热重载后端
      const agentBridge = getAgentBridge()
      if (agentBridge && Object.keys(partial).some((k) => AGENT_SETTING_KEYS.has(k))) {
        try {
          agentBridge.reconfigure(updated)
        } catch (err) {
          console.warn('[SettingsIPC] 后端热重载失败（下次启动生效）:', err)
        }
      }

      return { success: true, settings: updated }
    } catch (err) {
      console.error('[SettingsIPC] 设置更新失败:', err)
      return { success: false, error: String(err) }
    }
  })

  /** 恢复默认设置 */
  ipcMain.handle('settings:reset', async () => {
    try {
      const settings = await settingsService.reset()
      // 重置权限模式为默认值
      permissionManager.setMode(settings.permissionMode)
      applyToolModuleSettings(getToolHost(), settings.disabledAgentToolModules)

      // 热重载后端为默认配置
      const agentBridge = getAgentBridge()
      if (agentBridge) {
        try {
          agentBridge.reconfigure(settings)
        } catch (err) {
          console.warn('[SettingsIPC] 后端热重载失败（下次启动生效）:', err)
        }
      }

      return { success: true, settings }
    } catch (err) {
      console.error('[SettingsIPC] 设置重置失败:', err)
      return { success: false, error: String(err) }
    }
  })

  /** 重置单个设置到默认值 */
  ipcMain.handle('settings:resetKey', async (_event, key: string) => {
    try {
      const updated = await settingsService.resetKey(key as keyof AppSettings)

      // 权限模式重置 → 即时生效
      if (key === 'permissionMode') {
        permissionManager.setMode(updated.permissionMode)
      }
      if (key === 'disabledAgentToolModules') {
        applyToolModuleSettings(getToolHost(), updated.disabledAgentToolModules)
      }

      // API 配置重置 → 热重载后端
      const agentBridge = getAgentBridge()
      if (AGENT_SETTING_KEYS.has(key) && agentBridge) {
        try {
          agentBridge.reconfigure(updated)
        } catch (err) {
          console.warn('[SettingsIPC] 后端热重载失败（下次启动生效）:', err)
        }
      }

      return { success: true, settings: updated }
    } catch (err) {
      console.error('[SettingsIPC] 单项重置失败:', err)
      return { success: false, error: String(err) }
    }
  })

  /** 检测本机 Claude Code CLI 路径 */
  ipcMain.handle('settings:detectClaudeCode', async () => {
    try {
      const settings = settingsService.getAll()
      return { success: true, status: await detectClaudeCode(settings.claudeCodePath) }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  console.log('[SettingsIPC] 设置 IPC 已注册')
}

function applyToolModuleSettings(toolHost: McpToolHost | null, disabledModules: string[]): void {
  if (!toolHost) return
  const disabled = new Set(disabledModules)
  for (const module of toolHost.getRegisteredModules()) {
    toolHost.setModuleEnabled(module.name, !disabled.has(module.name))
  }
}
