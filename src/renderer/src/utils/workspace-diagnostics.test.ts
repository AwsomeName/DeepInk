import { describe, expect, it } from 'vitest'
import { formatWorkspaceDiagnosticsMarkdown } from './workspace-diagnostics'

describe('workspace diagnostics formatter', () => {
  it('formats userData diagnostics as pasteable markdown', () => {
    const markdown = formatWorkspaceDiagnosticsMarkdown({
      userDataPath: '/fixed/CCLink Studio',
      stateFilePath: '/fixed/CCLink Studio/workspace-state.json',
      backupFilePath: '/fixed/CCLink Studio/workspace-state.json.bak',
      workspaceCount: 3,
      fileVersion: 1,
      userData: {
        fixedUserDataPath: '/fixed/CCLink Studio',
      },
    })

    expect(markdown).toContain('# CCLink Studio 工作台诊断')
    expect(markdown).toContain('- workspaceCount：3')
    expect(markdown).toContain('- fixedUserDataPath：/fixed/CCLink Studio')
  })
})
