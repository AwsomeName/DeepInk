export type OfficialBuildProfile = 'oss' | 'dev' | 'internal' | 'beta' | 'stable'

export interface OfficialIntegrationFeatures {
  account: boolean
  deviceRegistry: boolean
  messageNetwork: boolean
  entitlement: boolean
  quota: boolean
  officialRuntime: boolean
  releaseProvider: boolean
}

export interface OfficialIntegrationStatus {
  id: string
  buildProfile: OfficialBuildProfile
  available: boolean
  reason?: string
  features: OfficialIntegrationFeatures
}

export interface OfficialApiContract {
  getStatus: () => Promise<OfficialIntegrationStatus>
}
