import type { WorkspaceStateSnapshot } from '@shared/ipc/workspace-state'
import type { WorkspaceRef } from '../../../shared/workspace-ref'
import { workspaceRefKey } from '../../../shared/workspace-ref'
import {
  getWorkspaceStateKey,
  getWorkspaceStateOwnerKey,
  setWorkspaceStateRef,
} from './workspace-state'
import { hydrateRuntimeSections, persistRuntimeSections } from './workspace-runtime'

export interface WorkspaceRuntimeTransition {
  ref: WorkspaceRef
  key: string | null
  snapshot: WorkspaceStateSnapshot | null
}

export async function prepareWorkspaceRuntimeTransition(
  ref: WorkspaceRef,
  options: { persistCurrent?: boolean } = {},
): Promise<WorkspaceRuntimeTransition> {
  const key = workspaceRefKey(ref)
  const currentKey = getWorkspaceStateKey()

  if (options.persistCurrent !== false && key !== currentKey) {
    persistRuntimeSections(currentKey)
  }

  const snapshot = await window.cclinkStudio.workspaceState
    .get(key, getWorkspaceStateOwnerKey())
    .catch(() => null)

  return { ref, key, snapshot }
}

export function applyWorkspaceRuntimeTransition(
  transition: WorkspaceRuntimeTransition,
  options: { hydrate?: boolean; flush?: boolean } = {},
): void {
  setWorkspaceStateRef(transition.ref)

  if (options.hydrate !== false) {
    hydrateRuntimeSections(transition.snapshot)
  }

  if (options.flush !== false) {
    persistRuntimeSections(transition.key)
  }
}
