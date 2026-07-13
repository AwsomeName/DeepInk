/**
 * 同步模块 IPC 注册
 *
 * 遵循 registerAuthIpc / registerFsIpc 模式。
 * Channel 命名：sync:action
 */

import { ipcMain, BrowserWindow } from 'electron'
import { SyncService } from './sync-service'
import { SyncCredentialStore } from './sync-credential-store'
import { checkProFeature } from '../subscription/feature-gate'
import { TokenManager } from '../auth/token-manager'
import { SubscriptionService } from '../subscription/subscription-service'
import type { SyncConfig } from './types'
import { resolve, normalize } from 'path'
import { homedir } from 'os'

export function registerSyncIpc(
  mainWindow: BrowserWindow,
  syncService: SyncService,
  credentialStore: SyncCredentialStore,
  tokenManager: TokenManager,
  subscriptionService: SubscriptionService,
): void {

  // 注入依赖到 SyncService（自动同步需要）
  syncService.injectDependencies(credentialStore, mainWindow)

  // ─── 状态查询（不需要 Pro 检查，UI 需要读取状态） ────────

  ipcMain.handle('sync:getStatus', () => {
    return syncService.getStatus()
  })

  ipcMain.handle('sync:getConfig', () => {
    return syncService.getConfig()
  })

  // ─── 配置管理（Pro 功能）────────────────────────

  ipcMain.handle('sync:saveConfig', async (_event, config: SyncConfig, password?: string) => {
    // Pro 门控
    const gate = await checkProFeature('云同步', tokenManager, subscriptionService)
    if (!gate.allowed) {
      return { success: false, error: gate.reason }
    }

    try {
      // 保存配置
      await syncService.saveConfig(config)
      // 有密码才更新凭据（已连接视图仅更新 includePaths 时不传密码）
      if (password) {
        await credentialStore.savePassword(config.id, password)
      }

      // 配置变更后重启自动同步
      syncService.stopAutoSync()
      if (config.enabled && config.autoSyncInterval > 0) {
        syncService.startAutoSync('')
      }

      return { success: true }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      return { success: false, error: message }
    }
  })

  ipcMain.handle('sync:deleteConfig', async () => {
    // Pro 门控
    const gate = await checkProFeature('云同步', tokenManager, subscriptionService)
    if (!gate.allowed) {
      return { success: false, error: gate.reason }
    }

    try {
      // 停止自动同步
      syncService.stopAutoSync()

      const config = syncService.getConfig()
      if (config) {
        await credentialStore.removePassword(config.id)
      }
      await syncService.deleteConfig()
      return { success: true }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      return { success: false, error: message }
    }
  })

  // ─── 连接测试（Pro 功能）────────────────────────

  ipcMain.handle('sync:testConnection', async (_event, config: SyncConfig, password: string) => {
    // Pro 门控
    const gate = await checkProFeature('云同步', tokenManager, subscriptionService)
    if (!gate.allowed) {
      return { success: false, error: gate.reason }
    }

    return syncService.testConnection(config, password)
  })

  // ─── 触发同步（Pro 功能）────────────────────────

  ipcMain.handle('sync:triggerSync', async (_event, workspacePath: string) => {
    // Pro 门控
    const gate = await checkProFeature('云同步', tokenManager, subscriptionService)
    if (!gate.allowed) {
      return { success: false, error: gate.reason }
    }

    try {
      // 校验工作区路径（必须在用户主目录下）
      const safePath = validateWorkspacePath(workspacePath)

      const config = syncService.getConfig()
      if (!config) {
        return { success: false, error: '未配置云同步' }
      }

      const password = await credentialStore.getPassword(config.id)
      if (!password) {
        return { success: false, error: '凭据丢失，请重新配置' }
      }

      // 状态推送回调
      const onStatusChange = (status: import('./types').SyncStatus) => {
        try {
          if (!mainWindow.isDestroyed()) {
            mainWindow.webContents.send('sync:statusChanged', status)
          }
        } catch {
          // 窗口可能已关闭
        }
      }

      const result = await syncService.runSync(config, password, safePath, onStatusChange, {
        trigger: 'manual',
      })

      // 推送最终结果
      try {
        if (!mainWindow.isDestroyed()) {
          mainWindow.webContents.send('sync:syncComplete', {
            result,
            status: syncService.getStatus(),
          })
        }
      } catch {
        // 窗口可能已关闭
      }

      // 并发拒绝：runSync 返回带 error 的结果
      if (result.errors.length === 1 && !result.errors[0].path) {
        return { success: false, error: result.errors[0].error }
      }

      return { success: true, result }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      return { success: false, error: message }
    }
  })

  // ─── 自动同步控制 ──────────────────────────────

  ipcMain.handle('sync:startAutoSync', async (_event, workspacePath: string) => {
    // Pro 门控
    const gate = await checkProFeature('云同步', tokenManager, subscriptionService)
    if (!gate.allowed) {
      return { success: false, error: gate.reason }
    }

    try {
      syncService.startAutoSync(workspacePath)
      return { success: true }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      return { success: false, error: message }
    }
  })

  ipcMain.handle('sync:stopAutoSync', () => {
    syncService.stopAutoSync()
    return { success: true }
  })

  // ─── 同步历史 ──────────────────────────────────

  ipcMain.handle('sync:getHistory', async (_event, limit?: number) => {
    return { success: true, entries: syncService.getHistory(limit) }
  })

  ipcMain.handle('sync:clearHistory', () => {
    syncService.clearHistory()
    return { success: true }
  })

  console.log('[DeepInk] 同步 IPC 已注册')
}

/**
 * 校验工作区路径，确保在用户可访问的安全范围内
 * 防止任意路径遍历
 */
function validateWorkspacePath(rawPath: string): string {
  const resolved = resolve(normalize(rawPath))
  const home = homedir()

  // 允许的根目录前缀
  const allowedPrefixes = [
    home,
    resolve('/tmp'),
    resolve('/Users'),
  ]

  const isAllowed = allowedPrefixes.some((prefix) => resolved.startsWith(prefix))
  if (!isAllowed) {
    throw new Error(`工作区路径不在允许范围内: ${resolved}`)
  }

  // 禁止的路径
  const forbidden = ['/etc', '/usr', '/bin', '/sbin', '/var', '/System', '/Library']
  if (forbidden.some((p) => resolved.startsWith(p))) {
    throw new Error(`不允许同步系统目录: ${resolved}`)
  }

  return resolved
}
