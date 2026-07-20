import { ipcMain, type BrowserWindow, type IpcMainInvokeEvent } from 'electron'

export class UntrustedIpcSenderError extends Error {
  readonly code = 'UNTRUSTED_IPC_SENDER'

  constructor() {
    super('IPC 调用方不是受信任的工作台主页面')
    this.name = 'UntrustedIpcSenderError'
  }
}

export interface TrustedRendererGuard {
  assert(event: IpcMainInvokeEvent): void
  isTrusted(event: IpcMainInvokeEvent): boolean
}

export function createTrustedRendererGuard(
  mainWindow: BrowserWindow,
  rendererEntryUrl: string,
): TrustedRendererGuard {
  const isTrusted = (event: IpcMainInvokeEvent): boolean => {
    if (mainWindow.isDestroyed()) return false
    const trustedWebContents = mainWindow.webContents
    if (trustedWebContents.isDestroyed()) return false
    if (event.sender !== trustedWebContents) return false
    if (!event.senderFrame || event.senderFrame !== trustedWebContents.mainFrame) return false
    return isAllowedMainRendererUrl(event.senderFrame.url, rendererEntryUrl)
  }
  return {
    isTrusted,
    assert(event): void {
      if (!isTrusted(event)) throw new UntrustedIpcSenderError()
    },
  }
}

export function registerTrustedIpcHandler<Args extends unknown[], Result>(
  channel: string,
  guard: TrustedRendererGuard,
  handler: (event: IpcMainInvokeEvent, ...args: Args) => Result,
): void {
  ipcMain.handle(channel, (event, ...args: Args) => {
    guard.assert(event)
    return handler(event, ...args)
  })
}

export function isAllowedMainRendererUrl(candidateUrl: string, rendererEntryUrl: string): boolean {
  try {
    const candidate = new URL(candidateUrl)
    const entry = new URL(rendererEntryUrl)
    if (entry.protocol === 'http:' || entry.protocol === 'https:') {
      return candidate.origin === entry.origin
    }
    if (entry.protocol === 'file:') {
      candidate.hash = ''
      candidate.search = ''
      entry.hash = ''
      entry.search = ''
      return candidate.href === entry.href
    }
    return false
  } catch {
    return false
  }
}
