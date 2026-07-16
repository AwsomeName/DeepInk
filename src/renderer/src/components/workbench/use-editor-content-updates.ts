import { useEffect } from 'react'
import { useEditorStore } from '../../stores/editor-store'
import { useTabStore } from '../../stores/tab-store'

/** 接收 Agent 推送的编辑器内容更新，必要时自动创建编辑器 Tab。 */
export function useEditorContentUpdates(): void {
  useEffect(() => {
    const unsub = window.cclinkStudio.editor.onContentUpdate((update) => {
      const targetPath = update.filePath
      const hasMatchingTab = useTabStore
        .getState()
        .tabs.some(
          (tab) => tab.type === 'editor' && (targetPath ? tab.filePath === targetPath : true),
        )

      if (!hasMatchingTab) {
        const title =
          update.title ??
          (targetPath ? (targetPath.split('/').pop() ?? 'Untitled.md') : 'Untitled.md')
        useTabStore.getState().openTab({
          type: 'editor',
          title,
          icon: '📄',
          filePath: targetPath,
        })
      }

      useEditorStore.getState().applyAgentUpdate(update)
    })
    return () => unsub()
  }, [])
}
