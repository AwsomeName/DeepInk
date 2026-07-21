/**
 * window-ipc — 窗口控制 IPC 处理器
 *
 * 提供窗口相关的 IPC channel：
 * - window:toggleFullscreen — 切换全屏
 * - window:toggleDevtools   — 切换开发者工具
 * - window:reload           — 重新加载窗口
 * - window:focusRenderer    — 从内嵌视图把原生焦点切回工作台
 */

import type { BrowserWindow } from 'electron'
import { windowIpc } from '../../shared/ipc/window'
import type { TrustedRendererGuard } from './trusted-renderer-guard'
import { registerTrustedIpcContract } from './trusted-renderer-guard'

export function registerWindowIpc(
  mainWindow: BrowserWindow,
  trustedRendererGuard: TrustedRendererGuard,
): void {
  /** 切换全屏 */
  registerTrustedIpcContract(windowIpc.toggleFullscreen, trustedRendererGuard, () => {
    if (mainWindow.isDestroyed()) return { success: false }
    mainWindow.setFullScreen(!mainWindow.isFullScreen())
    return { success: true, fullscreen: mainWindow.isFullScreen() }
  })

  /** 切换开发者工具 */
  registerTrustedIpcContract(windowIpc.toggleDevtools, trustedRendererGuard, () => {
    if (mainWindow.isDestroyed()) return { success: false }
    mainWindow.webContents.toggleDevTools()
    return { success: true }
  })

  /** 重新加载窗口 */
  registerTrustedIpcContract(windowIpc.reload, trustedRendererGuard, () => {
    if (mainWindow.isDestroyed()) return { success: false }
    mainWindow.reload()
    return { success: true }
  })

  registerTrustedIpcContract(windowIpc.focusRenderer, trustedRendererGuard, () => {
    if (mainWindow.isDestroyed()) return { success: false }
    mainWindow.webContents.focus()
    return { success: true }
  })

  console.log('[WindowIPC] 窗口控制 IPC 已注册')
}
