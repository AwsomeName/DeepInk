import { describe, expect, it } from 'vitest'
import { browserProfilePartition, normalizeBrowserProfileId } from './browser-profile'

describe('browser profile identity', () => {
  it('maps the default and named profiles to stable Electron partitions', () => {
    expect(browserProfilePartition(null)).toBe('default')
    expect(browserProfilePartition('operations.eu-west')).toBe(
      'persist:cclink-studio-profile-operations.eu-west',
    )
  })

  it.each(['', ' profile', 'profile/name', 'x'.repeat(65)])(
    'rejects an invalid profile instead of falling back to the default session: %s',
    (profileId) => {
      expect(() => normalizeBrowserProfileId(profileId)).toThrow('Browser Profile ID 格式无效')
      expect(() => browserProfilePartition(profileId)).toThrow('Browser Profile ID 格式无效')
    },
  )
})
