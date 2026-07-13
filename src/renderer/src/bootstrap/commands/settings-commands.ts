import type { Command } from '../../stores/command-store'
import { useTabStore } from '../../stores/tab-store'

export function createSettingsCommands(): Command[] {
  const openSettings = (): void => {
    useTabStore.getState().openTab({ type: 'settings', title: '设置', icon: '⚙️' })
  }

  return [
    {
      id: 'settings.open',
      label: '打开设置',
      shortcut: '⌘ ,',
      category: '设置',
      action: openSettings,
    },
    {
      id: 'preferences.openKeybindings',
      label: '打开快捷键设置',
      category: '偏好',
      action: () =>
        useTabStore
          .getState()
          .openTab({ type: 'settings', title: '快捷键', icon: '⚙️', settingsSection: 'shortcuts' }),
    },
    {
      id: 'devices.openSettings',
      label: '设备：打开设备设置',
      category: '设备',
      action: () =>
        useTabStore
          .getState()
          .openTab({ type: 'settings', title: '设备', icon: '⚙️', settingsSection: 'devices' }),
    },
    {
      id: 'remoteConnections.openSettings',
      label: '远程连接：打开远程连接设置',
      category: '远程连接',
      action: () =>
        useTabStore.getState().openTab({
          type: 'settings',
          title: '远程连接',
          icon: '⚙️',
          settingsSection: 'remote-connections',
        }),
    },
  ]
}
