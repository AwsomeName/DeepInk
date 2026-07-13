import type { Command } from '../../stores/command-store'

export function createWindowCommands(): Command[] {
  return [
    { id: 'window.reload', label: '重新加载窗口', shortcut: '⌘ R', category: '窗口', action: () => window.deepink.window.reload() },
    { id: 'window.toggleDevtools', label: '切换开发者工具', category: '窗口', action: () => window.deepink.window.toggleDevtools() },
  ]
}
