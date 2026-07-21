/**
 * 对话框 IPC 处理器
 *
 * 封装 Electron dialog API，暴露给渲染进程用于：
 * - browser_upload_file 工具需要用户选择本地文件
 * - 未来导出文档时让用户选择保存位置
 */

import { dialog, type BrowserWindow, type IpcMainInvokeEvent } from 'electron'
import type {
  MessageBoxOptions,
  OpenDialogOptions,
  SaveDialogOptions,
} from '../../shared/ipc/dialog'
import { registerTrustedIpcHandler, type TrustedRendererGuard } from './trusted-renderer-guard'
import {
  messageBoxOptionsSchema,
  openDialogOptionsSchema,
  saveDialogOptionsSchema,
} from './workbench-ipc-schema'
export type {
  MessageBoxOptions,
  OpenDialogOptions,
  SaveDialogOptions,
} from '../../shared/ipc/dialog'

/**
 * 注册对话框相关的 IPC 处理器
 */
export function registerDialogIpc(
  mainWindow: BrowserWindow,
  trustedRendererGuard: TrustedRendererGuard,
): void {
  const handle = <Args extends unknown[], Result>(
    channel: string,
    handler: (event: IpcMainInvokeEvent, ...args: Args) => Result,
  ): void => registerTrustedIpcHandler(channel, trustedRendererGuard, handler)

  /** 打开文件选择对话框 */
  handle('dialog:showOpenDialog', async (_event, options?: OpenDialogOptions) => {
    const parsedOptions = openDialogOptionsSchema.parse(options)
    if (mainWindow.isDestroyed()) {
      return { canceled: true, filePaths: [] }
    }
    const result = await dialog.showOpenDialog(mainWindow, {
      title: parsedOptions?.title ?? (parsedOptions?.selectDirectory ? '选择文件夹' : '选择文件'),
      properties: parsedOptions?.selectDirectory
        ? ['openDirectory']
        : ['openFile', ...(parsedOptions?.multiSelections ? ['multiSelections' as const] : [])],
      filters: parsedOptions?.filters,
    })
    return {
      canceled: result.canceled,
      filePaths: result.filePaths,
    }
  })

  /** 打开保存文件对话框 */
  handle('dialog:showSaveDialog', async (_event, options?: SaveDialogOptions) => {
    const parsedOptions = saveDialogOptionsSchema.parse(options)
    if (mainWindow.isDestroyed()) {
      return { canceled: true, filePath: '' }
    }
    const result = await dialog.showSaveDialog(mainWindow, {
      title: parsedOptions?.title ?? '保存文件',
      defaultPath: parsedOptions?.defaultPath,
      filters: parsedOptions?.filters,
    })
    return {
      canceled: result.canceled,
      filePath: result.filePath ?? '',
    }
  })

  /** 打开普通消息对话框 */
  handle('dialog:showMessageBox', async (_event, options: MessageBoxOptions) => {
    const parsedOptions = messageBoxOptionsSchema.parse(options)
    if (mainWindow.isDestroyed()) {
      return { response: parsedOptions.cancelId ?? 0 }
    }
    return dialog.showMessageBox(mainWindow, {
      type: parsedOptions.type ?? 'none',
      title: parsedOptions.title,
      message: parsedOptions.message,
      detail: parsedOptions.detail,
      buttons: parsedOptions.buttons,
      defaultId: parsedOptions.defaultId,
      cancelId: parsedOptions.cancelId,
    })
  })
}
