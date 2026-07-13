import type { Command } from '../../stores/command-store'
import { useBrowserStore } from '../../stores/browser-store'
import { useTabStore } from '../../stores/tab-store'

export function createBrowserCommands(): Command[] {
  return [
    { id: 'browser.navigate', label: '聚焦地址栏', shortcut: '⌘ L', category: '浏览器', action: () => { const input = document.querySelector('.url-input') as HTMLInputElement | null; input?.focus(); input?.select() } },
    { id: 'browser.zoomIn', label: '放大浏览器', shortcut: '⌘ =', category: '浏览器', action: () => { const tab = useTabStore.getState().getActiveTab(); if (tab?.type === 'browser') window.deepink.browser.zoomIn(tab.id) } },
    { id: 'browser.zoomOut', label: '缩小浏览器', shortcut: '⌘ -', category: '浏览器', action: () => { const tab = useTabStore.getState().getActiveTab(); if (tab?.type === 'browser') window.deepink.browser.zoomOut(tab.id) } },
    {
      id: 'browser.toggleDeviceMode',
      label: '切换设备模式（桌面/移动）',
      category: '浏览器',
      action: () => {
        const tab = useTabStore.getState().getActiveTab()
        if (tab?.type !== 'browser') return
        const viewMode = useBrowserStore.getState().tabs[tab.id]?.viewMode
        if (viewMode) window.deepink.browser.setDeviceMode(tab.id, viewMode === 'desktop' ? 'mobile' : 'desktop')
      },
    },
  ]
}
