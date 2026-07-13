/**
 * WYSIWYG Markdown 编辑器组件
 *
 * 基于 Tiptap (ProseMirror) 的飞书风格编辑器。
 * 支持 Markdown 快捷键（# → 标题、** → 粗体等）。
 * Agent 可通过 MCP 工具推送 Markdown 内容，实时渲染为富文本。
 */

import { useEffect, useCallback, useRef } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Markdown } from '@tiptap/markdown'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import Placeholder from '@tiptap/extension-placeholder'
import Image from '@tiptap/extension-image'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import { TableCell } from '@tiptap/extension-table-cell'
import { TableHeader } from '@tiptap/extension-table-header'
import Link from '@tiptap/extension-link'
import { common, createLowlight } from 'lowlight'
import { useEditorStore } from '../../stores/editor-store'
import { useTabStore } from '../../stores/tab-store'
import { EditorToolbar } from './EditorToolbar'

/** 代码高亮引擎（同步，仅加载常用语言） */
const lowlight = createLowlight(common)

interface MarkdownEditorProps {
  /** 关联的文件路径（undefined = Agent 创建的虚拟文档） */
  filePath?: string
  /** Tab ID */
  tabId: string
}

export function MarkdownEditor({ filePath, tabId }: MarkdownEditorProps): React.ReactElement {
  // 用于存储文件的 key（filePath 或 tabId 作为虚拟文件 key）
  const fileKey = filePath ?? `virtual:${tabId}`

  // 用 ref 持有最新 fileKey，防止 Tiptap onUpdate 闭包捕获旧值
  const fileKeyRef = useRef(fileKey)
  fileKeyRef.current = fileKey

  const fileState = useEditorStore((s) => s.files[fileKey])
  const dirty = fileState?.dirty ?? false

  // 订阅 pendingUpdates 长度变化（驱动消费 effect）
  const pendingCount = useEditorStore((s) => s.pendingUpdates.length)

  // 用于追踪已应用的 Agent 更新 ID
  const appliedUpdateIds = useRef<Set<string>>(new Set())

  // --- 初始化 Tiptap 编辑器 ---
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: false, // 用 CodeBlockLowlight 替代
        heading: { levels: [1, 2, 3, 4, 5, 6] },
      }),
      Markdown,
      CodeBlockLowlight.configure({
        lowlight,
        defaultLanguage: 'plaintext',
      }),
      Placeholder.configure({
        placeholder: '开始输入，或让 AI 帮你写…',
      }),
      Image.configure({
        inline: false,
        allowBase64: true,
      }),
      TaskList,
      TaskItem.configure({
        nested: true,
      }),
      Table.configure({
        resizable: true,
      }),
      TableRow,
      TableCell,
      TableHeader,
      Link.configure({
        openOnClick: false,
        autolink: true,
      }),
    ],
    editorProps: {
      attributes: {
        class: 'tiptap',
      },
    },
    onUpdate: ({ editor: ed }) => {
      // 用户编辑 → 序列化为 Markdown → 更新 store
      // 使用 ref 获取最新 fileKey，避免闭包捕获旧值
      // @tiptap/markdown v3: getMarkdown() 直接在 Editor 实例上
      const md = ed.getMarkdown()
      if (md !== undefined) {
        useEditorStore.getState().updateContent(fileKeyRef.current, md)
      }
    },
  })

  // --- 加载文件内容 ---
  useEffect(() => {
    if (filePath) {
      useEditorStore.getState().openFile(filePath)
    } else {
      // 虚拟文件：用 Tab 的 initialContent 作为种子（复制 Tab 时携带内容）
      const seed = useTabStore.getState().tabs.find((t) => t.id === tabId)?.initialContent ?? ''
      useEditorStore.getState().initVirtualFile(fileKey, seed)
    }
  }, [filePath, fileKey, tabId])

  // --- 文件加载完成后设置编辑器内容 ---
  useEffect(() => {
    if (!editor || !fileState || fileState.loading) return
    // 首次加载：将 Markdown 解析为 ProseMirror 文档
    const md = fileState.currentContent
    if (md) {
      // @tiptap/markdown v3: 需要指定 contentType 让 Markdown 扩展解析
      editor.commands.setContent(md, { contentType: 'markdown' })
    }
    // 仅在 loading 从 true 变为 false 时执行
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, fileState?.loading])

  // --- 处理 Agent IPC 事件（读取请求、保存请求） ---
  useEffect(() => {
    if (!editor) return

    // 监听 Agent 读取请求 → 回传当前编辑器内容
    const unsubReadRequest = window.deepink.editor.onReadRequest((request) => {
      // @tiptap/markdown v3: getMarkdown() 直接在 Editor 实例上
      const md = editor.getMarkdown()
      window.deepink.editor.readResponse(request.id, md)
    })

    // 监听 Agent 保存请求 → 写文件并回传结果
    const unsubSaveRequest = window.deepink.editor.onSaveRequest(async (request) => {
      try {
        // @tiptap/markdown v3: getMarkdown() 直接在 Editor 实例上
        const md = editor.getMarkdown()
        const targetPath = request.filePath ?? filePath
        if (targetPath) {
          await window.deepink.fs.writeFile(targetPath, md)
          // 更新 savedContent 清除 dirty
          useEditorStore.setState((s) => ({
            files: {
              ...s.files,
              [fileKey]: {
                ...s.files[fileKey],
                savedContent: md,
                currentContent: md,
                dirty: false,
              },
            },
          }))
          window.deepink.editor.saveResult(request.id, true)
        } else {
          window.deepink.editor.saveResult(request.id, false, '无文件路径')
        }
      } catch (err: unknown) {
        window.deepink.editor.saveResult(
          request.id,
          false,
          err instanceof Error ? err.message : '保存失败',
        )
      }
    })

    // cleanup：preload 返回的取消订阅函数
    return () => {
      unsubReadRequest()
      unsubSaveRequest()
    }
  }, [editor, filePath, fileKey])

  // --- 消费 pending updates（由 applyAgentUpdate 增加 pendingCount 驱动） ---
  useEffect(() => {
    if (!editor || pendingCount === 0) return

    // 消费当前文件的待处理更新
    const updates = useEditorStore.getState().consumePendingUpdates(
      filePath ?? undefined,
    )

    for (const update of updates) {
      // 跳过已应用的更新
      if (appliedUpdateIds.current.has(update.id)) continue
      appliedUpdateIds.current.add(update.id)

      switch (update.type) {
        case 'write': {
          // 替换全部内容（emitUpdate:false 避免触发 onUpdate 双写 store）
          editor.commands.setContent(update.content, { contentType: 'markdown', emitUpdate: false })
          useEditorStore.getState().updateContent(fileKey, update.content)
          break
        }
        case 'append': {
          // 在末尾追加内容
          const currentMd = editor.getMarkdown()
          const newMd = currentMd + '\n\n' + update.content
          editor.commands.setContent(newMd, { contentType: 'markdown', emitUpdate: false })
          useEditorStore.getState().updateContent(fileKey, newMd)
          break
        }
        case 'insert': {
          // 在指定位置插入
          const currentMd = editor.getMarkdown()
          let newMd: string
          if (update.position === 'start') {
            newMd = update.content + '\n\n' + currentMd
          } else {
            newMd = currentMd + '\n\n' + update.content
          }
          editor.commands.setContent(newMd, { contentType: 'markdown', emitUpdate: false })
          useEditorStore.getState().updateContent(fileKey, newMd)
          break
        }
      }

      // 通知主进程更新已应用
      window.deepink.editor.contentUpdateAck(update.id)
    }
  }, [editor, filePath, fileKey, pendingCount])

  // --- 保存快捷键 (Cmd+S) ---
  const handleSave = useCallback(async () => {
    const editorStore = useEditorStore.getState()

    // 未命名文档 → 另存为
    if (!filePath) {
      const current = editorStore.files[fileKey]?.currentContent ?? ''
      if (!current) return
      const result = await window.deepink.dialog.showSaveDialog({
        title: '另存为',
        defaultPath: '未命名.md',
        filters: [{ name: 'Markdown', extensions: ['md'] }],
      })
      if (result.canceled || !result.filePath) return
      try {
        await window.deepink.fs.writeFile(result.filePath, current)
        // 回填 Tab filePath，编辑器将按 key 重挂载并从磁盘读取（dirty 清零）
        useTabStore.getState().updateTabFilePath(tabId, result.filePath)
      } catch (err) {
        console.error('[MarkdownEditor] 另存为失败:', err)
      }
      return
    }

    // 已命名文档：用 getState() 读实时 dirty，不依赖闭包中的 stale dirty
    const currentDirty = editorStore.files[fileKey]?.dirty
    if (!currentDirty) return
    try {
      await editorStore.saveFile(filePath)
    } catch (err) {
      console.error('[MarkdownEditor] 保存失败:', err)
    }
  }, [filePath, fileKey, tabId])

  // 注册编辑器级别的快捷键
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      const cmd = e.metaKey || e.ctrlKey
      if (cmd && e.key === 's') {
        e.preventDefault()
        handleSave()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleSave])

  // --- Tab 标题更新（dirty 标记） ---
  useEffect(() => {
    useTabStore.getState().updateTabDirty(tabId, dirty)
  }, [dirty, tabId])

  // --- 加载中状态 ---
  if (fileState?.loading) {
    return (
      <div className="markdown-editor-wrapper">
        <div className="editor-loading">加载中…</div>
      </div>
    )
  }

  return (
    <div className="markdown-editor-wrapper">
      <EditorToolbar
        editor={editor}
        filePath={filePath}
        dirty={dirty}
        onSave={handleSave}
      />
      <div className="tiptap-editor">
        {editor && <EditorContent editor={editor} />}
      </div>
    </div>
  )
}
