import { dialog, ipcMain } from 'electron'
import { BrowserManager, ViewMode } from '../browser/browser-manager'
import type { BrowserInstanceStore } from '../persistence/browser-instance-store'
import type { BrowserCreateViewOptions } from '../../shared/ipc/browser'
import type { BrowserTaskRuntime } from '../browser/browser-task-runtime'
import type { BrowserDownloadStore } from '../browser/browser-download-store'

/**
 * 注册浏览器相关的 IPC 处理器
 *
 * 多视图版本：所有导航/缩放/设备模式通道都前置 tabId 参数，
 * 视图生命周期由 createView / destroyView / setActive 三个通道管理。
 */
export function registerBrowserIpc(
  browserManager: BrowserManager,
  instanceStore?: BrowserInstanceStore,
  taskRuntime?: BrowserTaskRuntime,
  downloadStore?: BrowserDownloadStore,
): void {
  // 渲染进程上报 Workbench 区域坐标（作用于当前活跃视图）
  ipcMain.on('workbench:bounds', (_event, bounds) => {
    browserManager.updateBounds(bounds)
  })

  // ─── 视图生命周期 ───
  // opts.restore：从快照重建时传入，恢复 viewMode/zoom
  ipcMain.handle(
    'browser:createView',
    (
      _event,
      tabId: string,
      initialUrl?: string,
      opts?: BrowserCreateViewOptions,
    ) => {
      browserManager.createView(tabId, initialUrl, opts)
    },
  )

  ipcMain.handle('browser:destroyView', (_event, tabId: string) => {
    browserManager.destroyView(tabId)
  })

  /** 设置活跃视图；null = 全部隐藏 */
  ipcMain.handle('browser:setActive', (_event, tabId: string | null) => {
    browserManager.setActive(tabId)
  })

  // ─── 导航 ───
  ipcMain.handle('browser:navigate', async (_event, tabId: string, url: string) => {
    await browserManager.navigate(tabId, url)
  })

  ipcMain.handle('browser:goBack', (_event, tabId: string) => {
    browserManager.goBack(tabId)
  })

  ipcMain.handle('browser:goForward', (_event, tabId: string) => {
    browserManager.goForward(tabId)
  })

  ipcMain.handle('browser:reload', (_event, tabId: string) => {
    browserManager.reload(tabId)
  })

  ipcMain.handle('browser:getCurrentURL', (_event, tabId: string) => {
    return browserManager.getCurrentURL(tabId)
  })

  // ─── 缩放控制 ───
  ipcMain.handle('browser:zoomIn', (_event, tabId: string) => {
    browserManager.zoomIn(tabId)
  })

  ipcMain.handle('browser:zoomOut', (_event, tabId: string) => {
    browserManager.zoomOut(tabId)
  })

  ipcMain.handle('browser:resetZoom', (_event, tabId: string) => {
    browserManager.resetZoom(tabId)
  })

  ipcMain.handle('browser:setZoom', (_event, tabId: string, factor: number) => {
    browserManager.setZoom(tabId, factor)
  })

  ipcMain.handle('browser:fitWidth', (_event, tabId: string) => {
    browserManager.setFitWidth(tabId)
  })

  // ─── 设备模式（桌面 / 移动）───
  ipcMain.handle('browser:setDeviceMode', (_event, tabId: string, mode: ViewMode) => {
    browserManager.setDeviceMode(tabId, mode)
  })

  // ─── 视图状态查询（活跃视图）───
  ipcMain.handle('browser:getViewState', () => {
    return browserManager.getViewState()
  })

  // ─── 实例快照（重启「恢复上次会话」入口） ───
  // 登录态由默认 session 持久化，无需 IPC；此处仅管理 URL/视图模式快照。

  ipcMain.handle('browser:listSnapshots', async () => {
    if (!instanceStore) return []
    return instanceStore.list()
  })

  ipcMain.handle('browser:removeSnapshot', async (_event, id: string) => {
    if (!instanceStore) return
    await instanceStore.remove(id)
  })

  ipcMain.handle('browser:clearSnapshots', async () => {
    if (!instanceStore) return
    await instanceStore.clear()
  })

  ipcMain.handle('browser:listHistory', async (_event, limit?: number) => {
    if (!instanceStore) return []
    return instanceStore.listHistory(limit)
  })

  ipcMain.handle('browser:clearHistory', async () => {
    if (!instanceStore) return
    await instanceStore.clearHistory()
  })

  ipcMain.handle('browserTask:start', (_event, tabId: string, goal: string) => {
    if (!taskRuntime) throw new Error('浏览器任务运行时未初始化')
    return taskRuntime.startTask({ tabId, goal })
  })

  ipcMain.handle('browserTask:list', () => {
    if (!taskRuntime) return []
    return taskRuntime.listTasks()
  })

  ipcMain.handle('browserTask:get', (_event, taskRunId: string) => {
    if (!taskRuntime) return null
    return taskRuntime.getTask(taskRunId)
  })

  ipcMain.handle('browserTask:getActiveForTab', (_event, tabId: string) => {
    if (!taskRuntime) return null
    return taskRuntime.getActiveTaskForTab(tabId)
  })

  ipcMain.handle('browserTask:pause', (_event, taskRunId: string) => {
    if (!taskRuntime) throw new Error('浏览器任务运行时未初始化')
    return taskRuntime.pauseTask(taskRunId)
  })

  ipcMain.handle('browserTask:resume', (_event, taskRunId: string) => {
    if (!taskRuntime) throw new Error('浏览器任务运行时未初始化')
    return taskRuntime.resumeTask(taskRunId)
  })

  ipcMain.handle('browserTask:cancel', (_event, taskRunId: string) => {
    if (!taskRuntime) throw new Error('浏览器任务运行时未初始化')
    return taskRuntime.cancelTask(taskRunId)
  })

  ipcMain.handle('browserTask:finish', (_event, taskRunId: string) => {
    if (!taskRuntime) throw new Error('浏览器任务运行时未初始化')
    return taskRuntime.finishTask(taskRunId)
  })

  ipcMain.handle('browserTask:listActionLogs', (_event, taskRunId: string) => {
    if (!taskRuntime) return []
    return taskRuntime.listActionLogs(taskRunId)
  })

  ipcMain.handle('browserDownload:list', () => {
    if (!downloadStore) return []
    return downloadStore.listDownloads()
  })

  ipcMain.handle('browserDownload:get', (_event, downloadId: string) => {
    if (!downloadStore) return null
    return downloadStore.getDownload(downloadId)
  })

  ipcMain.handle('browserDownload:keepToWorkspace', async (_event, downloadId: string) => {
    if (!downloadStore) throw new Error('浏览器下载存储未初始化')
    return downloadStore.keepDownloadToWorkspace(downloadId)
  })

  ipcMain.handle('browserDownload:saveAs', async (_event, downloadId: string) => {
    if (!downloadStore) throw new Error('浏览器下载存储未初始化')
    const record = downloadStore.getDownload(downloadId)
    if (!record) throw new Error(`下载记录不存在: ${downloadId}`)
    const result = await dialog.showSaveDialog({
      defaultPath: record.suggestedFilename,
      properties: ['createDirectory', 'showOverwriteConfirmation'],
    })
    if (result.canceled || !result.filePath) return null
    return downloadStore.saveDownloadAs(downloadId, result.filePath)
  })

  ipcMain.handle('browserDownload:discard', async (_event, downloadId: string) => {
    if (!downloadStore) throw new Error('浏览器下载存储未初始化')
    return downloadStore.discardDownload(downloadId)
  })

  ipcMain.handle('browserDownload:open', async (_event, downloadId: string) => {
    if (!downloadStore) throw new Error('浏览器下载存储未初始化')
    await downloadStore.openDownload(downloadId)
  })

  ipcMain.handle('browserDownload:reveal', (_event, downloadId: string) => {
    if (!downloadStore) throw new Error('浏览器下载存储未初始化')
    downloadStore.revealDownload(downloadId)
  })
}
