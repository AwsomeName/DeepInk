import { useEffect } from 'react'
import { useTabStore } from '../stores/tab-store'
import { useUIStore, type WorkContext } from '../stores/ui-store'
import type { Tab } from '../types'

function workContextFromTab(tab: Tab | undefined): WorkContext {
  if (!tab) return 'empty'
  if (tab.type === 'browser' || tab.type === 'editor' || tab.type === 'android' || tab.type === 'preview' || tab.type === 'settings') {
    return tab.type
  }
  if (tab.type === 'data-source-query' || tab.type === 'data-source-result') return 'data-source'
  return 'preview'
}

/** 根据当前工作区 Tab 自动切换 Agent 面板位置。 */
export function useAgentWorkContext(): void {
  const applySystemWorkContext = useUIStore((s) => s.applySystemWorkContext)
  const tabs = useTabStore((s) => s.tabs)
  const activeTabId = useTabStore((s) => s.activeTabId)
  const activeTab = tabs.find((tab) => tab.id === activeTabId)

  useEffect(() => {
    applySystemWorkContext(workContextFromTab(activeTab))
  }, [activeTab, applySystemWorkContext])
}
