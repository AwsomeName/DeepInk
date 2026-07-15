import { describe, expect, it } from 'vitest'
import { RemoteDiagnosticLog } from './remote-diagnostic-log'
import { remoteWorkspaceRef } from '../../shared/workspace-ref'

const ref = remoteWorkspaceRef({
  endpointId: 'server-1',
  workspaceId: 'workspace-1',
  path: '/workspace',
})

const otherRef = remoteWorkspaceRef({
  endpointId: 'server-2',
  workspaceId: 'workspace-2',
  path: '/other',
})

describe('RemoteDiagnosticLog', () => {
  it('keeps recent events scoped to a remote workspace', () => {
    const log = new RemoteDiagnosticLog()
    log.record({
      traceId: 'trace-1',
      timestamp: 100,
      operation: 'remote:readFile',
      ref,
      message: '读取失败',
    })
    log.record({
      traceId: 'trace-2',
      timestamp: 200,
      operation: 'remote:readFile',
      ref: otherRef,
      message: '其它工作区失败',
    })
    log.record({
      traceId: 'trace-3',
      timestamp: 300,
      operation: 'remote:writeFile',
      ref,
      message: '写入失败',
    })

    expect(log.recentForRef(ref)).toMatchObject([
      { traceId: 'trace-3', operation: 'remote:writeFile' },
      { traceId: 'trace-1', operation: 'remote:readFile' },
    ])
  })

  it('trims old events when over capacity', () => {
    const log = new RemoteDiagnosticLog(2)
    log.record({ traceId: 'trace-1', operation: 'remote:a', ref, message: 'a' })
    log.record({ traceId: 'trace-2', operation: 'remote:b', ref, message: 'b' })
    log.record({ traceId: 'trace-3', operation: 'remote:c', ref, message: 'c' })

    expect(log.recentForRef(ref)).toMatchObject([
      { traceId: 'trace-3' },
      { traceId: 'trace-2' },
    ])
  })
})
