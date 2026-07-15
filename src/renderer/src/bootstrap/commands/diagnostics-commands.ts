import { useToastStore } from '../../components/common/Toast'
import type { Command } from '../../stores/command-store'
import { formatWorkspaceDiagnosticsMarkdown } from '../../utils/workspace-diagnostics'

async function copyWorkspaceDiagnostics(): Promise<void> {
  const showToast = useToastStore.getState().show
  try {
    const diagnostics = await window.cclinkStudio.workspaceState.diagnostics()
    const text = formatWorkspaceDiagnosticsMarkdown(diagnostics)
    await navigator.clipboard.writeText(text)
    showToast(`工作台状态诊断已复制 · ${diagnostics.workspaceCount} 个工作空间`, 'success')
  } catch (error) {
    showToast(`复制工作台状态诊断失败: ${error instanceof Error ? error.message : String(error)}`, 'error')
  }
}

export function createDiagnosticsCommands(): Command[] {
  return [
    {
      id: 'diagnostics.copyWorkspaceState',
      label: '开发者：复制工作台状态诊断',
      category: '开发者',
      action: () => {
        void copyWorkspaceDiagnostics()
      },
    },
  ]
}
