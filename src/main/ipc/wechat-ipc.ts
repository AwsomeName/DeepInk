/**
 * 微信公众号格式转换 IPC 处理器
 */

import { ipcMain } from 'electron'
import { convertMarkdownToWechatHTML } from '../wechat/convert'

export function registerWechatIPC(): void {
  ipcMain.handle('wechat:convert', async (_event, { markdown }: { markdown: string }) => {
    try {
      const html = convertMarkdownToWechatHTML(markdown)
      return { html }
    } catch (error) {
      return { error: String(error) }
    }
  })
}
