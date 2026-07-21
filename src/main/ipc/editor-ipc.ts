/**
 * 编辑器 IPC 处理器
 *
 * 处理渲染进程回传的编辑器操作结果：
 * - editor:contentUpdateAck — Agent 内容推送的确认
 * - editor:readResponse — 编辑器内容读取响应
 * - editor:saveResult — 保存操作结果
 */

import type { IpcMainInvokeEvent } from 'electron'
import type { EditorToolModule } from '../mcp/modules/editor'
import { registerTrustedIpcHandler, type TrustedRendererGuard } from './trusted-renderer-guard'
import {
  editorContentSchema,
  editorErrorSchema,
  editorOperationIdSchema,
} from './workbench-ipc-schema'
import { z } from 'zod'

/**
 * 注册编辑器相关 IPC 处理器
 */
export function registerEditorIpc(
  editorModule: EditorToolModule,
  trustedRendererGuard: TrustedRendererGuard,
): void {
  const handle = <Args extends unknown[], Result>(
    channel: string,
    handler: (event: IpcMainInvokeEvent, ...args: Args) => Result,
  ): void => registerTrustedIpcHandler(channel, trustedRendererGuard, handler)

  // Agent 内容更新确认（renderer → main）
  handle('editor:contentUpdateAck', (_event, id: string, success = true, error?: string) => {
    const parsedId = editorOperationIdSchema.parse(id)
    const parsedSuccess = z.boolean().parse(success)
    const parsedError = editorErrorSchema.parse(error)
    if (parsedSuccess) editorModule.resolveOperation(parsedId, { success: true })
    else editorModule.rejectOperation(parsedId, parsedError ?? '编辑器拒绝了不安全的内容更新')
  })

  // 编辑器内容读取响应（renderer → main）
  handle('editor:readResponse', (_event, id: string, content: string) => {
    editorModule.resolveOperation(editorOperationIdSchema.parse(id), {
      content: editorContentSchema.parse(content),
    })
  })

  // 编辑器保存结果（renderer → main）
  handle('editor:saveResult', (_event, id: string, success: boolean, error?: string) => {
    const parsedId = editorOperationIdSchema.parse(id)
    const parsedSuccess = z.boolean().parse(success)
    const parsedError = editorErrorSchema.parse(error)
    if (parsedSuccess) {
      editorModule.resolveOperation(parsedId, { success: true })
    } else {
      editorModule.rejectOperation(parsedId, parsedError ?? '保存失败')
    }
  })

  console.log('[CCLink Studio] 编辑器 IPC 已注册')
}
