import { create } from 'zustand'
import type { WorkspaceRef } from '../../../shared/workspace-ref'
import {
  globalWorkspaceRef,
  workspaceRefLabel,
  workspaceRefSourceLabel,
} from '../../../shared/workspace-ref'
import { setWorkspaceStateRef } from '../utils/workspace-state'

interface WorkspaceState {
  activeWorkspaceRef: WorkspaceRef
  commitActiveWorkspace: (ref: WorkspaceRef) => void
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  activeWorkspaceRef: globalWorkspaceRef(),

  commitActiveWorkspace: (ref) => {
    setWorkspaceStateRef(ref)
    set({ activeWorkspaceRef: ref })
  },
}))

export function getWorkspaceDisplayTitle(ref: WorkspaceRef): string {
  return workspaceRefLabel(ref)
}

export function getWorkspaceDisplayMeta(ref: WorkspaceRef): string {
  return workspaceRefSourceLabel(ref)
}
