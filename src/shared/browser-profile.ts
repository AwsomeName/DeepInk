export const BROWSER_PROFILE_ID_MAX_LENGTH = 64
export const BROWSER_PROFILE_ID_PATTERN = /^[A-Za-z0-9._-]+$/

export function normalizeBrowserProfileId(profileId?: string | null): string | null {
  if (profileId == null) return null
  if (
    profileId.length === 0 ||
    profileId.length > BROWSER_PROFILE_ID_MAX_LENGTH ||
    !BROWSER_PROFILE_ID_PATTERN.test(profileId)
  ) {
    throw new Error('Browser Profile ID 格式无效')
  }
  return profileId
}

export function browserProfilePartition(profileId: string | null): string {
  const normalizedProfileId = normalizeBrowserProfileId(profileId)
  return normalizedProfileId ? `persist:cclink-studio-profile-${normalizedProfileId}` : 'default'
}
