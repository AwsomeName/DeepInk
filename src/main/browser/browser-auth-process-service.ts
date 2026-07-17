import { app, type BrowserWindow } from 'electron'
import { spawn, type ChildProcess } from 'node:child_process'
import { join } from 'node:path'
import type { BrowserManager } from './browser-manager'
import {
  BROWSER_AUTH_CHILD_ARGUMENT,
  encodeBrowserAuthChildOptions,
  isSupportedBrowserAuthRequest,
  type BrowserAuthAcknowledgement,
  type BrowserAuthChildMessage,
  type BrowserAuthRequest,
} from './browser-auth-contract'

export class BrowserAuthProcessService {
  private activeChild: ChildProcess | null = null

  constructor(
    private readonly mainWindow: BrowserWindow,
    private readonly browserManager: BrowserManager,
  ) {}

  open(request: BrowserAuthRequest): void {
    if (!isSupportedBrowserAuthRequest(request)) return

    this.stopActiveChild()
    const userDataPath = join(app.getPath('userData'), 'Browser Auth', request.profileId)
    const encodedOptions = encodeBrowserAuthChildOptions({ ...request, userDataPath })
    const childArguments = [`${BROWSER_AUTH_CHILD_ARGUMENT}${encodedOptions}`]
    if (!app.isPackaged) childArguments.unshift(app.getAppPath())

    const environment = { ...process.env }
    delete environment.ELECTRON_RUN_AS_NODE
    const child = spawn(process.execPath, childArguments, {
      env: environment,
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    })
    this.activeChild = child

    child.stdout?.on('data', (chunk) => {
      const text = String(chunk).trim()
      if (text) console.log(`[BrowserAuth] ${text}`)
    })
    child.stderr?.on('data', (chunk) => {
      const text = String(chunk).trim()
      if (text) console.warn(`[BrowserAuth] ${text}`)
    })
    child.on('message', (message: BrowserAuthChildMessage) => {
      if (message.tabId !== request.tabId || message.profileId !== request.profileId) {
        console.error('[BrowserAuth] 登录进程返回了不匹配的目标')
        return
      }
      void this.handleChildMessage(child, message)
    })
    child.on('exit', () => {
      if (this.activeChild === child) this.activeChild = null
    })
    child.on('error', (error) => {
      console.error('[BrowserAuth] 登录进程启动失败:', error)
      if (this.activeChild === child) this.activeChild = null
    })
  }

  destroy(): void {
    this.stopActiveChild()
  }

  private async handleChildMessage(
    child: ChildProcess,
    message: BrowserAuthChildMessage,
  ): Promise<void> {
    if (message.type === 'browser-auth-cancelled') {
      if (!this.mainWindow.isDestroyed()) this.mainWindow.focus()
      return
    }

    try {
      await this.browserManager.completeBrowserAuth(message)
      if (!this.mainWindow.isDestroyed()) {
        if (this.mainWindow.isMinimized()) this.mainWindow.restore()
        this.mainWindow.show()
        this.mainWindow.focus()
      }
      const acknowledgement: BrowserAuthAcknowledgement = { type: 'browser-auth-ack' }
      child.send?.(acknowledgement)
    } catch (error) {
      console.error('[BrowserAuth] 登录状态写回失败:', error)
    }
  }

  private stopActiveChild(): void {
    if (!this.activeChild) return
    this.activeChild.kill('SIGTERM')
    this.activeChild = null
  }
}
