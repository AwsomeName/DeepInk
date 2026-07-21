import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { officialIpc } from '../shared/ipc/official'
import { agentApi } from './agent-api'
import { androidApi } from './android-api'
import { browserApi, reportWorkbenchBounds } from './browser-api'
import { dataSourceApi } from './data-source-api'
import {
  cadApi,
  gitBackupApi,
  hardwareApi,
  projectOpsApi,
  workspaceStateApi,
} from './local-ops-api'
import {
  dialogApi,
  editorApi,
  identityApi,
  updateApi,
  wechatApi,
  windowApi,
} from './renderer-support-api'
import { invokeIpcContract } from './ipc-contract-client'

contextBridge.exposeInMainWorld('cclinkStudio', {
  reportWorkbenchBounds,

  window: windowApi,

  browser: browserApi,

  identity: identityApi,

  official: {
    getStatus: () => invokeIpcContract(officialIpc.getStatus),
  },

  // Agent
  agent: agentApi,

  // 文件系统
  fs: {
    /** 获取用户 Home 目录路径 */
    getHomePath: () => ipcRenderer.invoke('fs:getHomePath'),
    /** 读取目录内容 */
    readDir: (dirPath: string) => ipcRenderer.invoke('fs:readDir', dirPath),
    /** 读取文件内容 */
    readFile: (filePath: string) => ipcRenderer.invoke('fs:readFile', filePath),
    /** 读取带版本指纹的文本文件 */
    readTextDocument: (filePath: string) => ipcRenderer.invoke('fs:readTextDocument', filePath),
    /** 渲染只读文件预览 */
    renderFile: (filePath: string) => ipcRenderer.invoke('fs:renderFile', filePath),
    /** 写入文件 */
    writeFile: (filePath: string, content: string) =>
      ipcRenderer.invoke('fs:writeFile', filePath, content),
    /** 冲突检测后原子保存文本文件 */
    saveTextDocument: (input: {
      filePath: string
      content: string
      expectedHash?: string
      force?: boolean
    }) => ipcRenderer.invoke('fs:saveTextDocument', input),
    /** 将本地图片复制到文档资源目录 */
    importDocumentAsset: (documentPath: string, sourcePath: string) =>
      ipcRenderer.invoke('fs:importDocumentAsset', documentPath, sourcePath),
    /** 将剪贴板图片写入文档资源目录 */
    saveDocumentAsset: (input: {
      documentPath: string
      fileName: string
      mimeType: string
      content: string
      encoding: 'base64'
    }) => ipcRenderer.invoke('fs:saveDocumentAsset', input),
    inspectMarkdownDocument: (documentPath: string) =>
      ipcRenderer.invoke('fs:inspectMarkdownDocument', documentPath),
    saveMarkdownDocumentAs: (input: { sourcePath?: string; targetPath: string; content: string }) =>
      ipcRenderer.invoke('fs:saveMarkdownDocumentAs', input),
    relocateMarkdownDocument: (input: { sourcePath: string; targetPath: string }) =>
      ipcRenderer.invoke('fs:relocateMarkdownDocument', input),
    exportMarkdownDocumentZip: (input: { documentPath: string; targetPath: string }) =>
      ipcRenderer.invoke('fs:exportMarkdownDocumentZip', input),
    trashMarkdownDocument: (input: { documentPath: string; includeAssets: boolean }) =>
      ipcRenderer.invoke('fs:trashMarkdownDocument', input),
    /** 获取文件/目录元数据 */
    stat: (filePath: string) => ipcRenderer.invoke('fs:stat', filePath),
    /** 安静检查路径是否为目录 */
    isDirectory: (filePath: string) => ipcRenderer.invoke('fs:isDirectory', filePath),
    /** 创建目录 */
    mkdir: (dirPath: string) => ipcRenderer.invoke('fs:mkdir', dirPath),
    /** 重命名 */
    rename: (oldPath: string, newPath: string) => ipcRenderer.invoke('fs:rename', oldPath, newPath),
    /** 移动，不覆盖目标中的同名项 */
    move: (oldPath: string, newPath: string) => ipcRenderer.invoke('fs:move', oldPath, newPath),
    /** 删除文件 */
    delete: (filePath: string) => ipcRenderer.invoke('fs:delete', filePath),
    /** 解压 zip 到同级同名目录 */
    extractZip: (filePath: string) => ipcRenderer.invoke('fs:extractZip', filePath),
    /** 用系统文件管理器打开路径 */
    openPath: (path: string) => ipcRenderer.invoke('fs:openPath', path),
    /** 监听目录变更，返回取消监听函数 */
    watchDir: async (dirPath: string, onChange: (event: any) => void) => {
      const watchId = await ipcRenderer.invoke('fs:watchDirStart', dirPath)
      const listener = (_event: IpcRendererEvent, payload: any): void => {
        if (payload?.watchId === watchId) onChange(payload)
      }
      ipcRenderer.on('fs:watchDirChanged', listener)
      return () => {
        ipcRenderer.removeListener('fs:watchDirChanged', listener)
        void ipcRenderer.invoke('fs:watchDirStop', watchId)
      }
    },
  },

  projectOps: projectOpsApi,

  gitBackup: gitBackupApi,

  hardware: hardwareApi,

  cad: cadApi,

  dialog: dialogApi,

  wechat: wechatApi,

  editor: editorApi,

  android: androidApi,

  dataSource: dataSourceApi,

  // Terminal 命令确认、执行事件与受限提交
  terminal: {
    onRequestCommandConfirmation: (callback: (request: any) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, request: any): void => callback(request)
      ipcRenderer.on('terminal:requestCommandConfirmation', handler)
      return () => ipcRenderer.removeListener('terminal:requestCommandConfirmation', handler)
    },
    onExecutionEvent: (callback: (event: any) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, event: any): void => callback(event)
      ipcRenderer.on('terminal:executionEvent', handler)
      return () => ipcRenderer.removeListener('terminal:executionEvent', handler)
    },
    resolveCommandConfirmation: (id: string, approved: boolean) =>
      ipcRenderer.invoke('terminal:resolveCommandConfirmation', id, approved),
    recordLifecycleEvent: (input: any) =>
      ipcRenderer.invoke('terminal:recordLifecycleEvent', input),
    submitCommand: (input: any) => ipcRenderer.invoke('terminal:submitCommand', input),
    startPty: (input: any) => ipcRenderer.invoke('terminal:startPty', input),
    writePty: (input: any) => ipcRenderer.invoke('terminal:writePty', input),
    resizePty: (input: any) => ipcRenderer.invoke('terminal:resizePty', input),
    terminatePty: (terminalSessionId: string) =>
      ipcRenderer.invoke('terminal:terminatePty', terminalSessionId),
    listSessions: () => ipcRenderer.invoke('terminal:listSessions'),
    listAuditEvents: (filter?: any) => ipcRenderer.invoke('terminal:listAuditEvents', filter),
    clearAuditSession: (terminalSessionId: string) =>
      ipcRenderer.invoke('terminal:clearAuditSession', terminalSessionId),
    clearAuditEvents: () => ipcRenderer.invoke('terminal:clearAuditEvents'),
  },

  // 应用设置
  settings: {
    /** 获取所有设置 */
    getAll: () => ipcRenderer.invoke('settings:getAll'),
    /** 获取凭证配置状态，不返回凭证原文 */
    getSecretStatus: () => ipcRenderer.invoke('settings:getSecretStatus'),
    /** 更新部分设置 */
    set: (updates: Partial<Record<string, unknown>>) => ipcRenderer.invoke('settings:set', updates),
    /** 使用系统加密存储保存凭证 */
    setSecret: (key: string, value: string) => ipcRenderer.invoke('settings:setSecret', key, value),
    /** 清除系统加密存储中的凭证 */
    clearSecret: (key: string) => ipcRenderer.invoke('settings:clearSecret', key),
    /** 恢复默认设置 */
    reset: () => ipcRenderer.invoke('settings:reset'),
    /** 重置单个设置到默认值 */
    resetKey: (key: string) => ipcRenderer.invoke('settings:resetKey', key),
    /** 检测本机 Claude Code CLI */
    detectClaudeCode: () => ipcRenderer.invoke('settings:detectClaudeCode'),
  },

  workspaceState: workspaceStateApi,

  update: updateApi,
})
