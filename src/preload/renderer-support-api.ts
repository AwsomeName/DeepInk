import { ipcRenderer } from 'electron'
import type { DialogApiContract } from '../shared/ipc/dialog'
import type { EditorApiContract } from '../shared/ipc/editor'
import type { IdentityApiContract } from '../shared/ipc/identity'
import type { UpdateApiContract } from '../shared/ipc/update'
import type { WechatApiContract } from '../shared/ipc/wechat'
import type { WindowApiContract } from '../shared/ipc/window'

export const windowApi: WindowApiContract = {
  toggleFullscreen: () => ipcRenderer.invoke('window:toggleFullscreen'),
  toggleDevtools: () => ipcRenderer.invoke('window:toggleDevtools'),
  reload: () => ipcRenderer.invoke('window:reload'),
  focusRenderer: () => ipcRenderer.invoke('window:focusRenderer'),
}

export const identityApi: IdentityApiContract = {
  getLocalIdentity: () => ipcRenderer.invoke('identity:getLocalIdentity'),
}

export const dialogApi: DialogApiContract = {
  showOpenDialog: (options) => ipcRenderer.invoke('dialog:showOpenDialog', options),
  showSaveDialog: (options) => ipcRenderer.invoke('dialog:showSaveDialog', options),
  showMessageBox: (options) => ipcRenderer.invoke('dialog:showMessageBox', options),
}

export const wechatApi: WechatApiContract = {
  convert: (markdown) => ipcRenderer.invoke('wechat:convert', { markdown }),
}

export const editorApi: EditorApiContract = {
  onContentUpdate: (callback) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      data: Parameters<typeof callback>[0],
    ): void => callback(data)
    ipcRenderer.removeAllListeners('editor:contentUpdate')
    ipcRenderer.on('editor:contentUpdate', handler)
    return () => ipcRenderer.removeListener('editor:contentUpdate', handler)
  },
  contentUpdateAck: (id, success = true, error) =>
    ipcRenderer.invoke('editor:contentUpdateAck', id, success, error),
  onReadRequest: (callback) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      data: Parameters<typeof callback>[0],
    ): void => callback(data)
    ipcRenderer.removeAllListeners('editor:readRequest')
    ipcRenderer.on('editor:readRequest', handler)
    return () => ipcRenderer.removeListener('editor:readRequest', handler)
  },
  readResponse: (id, content) => ipcRenderer.invoke('editor:readResponse', id, content),
  onSaveRequest: (callback) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      data: Parameters<typeof callback>[0],
    ): void => callback(data)
    ipcRenderer.removeAllListeners('editor:saveRequest')
    ipcRenderer.on('editor:saveRequest', handler)
    return () => ipcRenderer.removeListener('editor:saveRequest', handler)
  },
  saveResult: (id, success, error) => ipcRenderer.invoke('editor:saveResult', id, success, error),
}

export const updateApi: UpdateApiContract = {
  check: () => ipcRenderer.invoke('updater:check'),
  download: () => ipcRenderer.invoke('updater:download'),
  onUpdateAvailable: (callback) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      info: Parameters<typeof callback>[0],
    ): void => callback(info)
    ipcRenderer.removeAllListeners('updater:update-available')
    ipcRenderer.on('updater:update-available', handler)
    return () => ipcRenderer.removeListener('updater:update-available', handler)
  },
}
