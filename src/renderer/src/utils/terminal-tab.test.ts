import { describe, expect, it } from 'vitest'
import { buildTerminalTabDraft } from './terminal-tab'

describe('buildTerminalTabDraft', () => {
  it('为本地工作空间创建本地 Terminal 占位 Tab', () => {
    const draft = buildTerminalTabDraft({ kind: 'local', path: '/Users/apple/project' })

    expect(draft.type).toBe('terminal')
    expect(draft.forceNew).toBe(true)
    expect(draft.title).toBe('Terminal · project')
    expect(draft.terminal.runtime).toMatchObject({
      location: 'local',
      transport: 'local',
      backend: 'local-shell',
      cwd: '/Users/apple/project',
    })
    expect(draft.terminal.permissionPolicy.mode).toBe('ask-risky-command')
    expect(draft.terminal.permissionPolicy.requireConfirmationFor).toContain('destructive')
    expect(draft.terminal.status).toBe('idle')
    expect(draft.terminal.closePolicy).toBe('terminate-process')
    expect(draft.terminal.sessionId).toMatch(/^terminal-session-/)
    expect(draft.terminal.auditLogId).toMatch(/^terminal-audit-/)
  })

  it('为远程工作空间创建更保守的远程 Terminal 占位 Tab', () => {
    const draft = buildTerminalTabDraft({
      kind: 'remote',
      transport: 'cclink',
      endpointId: 'agent-1',
      endpointName: 'Mac mini',
      workspaceId: 'agent-1:/data/app',
      path: '/data/app',
      label: 'app',
    })

    expect(draft.title).toBe('Terminal · app')
    expect(draft.terminal.runtime).toMatchObject({
      location: 'remote',
      transport: 'cclink',
      backend: 'remote-shell',
      cwd: '/data/app',
      endpointId: 'agent-1',
    })
    expect(draft.terminal.permissionPolicy.mode).toBe('ask-every-command')
    expect(draft.terminal.permissionPolicy.requireConfirmationFor).toEqual([
      'read',
      'write',
      'network',
      'destructive',
      'privileged',
      'unknown',
    ])
  })

  it('未归档工作空间不设置 cwd 且采用每条命令确认', () => {
    const draft = buildTerminalTabDraft({ kind: 'global' })

    expect(draft.title).toBe('Terminal · 未归档')
    expect(draft.terminal.runtime.cwd).toBeUndefined()
    expect(draft.terminal.runtime.location).toBe('local')
    expect(draft.terminal.permissionPolicy.mode).toBe('ask-every-command')
  })
})
