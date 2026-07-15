import { create } from 'zustand'
import type { WorkspaceRef } from '../../../shared/workspace-ref'
import {
  globalWorkspaceRef,
  localWorkspaceRef,
  workspaceRefKey,
  workspaceRefLabel,
  workspaceRefSourceLabel,
} from '../../../shared/workspace-ref'
import {
  getWorkspaceStateKey,
  getWorkspaceStateOwnerKey,
  setWorkspaceStateRef,
} from '../utils/workspace-state'
import { hydrateRuntimeSections, persistRuntimeSections } from '../utils/workspace-runtime'

interface WorkspaceState {
  activeWorkspaceRef: WorkspaceRef
  activating: boolean
  error: string | null
  activateLocalWorkspace: (path: string) => void
  activateGlobalWorkspace: () => void
  switchToGlobalWorkspace: () => Promise<void>
  activateRemoteWorkspace: (ref: Extract<WorkspaceRef, { kind: 'remote' }>) => Promise<void>
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  activeWorkspaceRef: globalWorkspaceRef(),
  activating: false,
  error: null,

  activateLocalWorkspace: (path) => {
    const ref = localWorkspaceRef(path)
    setWorkspaceStateRef(ref)
    set({ activeWorkspaceRef: ref, activating: false, error: null })
  },

  activateGlobalWorkspace: () => {
    const ref = globalWorkspaceRef()
    setWorkspaceStateRef(ref)
    set({ activeWorkspaceRef: ref, activating: false, error: null })
  },

  switchToGlobalWorkspace: async () => {
    const currentKey = getWorkspaceStateKey()
    persistRuntimeSections(currentKey)
    set({ activating: true, error: null })

    try {
      const ref = globalWorkspaceRef()
      const snapshot = await window.deepink.workspaceState
        .get(null, getWorkspaceStateOwnerKey())
        .catch(() => null)
      setWorkspaceStateRef(ref)
      hydrateRuntimeSections(snapshot)
      set({ activeWorkspaceRef: ref, activating: false, error: null })
    } catch (error) {
      set({ activating: false, error: describeError(error) })
    }
  },

  activateRemoteWorkspace: async (ref) => {
    const nextKey = workspaceRefKey(ref)
    const currentKey = getWorkspaceStateKey()
    if (nextKey === currentKey) {
      set({ activeWorkspaceRef: ref, activating: false, error: null })
      return
    }

    persistRuntimeSections(currentKey)
    set({ activating: true, error: null })

    try {
      const snapshot = await window.deepink.workspaceState
        .get(nextKey, getWorkspaceStateOwnerKey())
        .catch(() => null)
      setWorkspaceStateRef(ref)
      hydrateRuntimeSections(snapshot)
      set({ activeWorkspaceRef: ref, activating: false, error: null })
    } catch (error) {
      set({ activating: false, error: describeError(error) })
    }
  },
}))

export function getWorkspaceDisplayTitle(ref: WorkspaceRef): string {
  return workspaceRefLabel(ref)
}

export function getWorkspaceDisplayMeta(ref: WorkspaceRef): string {
  return workspaceRefSourceLabel(ref)
}
