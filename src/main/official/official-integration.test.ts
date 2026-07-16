import { describe, expect, it } from 'vitest'
import {
  createNoopOfficialIntegration,
  NOOP_OFFICIAL_INTEGRATION_STATUS,
  NoopOfficialIntegration,
} from './official-integration'
import { loadOfficialIntegration } from './official-integration-loader'

describe('NoopOfficialIntegration', () => {
  it('reports an inert OSS integration status', () => {
    const integration = new NoopOfficialIntegration()

    expect(integration.getStatus()).toEqual(NOOP_OFFICIAL_INTEGRATION_STATUS)
    expect(integration.getStatus()).toMatchObject({
      id: 'oss-noop',
      buildProfile: 'oss',
      available: false,
      reason: 'official-integration-not-installed',
    })
    expect(Object.values(integration.getStatus().features)).toEqual([
      false,
      false,
      false,
      false,
      false,
      false,
      false,
    ])
  })

  it('factory returns the no-op official integration', () => {
    expect(createNoopOfficialIntegration().getStatus()).toEqual(NOOP_OFFICIAL_INTEGRATION_STATUS)
  })

  it('default loader returns the OSS no-op integration', async () => {
    await expect(loadOfficialIntegration()).resolves.toMatchObject({
      id: 'oss-noop',
      buildProfile: 'oss',
    })
  })
})
