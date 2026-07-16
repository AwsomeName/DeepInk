import { useEffect, useRef } from 'react'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { EditorState } from '@codemirror/state'
import {
  drawSelection,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from '@codemirror/view'
import { sourceRangeFromOffsets, type MarkdownSourceRange } from './markdown-codec'

interface MarkdownSourceEditorProps {
  value: string
  onChange: (value: string) => void
  onSelectionChange: (range: MarkdownSourceRange | null) => void
  onSave: () => void
  onContextMenuSelection?: (range: MarkdownSourceRange, point: { x: number; y: number }) => void
}

export function MarkdownSourceEditor({
  value,
  onChange,
  onSelectionChange,
  onSave,
  onContextMenuSelection,
}: MarkdownSourceEditorProps): React.ReactElement {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const valueRef = useRef(value)
  const onChangeRef = useRef(onChange)
  const onSelectionChangeRef = useRef(onSelectionChange)
  const onSaveRef = useRef(onSave)
  const onContextMenuSelectionRef = useRef(onContextMenuSelection)

  valueRef.current = value
  onChangeRef.current = onChange
  onSelectionChangeRef.current = onSelectionChange
  onSaveRef.current = onSave
  onContextMenuSelectionRef.current = onContextMenuSelection

  useEffect(() => {
    if (!hostRef.current) return
    const state = EditorState.create({
      doc: valueRef.current,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        history(),
        drawSelection(),
        highlightActiveLine(),
        markdown(),
        EditorState.tabSize.of(2),
        keymap.of([
          {
            key: 'Mod-s',
            preventDefault: true,
            run: () => {
              onSaveRef.current()
              return true
            },
          },
          indentWithTab,
          ...defaultKeymap,
          ...historyKeymap,
        ]),
        EditorView.lineWrapping,
        EditorView.theme({
          '&': {
            height: '100%',
            color: 'var(--text-primary)',
            backgroundColor: 'var(--bg-workbench)',
            fontSize: '13px',
          },
          '.cm-content': {
            padding: '20px 24px',
            fontFamily: "'SF Mono', 'Menlo', 'Monaco', 'Courier New', monospace",
            lineHeight: '1.65',
          },
          '.cm-gutters': {
            backgroundColor: 'var(--bg-workbench)',
            color: 'var(--text-secondary)',
            borderRight: '1px solid var(--border-subtle)',
          },
          '.cm-activeLine, .cm-activeLineGutter': {
            backgroundColor: 'var(--bg-hover)',
          },
          '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
            backgroundColor: 'rgba(0, 122, 204, 0.28)',
          },
        }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) onChangeRef.current(update.state.doc.toString())
          if (update.docChanged || update.selectionSet) {
            const selection = update.state.selection.main
            onSelectionChangeRef.current(
              sourceRangeFromOffsets(update.state.doc.toString(), selection.anchor, selection.head),
            )
          }
        }),
        EditorView.domEventHandlers({
          contextmenu(event, view) {
            const selection = view.state.selection.main
            const range = sourceRangeFromOffsets(
              view.state.doc.toString(),
              selection.anchor,
              selection.head,
            )
            if (!range || !onContextMenuSelectionRef.current) return false
            event.preventDefault()
            onContextMenuSelectionRef.current(range, { x: event.clientX, y: event.clientY })
            return true
          },
        }),
      ],
    })
    const view = new EditorView({ state, parent: hostRef.current })
    viewRef.current = view
    return () => {
      view.destroy()
      viewRef.current = null
    }
  }, [])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const current = view.state.doc.toString()
    if (current === value) return
    view.dispatch({
      changes: { from: 0, to: current.length, insert: value },
    })
  }, [value])

  return <div ref={hostRef} className="markdown-source-editor" />
}
