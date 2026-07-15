import type { WorkspaceStateDiagnostics } from '@shared/ipc/workspace-state'

export function summarizeDiagnosticList(values: string[], empty = '无'): string {
  return values.length > 0 ? values.join(', ') : empty
}

export function formatWorkspaceDiagnosticsMarkdown(
  diagnostics: WorkspaceStateDiagnostics,
): string {
  const lines = [
    '# CCLink Studio 工作台诊断',
    '',
    '## 状态文件',
    `- userData：${diagnostics.userDataPath}`,
    `- workspace-state：${diagnostics.stateFilePath}`,
    `- backup：${diagnostics.backupFilePath}`,
    `- workspaceCount：${diagnostics.workspaceCount}`,
    `- fileVersion：${diagnostics.fileVersion}`,
    '',
    '## userData',
  ]
  if (!diagnostics.userData) {
    lines.push('- 无 userData 诊断记录')
    return lines.join('\n')
  }
  lines.push(`- fixedUserDataPath：${diagnostics.userData.fixedUserDataPath}`)
  return lines.join('\n').trimEnd()
}
