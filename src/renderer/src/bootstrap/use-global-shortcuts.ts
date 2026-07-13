import { useEffect } from 'react'
import { useCommandStore, useTabStore } from '../stores'
import { useUIStore } from '../stores/ui-store'

/** 注册窗口级快捷键。 */
export function useGlobalShortcuts(): void {
  const togglePalette = useCommandStore((s) => s.togglePalette)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      const cmd = e.metaKey || e.ctrlKey
      const shift = e.shiftKey

      if (cmd && shift && e.key === 'p') {
        e.preventDefault()
        togglePalette()
        return
      }
      if (cmd && !shift && e.key === 'b') {
        e.preventDefault()
        useUIStore.getState().toggleSidebar()
        return
      }
      if (cmd && !shift && e.key === 'j') {
        e.preventDefault()
        useUIStore.getState().toggleAgentPanel()
        return
      }
      if (cmd && shift && e.key === 'j') {
        e.preventDefault()
        useUIStore.getState().setAgentPanelMode('center', 'user')
        return
      }
      if (cmd && !shift && e.key === ',') {
        e.preventDefault()
        useTabStore.getState().openTab({ type: 'settings', title: '设置', icon: '⚙️' })
        return
      }
      if (cmd && !shift && e.key.toLowerCase() === 'r') {
        e.preventDefault()
        window.deepink.window.reload()
        return
      }
      if (cmd && !shift && e.key === 'w') {
        e.preventDefault()
        const { activeTabId, closeTab } = useTabStore.getState()
        if (activeTabId) closeTab(activeTabId)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [togglePalette])
}
