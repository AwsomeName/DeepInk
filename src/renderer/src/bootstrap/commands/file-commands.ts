import type { Command } from '../../stores/command-store'
import { useTabStore } from '../../stores/tab-store'

export function createFileCommands(): Command[] {
  return [
    { id: 'file.newFile', label: '新建文件', category: '文件', action: () => useTabStore.getState().openTab({ type: 'editor', title: '未命名.md', icon: '📄' }) },
  ]
}
