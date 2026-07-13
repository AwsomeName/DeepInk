import type { Command } from '../../stores/command-store'
import { useFsStore } from '../../stores/fs-store'
import { useSyncStore } from '../../stores/sync-store'
import { useTabStore } from '../../stores/tab-store'

function openSyncSettings(): void {
  useTabStore
    .getState()
    .openTab({ type: 'settings', title: '同步', icon: '⚙️', settingsSection: 'sync' })
}

export function createSyncCommands(): Command[] {
  return [
    {
      id: 'sync.trigger',
      label: '同步：立即同步',
      category: '同步',
      action: () => {
        const { config, triggerSync } = useSyncStore.getState()
        if (!config) {
          openSyncSettings()
          return
        }
        const { workspacePath } = useFsStore.getState()
        if (workspacePath) triggerSync(workspacePath)
      },
    },
    {
      id: 'sync.openSettings',
      label: '同步：打开同步设置',
      category: '同步',
      action: openSyncSettings,
    },
  ]
}
