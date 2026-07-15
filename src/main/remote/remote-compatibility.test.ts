import { describe, expect, it } from 'vitest'
import { buildRemoteProtocolCompatibility } from '../../shared/remote-compatibility'

describe('buildRemoteProtocolCompatibility', () => {
  it('marks missing protocol versions as unknown', () => {
    expect(buildRemoteProtocolCompatibility()).toMatchObject({
      status: 'unknown',
      minSupported: '2',
      currentExpected: '2',
    })
  })

  it('requires upgrade when the agent protocol is too old', () => {
    expect(buildRemoteProtocolCompatibility('1')).toMatchObject({
      status: 'upgrade-required',
      agentReported: '1',
    })
  })

  it('accepts compatible protocol versions', () => {
    expect(buildRemoteProtocolCompatibility('2')).toMatchObject({
      status: 'compatible',
      agentReported: '2',
    })
    expect(buildRemoteProtocolCompatibility('3')).toMatchObject({
      status: 'compatible',
      agentReported: '3',
    })
  })
})
