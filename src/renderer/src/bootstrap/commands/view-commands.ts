import type { Command } from '../../stores/command-store'
import { useThemeStore } from '../../stores/theme-store'

interface ViewCommandDeps {
  toggleSidebar: () => void
  toggleAgentPanel: () => void
  focusAgentPanel: () => void
  resetAgentLayout: () => void
}

export function createViewCommands(deps: ViewCommandDeps): Command[] {
  return [
    {
      id: 'workbench.toggleSidebar',
      label: '切换侧栏',
      shortcut: '⌘ B',
      category: '视图',
      action: deps.toggleSidebar,
    },
    {
      id: 'workbench.toggleAgentPanel',
      label: '切换 Agent 面板',
      shortcut: '⌘ J',
      category: '视图',
      action: deps.toggleAgentPanel,
    },
    {
      id: 'workbench.focusAgentPanel',
      label: '专注 Agent 对话',
      shortcut: '⌘ ⇧ J',
      category: '视图',
      action: deps.focusAgentPanel,
    },
    {
      id: 'workbench.resetAgentLayout',
      label: '重置 Agent 布局',
      category: '视图',
      action: deps.resetAgentLayout,
    },
    {
      id: 'view.zoomIn',
      label: '放大界面',
      category: '视图',
      action: () => {
        document.body.style.zoom = String(parseFloat(document.body.style.zoom || '1') * 1.1)
      },
    },
    {
      id: 'view.zoomOut',
      label: '缩小界面',
      category: '视图',
      action: () => {
        document.body.style.zoom = String(parseFloat(document.body.style.zoom || '1') / 1.1)
      },
    },
    {
      id: 'view.zoomReset',
      label: '重置界面缩放',
      category: '视图',
      action: () => {
        document.body.style.zoom = '1'
      },
    },
    {
      id: 'view.toggleFullscreen',
      label: '切换全屏',
      category: '视图',
      action: () => window.cclinkStudio.window.toggleFullscreen(),
    },
    {
      id: 'theme.switchTheme',
      label: '切换主题（深色/浅色）',
      category: '主题',
      action: () => {
        const cur = document.documentElement.getAttribute('data-theme') || 'dark'
        const next = cur === 'dark' ? 'light' : 'dark'
        document.documentElement.setAttribute('data-theme', next)
        useThemeStore.getState().setTheme(next)
      },
    },
  ]
}
