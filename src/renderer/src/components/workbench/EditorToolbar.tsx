/**
 * 编辑器工具栏
 *
 * 格式化按钮 + 文件路径 + 保存按钮。
 * 通过 Tiptap editor.chain() API 控制格式。
 */

import type { Editor } from '@tiptap/react'

interface EditorToolbarProps {
  editor: Editor | null
  filePath?: string
  dirty: boolean
  onSave: () => void
}

/** 工具栏按钮定义 */
interface ToolbarButton {
  label: string
  title: string
  isActive: () => boolean
  onClick: () => void
}

export function EditorToolbar({ editor, filePath, dirty, onSave }: EditorToolbarProps): React.ReactElement {
  if (!editor) return <></>

  const buttons: ToolbarButton[] = [
    {
      label: 'B',
      title: '粗体 (⌘B)',
      isActive: () => editor.isActive('bold'),
      onClick: () => editor.chain().focus().toggleBold().run(),
    },
    {
      label: 'I',
      title: '斜体 (⌘I)',
      isActive: () => editor.isActive('italic'),
      onClick: () => editor.chain().focus().toggleItalic().run(),
    },
    {
      label: 'S̶',
      title: '删除线',
      isActive: () => editor.isActive('strike'),
      onClick: () => editor.chain().focus().toggleStrike().run(),
    },
    {
      label: '</>',
      title: '行内代码',
      isActive: () => editor.isActive('code'),
      onClick: () => editor.chain().focus().toggleCode().run(),
    },
    {
      label: 'H1',
      title: '一级标题',
      isActive: () => editor.isActive('heading', { level: 1 }),
      onClick: () => editor.chain().focus().toggleHeading({ level: 1 }).run(),
    },
    {
      label: 'H2',
      title: '二级标题',
      isActive: () => editor.isActive('heading', { level: 2 }),
      onClick: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
    },
    {
      label: 'H3',
      title: '三级标题',
      isActive: () => editor.isActive('heading', { level: 3 }),
      onClick: () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
    },
    {
      label: '•',
      title: '无序列表',
      isActive: () => editor.isActive('bulletList'),
      onClick: () => editor.chain().focus().toggleBulletList().run(),
    },
    {
      label: '1.',
      title: '有序列表',
      isActive: () => editor.isActive('orderedList'),
      onClick: () => editor.chain().focus().toggleOrderedList().run(),
    },
    {
      label: '☐',
      title: '任务列表',
      isActive: () => editor.isActive('taskList'),
      onClick: () => editor.chain().focus().toggleTaskList().run(),
    },
    {
      label: '❝',
      title: '引用',
      isActive: () => editor.isActive('blockquote'),
      onClick: () => editor.chain().focus().toggleBlockquote().run(),
    },
    {
      label: '{ }',
      title: '代码块',
      isActive: () => editor.isActive('codeBlock'),
      onClick: () => editor.chain().focus().toggleCodeBlock().run(),
    },
    {
      label: '—',
      title: '分隔线',
      isActive: () => false,
      onClick: () => editor.chain().focus().setHorizontalRule().run(),
    },
  ]

  return (
    <div className="editor-toolbar">
      <div className="toolbar-group">
        {buttons.map((btn) => (
          <button
            key={btn.title}
            title={btn.title}
            className={btn.isActive() ? 'is-active' : ''}
            onClick={btn.onClick}
            style={
              ['B'].includes(btn.label)
                ? { fontWeight: 700 }
                : ['I'].includes(btn.label)
                  ? { fontStyle: 'italic' }
                  : undefined
            }
          >
            {btn.label}
          </button>
        ))}
      </div>

      {filePath && <span className="toolbar-filepath">{filePath}</span>}

      <button
        className={`toolbar-save ${dirty ? 'dirty' : ''}`}
        title={filePath ? '保存 (⌘S)' : '另存为 (⌘S)'}
        onClick={onSave}
        disabled={!dirty}
      >
        {dirty ? (filePath ? '● 保存' : '● 另存为') : filePath ? '已保存' : '未保存'}
      </button>
    </div>
  )
}
