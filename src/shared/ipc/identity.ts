export interface LocalIdentity {
  localId: string
  deviceId: string
  deviceName: string
  createdAt: number
  updatedAt: number
  boundCloudUserId?: string | null
}

export interface IdentityApiContract {
  getLocalIdentity: () => Promise<LocalIdentity>
}

export const identityIpc = {
  getLocalIdentity: defineNoArgsIpc<LocalIdentity>('identity:getLocalIdentity'),
} as const
import { defineNoArgsIpc } from './contract'
