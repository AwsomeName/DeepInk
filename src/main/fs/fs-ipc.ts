import { shell, type IpcMainInvokeEvent, type WebContents } from 'electron'
import { FileService } from './file-service'
import { SettingsService } from '../settings/settings-service'
import { homedir } from 'os'
import { randomUUID } from 'crypto'
import type { TrustedRendererGuard } from '../ipc/trusted-renderer-guard'
import { registerTrustedIpcHandler } from '../ipc/trusted-renderer-guard'
import {
  fsDocumentPathPairSchema,
  fsDocumentTargetPathSchema,
  fsMarkdownSaveAsSchema,
  fsMarkdownTrashSchema,
  fsPathPairSchema,
  fsPathSchema,
  fsSaveDocumentAssetSchema,
  fsSaveTextDocumentSchema,
  fsTextContentSchema,
  fsWatchIdSchema,
} from './fs-ipc-schema'

/**
 * 注册文件系统相关的 IPC 处理器
 */
export function registerFsIpc(
  fs: FileService,
  settingsService: SettingsService,
  trustedRendererGuard: TrustedRendererGuard,
): void {
  const handle = <Args extends unknown[], Result>(
    channel: string,
    handler: (event: IpcMainInvokeEvent, ...args: Args) => Result,
  ): void => registerTrustedIpcHandler(channel, trustedRendererGuard, handler)
  const watchers = new Map<
    string,
    { stop: () => void; sender: WebContents; onSenderDestroyed: () => void }
  >()

  const stopWatcher = (watchId: string): boolean => {
    const watcher = watchers.get(watchId)
    if (!watcher) return false
    watchers.delete(watchId)
    watcher.sender.removeListener('destroyed', watcher.onSenderDestroyed)
    watcher.stop()
    return true
  }

  // 获取用户 Home 目录路径
  handle('fs:getHomePath', () => {
    return homedir()
  })

  // 读取目录内容（根据设置决定是否显示隐藏文件）
  handle('fs:readDir', async (_event, input: unknown) => {
    return fs.readDir(fsPathSchema.parse(input), {
      showHiddenFiles: settingsService.getAll().showHiddenFiles,
    })
  })

  // 读取文件内容
  handle('fs:readFile', async (_event, input: unknown) => {
    return fs.readFile(fsPathSchema.parse(input))
  })

  handle('fs:readTextDocument', async (_event, input: unknown) => {
    return fs.readTextDocument(fsPathSchema.parse(input))
  })

  // 渲染只读文件预览
  handle('fs:renderFile', async (_event, input: unknown) => {
    return fs.renderFile(fsPathSchema.parse(input))
  })

  // 写入文件
  handle('fs:writeFile', async (_event, filePath: unknown, content: unknown) => {
    await fs.writeFile(fsPathSchema.parse(filePath), fsTextContentSchema.parse(content))
  })

  handle('fs:saveTextDocument', async (_event, input: unknown) =>
    fs.saveTextDocument(fsSaveTextDocumentSchema.parse(input)),
  )

  handle('fs:importDocumentAsset', async (_event, documentPath: unknown, sourcePath: unknown) => {
    const parsed = fsDocumentPathPairSchema.parse({ documentPath, sourcePath })
    return fs.importDocumentAsset(parsed.documentPath, parsed.sourcePath)
  })

  handle('fs:saveDocumentAsset', async (_event, input: unknown) =>
    fs.saveDocumentAsset(fsSaveDocumentAssetSchema.parse(input)),
  )

  handle('fs:inspectMarkdownDocument', async (_event, input: unknown) => {
    return fs.inspectMarkdownDocument(fsPathSchema.parse(input))
  })

  handle('fs:saveMarkdownDocumentAs', async (_event, input: unknown) =>
    fs.saveMarkdownDocumentAs(fsMarkdownSaveAsSchema.parse(input)),
  )

  handle('fs:relocateMarkdownDocument', async (_event, input: unknown) =>
    fs.relocateMarkdownDocument(fsPathPairSchema.parse(input)),
  )

  handle('fs:exportMarkdownDocumentZip', async (_event, input: unknown) => {
    return fs.exportMarkdownDocumentZip(fsDocumentTargetPathSchema.parse(input))
  })

  handle('fs:trashMarkdownDocument', async (_event, input: unknown) =>
    fs.trashMarkdownDocument(fsMarkdownTrashSchema.parse(input)),
  )

  // 获取文件/目录元数据
  handle('fs:stat', async (_event, input: unknown) => {
    return fs.stat(fsPathSchema.parse(input))
  })

  handle('fs:isDirectory', async (_event, input: unknown) => {
    return fs.isDirectory(fsPathSchema.parse(input))
  })

  // 创建目录
  handle('fs:mkdir', async (_event, input: unknown) => {
    await fs.mkdir(fsPathSchema.parse(input))
  })

  // 重命名
  handle('fs:rename', async (_event, oldPath: unknown, newPath: unknown) => {
    const parsed = fsPathPairSchema.parse({ sourcePath: oldPath, targetPath: newPath })
    await fs.rename(parsed.sourcePath, parsed.targetPath)
  })

  // 移动文件/目录（不覆盖目标中的同名项）
  handle('fs:move', async (_event, oldPath: unknown, newPath: unknown) => {
    const parsed = fsPathPairSchema.parse({ sourcePath: oldPath, targetPath: newPath })
    await fs.move(parsed.sourcePath, parsed.targetPath)
  })

  // 删除文件
  handle('fs:delete', async (_event, input: unknown) => {
    await fs.delete(fsPathSchema.parse(input))
  })

  // 解压 zip 到同级同名目录
  handle('fs:extractZip', async (_event, input: unknown) => {
    return fs.extractZip(fsPathSchema.parse(input))
  })

  // 用系统文件管理器打开路径
  handle('fs:openPath', async (_event, input: unknown) => {
    const error = await shell.openPath(fsPathSchema.parse(input))
    if (error) throw new Error(error)
  })

  handle('fs:watchDirStart', (event, input: unknown) => {
    const dirPath = fsPathSchema.parse(input)
    const watchId = randomUUID()
    const sender = event.sender
    const watcher = fs.watchDir(dirPath, (changeEvent, filePath) => {
      if (sender.isDestroyed()) {
        stopWatcher(watchId)
        return
      }
      sender.send('fs:watchDirChanged', { watchId, event: changeEvent, filePath })
    })
    const onSenderDestroyed = (): void => {
      stopWatcher(watchId)
    }
    watchers.set(watchId, { ...watcher, sender, onSenderDestroyed })
    sender.once('destroyed', onSenderDestroyed)
    return watchId
  })

  handle('fs:watchDirStop', (_event, input: unknown) => {
    return stopWatcher(fsWatchIdSchema.parse(input))
  })
}
