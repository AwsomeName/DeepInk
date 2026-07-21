export function shouldDestroyBrowserViewDuringReconcile(options: {
  tabId: string
  viewWorkspaceKey: string | null
  viewProfileId: string | null
  activeWorkspaceKey: string | null
  expectedProfileByTabId: Map<string, string | null>
}): boolean {
  if (options.viewWorkspaceKey !== options.activeWorkspaceKey) return false
  if (!options.expectedProfileByTabId.has(options.tabId)) return true
  return options.expectedProfileByTabId.get(options.tabId) !== options.viewProfileId
}

export function shouldRecreateBrowserViewForBinding(options: {
  currentWorkspaceKey: string | null
  currentProfileId: string | null
  requestedWorkspaceKey: string | null
  requestedProfileId: string | null
}): boolean {
  return (
    options.currentWorkspaceKey !== options.requestedWorkspaceKey ||
    options.currentProfileId !== options.requestedProfileId
  )
}
