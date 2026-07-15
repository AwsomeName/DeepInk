import { describe, expect, it } from 'vitest'
import { buildRemoteDiagnosticReport } from './remote-diagnostics'
import { emptyRemoteCapabilities } from '../../shared/remote-protocol'
import { remoteWorkspaceRef } from '../../shared/workspace-ref'

const ref = remoteWorkspaceRef({
  endpointId: 'server-1',
  workspaceId: 'workspace-1',
  path: '/workspace',
})

describe('buildRemoteDiagnosticReport', () => {
  it('reports entitlement failures and unavailable capabilities separately', () => {
    const capabilities = emptyRemoteCapabilities()
    capabilities.file.read = true
    const report = buildRemoteDiagnosticReport({
      ref,
      generatedAt: 1000,
      status: {
        ref,
        transport: 'cclink',
        state: 'online',
        protocolVersion: '2',
        compatibility: {
          minSupported: '2',
          currentExpected: '2',
          agentReported: '2',
          status: 'compatible',
          message: '远端协议版本兼容。',
        },
        workspacePath: '/workspace',
        capabilities,
      },
      gates: {
        workspace: { allowed: true },
        terminal: { allowed: false, reason: '请升级' },
        agentSession: { allowed: false, reason: '请升级' },
        fileWrite: { allowed: true },
      },
    })

    expect(report.generatedAt).toBe(1000)
    expect(report.traceId).toBe('remote-diagnostic')
    expect(report.recentErrors).toEqual([])
    expect(report.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'entitlement.remote_terminal', status: 'fail', message: '请升级' }),
        expect.objectContaining({ id: 'protocol.compatibility', status: 'pass' }),
        expect.objectContaining({ id: 'capability.file_read', status: 'pass' }),
        expect.objectContaining({ id: 'capability.file_write', status: 'warn' }),
      ]),
    )
  })

  it('includes trace id and recent errors when provided', () => {
    const capabilities = emptyRemoteCapabilities()
    const report = buildRemoteDiagnosticReport({
      ref,
      traceId: 'trace-1',
      generatedAt: 1000,
      recentErrors: [
        {
          id: 'event-1',
          traceId: 'trace-0',
          timestamp: 900,
          operation: 'remote:readFile',
          ref,
          message: '读取失败',
        },
      ],
      status: {
        ref,
        transport: 'cclink',
        state: 'offline',
        compatibility: {
          minSupported: '2',
          currentExpected: '2',
          status: 'unknown',
          message: '远端 agent 未上报协议版本；仅允许安全降级能力。',
        },
        workspacePath: '/workspace',
        capabilities,
      },
      gates: {
        workspace: { allowed: true },
        terminal: { allowed: true },
        agentSession: { allowed: true },
        fileWrite: { allowed: true },
      },
    })

    expect(report.traceId).toBe('trace-1')
    expect(report.recentErrors).toHaveLength(1)
    expect(report.recentErrors[0]).toMatchObject({
      operation: 'remote:readFile',
      traceId: 'trace-0',
    })
    expect(report.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'protocol.compatibility', status: 'warn' }),
      ]),
    )
  })
})
