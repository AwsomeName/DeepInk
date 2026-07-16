/**
 * 编辑器工具模块
 *
 * 提供 5 个 MCP 工具让 Agent 能操作主工作区的 Markdown 编辑器。
 * Agent 写入 Markdown → 渲染进程实时渲染为富文本。
 *
 * 工具通过 IPC 推送内容到渲染进程，等待 ack 确认。
 * 这与 PermissionManager 的 requestConfirmation 模式类似。
 */

import { randomUUID } from 'node:crypto'
import type { BrowserWindow } from 'electron'
import type { ToolModule, ToolDefinition } from '../../types'
import type {
  EditorContentUpdate,
  EditorReadRequest,
  EditorSaveRequest,
} from '../../../../shared/ipc/editor'

/** 等待中的编辑器操作 */
interface PendingOperation {
  resolve: (result: unknown) => void
  reject: (error: Error) => void
  timeout: ReturnType<typeof setTimeout>
}

/** 超时时间（毫秒） */
const OPERATION_TIMEOUT = 30_000

/**
 * 5 个编辑器工具定义
 */
const EDITOR_TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'editor_write',
    description:
      '将 Markdown 内容写入编辑器。替换当前文档全部内容。如果当前没有编辑器 Tab，会自动创建一个新的。用于让 AI 生成完整的文档。',
    inputSchema: {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description: '完整的 Markdown 内容',
        },
        filePath: {
          type: 'string',
          description: '可选的目标文件路径。省略则写入当前活跃的编辑器 Tab。',
        },
        title: {
          type: 'string',
          description: '创建新 Tab 时的标题（如 "Report.md"）。默认 "Untitled.md"。',
        },
      },
      required: ['content'],
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
  },
  {
    name: 'editor_append',
    description: '在编辑器文档末尾追加 Markdown 内容。适用于逐步构建文档。',
    inputSchema: {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description: '要追加的 Markdown 内容',
        },
        filePath: {
          type: 'string',
          description: '可选的目标文件路径。省略则追加到当前活跃的编辑器 Tab。',
        },
      },
      required: ['content'],
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
  },
  {
    name: 'editor_insert',
    description:
      '在编辑器指定位置插入 Markdown 内容。position 可选 "start"（文档开头）或 "end"（文档末尾）。',
    inputSchema: {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description: '要插入的 Markdown 内容',
        },
        position: {
          type: 'string',
          description: '插入位置："start" 或 "end"。默认 "end"。',
        },
      },
      required: ['content', 'position'],
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
  },
  {
    name: 'editor_read',
    description: '读取当前编辑器文档的 Markdown 内容。返回完整的 Markdown 字符串。',
    inputSchema: {
      type: 'object',
      properties: {
        filePath: {
          type: 'string',
          description: '可选的文件路径。省略则读取当前活跃的编辑器 Tab。',
        },
      },
    },
    annotations: { readOnlyHint: true, destructiveHint: false },
  },
  {
    name: 'editor_save',
    description: '保存当前编辑器内容到磁盘。文件必须已关联文件路径。',
    inputSchema: {
      type: 'object',
      properties: {
        filePath: {
          type: 'string',
          description: '可选的文件路径。省略则保存当前活跃的编辑器 Tab。',
        },
      },
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
  },
]

/**
 * 编辑器工具模块
 *
 * 将 Agent 的编辑请求通过 IPC 转发到渲染进程，
 * 等待渲染进程确认后返回结果。
 */
export class EditorToolModule implements ToolModule {
  readonly name = 'editor'
  readonly tools: ToolDefinition[] = EDITOR_TOOL_DEFINITIONS

  private mainWindow: BrowserWindow | null
  private pending: Map<string, PendingOperation> = new Map()

  constructor(mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow
  }

  async execute(toolName: string, params: Record<string, unknown>): Promise<unknown> {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) {
      throw new Error('主窗口不可用')
    }

    const action = toolName.replace(/^editor_/, '')

    switch (action) {
      case 'write':
        return this.sendContentUpdate('write', params)
      case 'append':
        return this.sendContentUpdate('append', params)
      case 'insert':
        return this.sendContentUpdate('insert', params)
      case 'read':
        return this.requestRead(params)
      case 'save':
        return this.requestSave(params)
      default:
        throw new Error(`未知编辑器工具: ${toolName}`)
    }
  }

  /**
   * 推送内容更新到渲染进程，等待 ack
   */
  private sendContentUpdate(
    type: 'write' | 'append' | 'insert',
    params: Record<string, unknown>,
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = randomUUID()

      const timeout = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error('编辑器操作超时'))
      }, OPERATION_TIMEOUT)

      this.pending.set(id, { resolve, reject, timeout })

      const payload: EditorContentUpdate = {
        id,
        type,
        content: params.content as string,
        filePath: params.filePath as string | undefined,
        position: params.position as string | undefined,
        title: params.title as string | undefined,
        timestamp: Date.now(),
      }

      this.mainWindow!.webContents.send('editor:contentUpdate', payload)
    })
  }

  /**
   * 请求读取编辑器内容（renderer → main 返回内容）
   */
  private requestRead(params: Record<string, unknown>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = randomUUID()

      const timeout = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error('编辑器读取超时'))
      }, OPERATION_TIMEOUT)

      this.pending.set(id, { resolve, reject, timeout })

      const request: EditorReadRequest = {
        id,
        filePath: params.filePath as string | undefined,
      }
      this.mainWindow!.webContents.send('editor:readRequest', request)
    })
  }

  /**
   * 请求保存编辑器
   */
  private requestSave(params: Record<string, unknown>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = randomUUID()

      const timeout = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error('编辑器保存超时'))
      }, OPERATION_TIMEOUT)

      this.pending.set(id, { resolve, reject, timeout })

      const request: EditorSaveRequest = {
        id,
        filePath: params.filePath as string | undefined,
      }
      this.mainWindow!.webContents.send('editor:saveRequest', request)
    })
  }

  /**
   * 确认操作已完成（由 IPC handler 调用）
   */
  resolveOperation(id: string, result: unknown): void {
    const op = this.pending.get(id)
    if (!op) {
      console.warn(`[EditorToolModule] 未找到操作: ${id}`)
      return
    }

    clearTimeout(op.timeout)
    this.pending.delete(id)
    op.resolve(result)
  }

  /**
   * 拒绝操作（由 IPC handler 调用）
   */
  rejectOperation(id: string, error: string): void {
    const op = this.pending.get(id)
    if (!op) return

    clearTimeout(op.timeout)
    this.pending.delete(id)
    op.reject(new Error(error))
  }

  /** 销毁 */
  destroy(): void {
    for (const [, op] of this.pending) {
      clearTimeout(op.timeout)
      op.reject(new Error('模块销毁'))
    }
    this.pending.clear()
    this.mainWindow = null
  }
}
