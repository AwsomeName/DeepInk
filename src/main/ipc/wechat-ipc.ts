/**
 * 微信公众号格式转换 IPC 处理器
 */

import type { IpcMainInvokeEvent } from 'electron'
import { convertMarkdownToWechatHTML } from '../wechat/convert'
import { registerTrustedIpcHandler, type TrustedRendererGuard } from './trusted-renderer-guard'
import { wechatConvertSchema } from './workbench-ipc-schema'

export function registerWechatIPC(trustedRendererGuard: TrustedRendererGuard): void {
  const handle = <Args extends unknown[], Result>(
    channel: string,
    handler: (event: IpcMainInvokeEvent, ...args: Args) => Result,
  ): void => registerTrustedIpcHandler(channel, trustedRendererGuard, handler)

  handle('wechat:convert', async (_event, input: { markdown: string }) => {
    try {
      const parsedInput = wechatConvertSchema.parse(input)
      const html = convertMarkdownToWechatHTML(parsedInput.markdown)
      return { html }
    } catch (error) {
      return { error: String(error) }
    }
  })
}
