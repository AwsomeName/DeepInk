import { afterEach, describe, expect, it, vi } from 'vitest'
import { useToastStore } from '../../components/common/Toast'
import { createDiagnosticsCommands } from './diagnostics-commands'
import { formatWorkspaceDiagnosticsMarkdown } from '../../utils/workspace-diagnostics'

describe('diagnostics commands', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    useToastStore.setState({ message: '', type: 'info', visible: false })
  })

  it('copies workspace state diagnostics to the clipboard', async () => {
    const diagnostics = {
      userDataPath: '/Users/me/Library/Application Support/DeepInk',
      stateFilePath: '/Users/me/Library/Application Support/DeepInk/workspace-state.json',
      backupFilePath: '/Users/me/Library/Application Support/DeepInk/workspace-state.json.bak',
      workspaceCount: 2,
      fileVersion: 1,
      migration: null,
    }
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    vi.stubGlobal('window', {
      deepink: {
        workspaceState: {
          diagnostics: vi.fn().mockResolvedValue(diagnostics),
        },
      },
    })

    createDiagnosticsCommands()[0]!.action()
    await vi.waitFor(() => expect(writeText).toHaveBeenCalled())

    expect(window.deepink.workspaceState.diagnostics).toHaveBeenCalled()
    expect(writeText).toHaveBeenCalledWith(formatWorkspaceDiagnosticsMarkdown(diagnostics))
    expect(useToastStore.getState().message).toContain('2 个工作空间')
    expect(useToastStore.getState().type).toBe('success')
  })
})
