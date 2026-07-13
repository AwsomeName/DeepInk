import { create } from 'zustand'
import type { TerminalCommandConfirmationRequest } from '../types'

interface TerminalState {
  pendingConfirmations: TerminalCommandConfirmationRequest[]
  addPendingConfirmation: (request: TerminalCommandConfirmationRequest) => void
  removePendingConfirmation: (id: string) => void
  clearPendingConfirmations: () => void
}

export const useTerminalStore = create<TerminalState>((set) => ({
  pendingConfirmations: [],

  addPendingConfirmation: (request) =>
    set((state) => {
      const existing = state.pendingConfirmations.find((item) => item.id === request.id)
      if (existing) {
        return {
          pendingConfirmations: state.pendingConfirmations.map((item) =>
            item.id === request.id ? request : item,
          ),
        }
      }
      return {
        pendingConfirmations: [...state.pendingConfirmations, request],
      }
    }),

  removePendingConfirmation: (id) =>
    set((state) => ({
      pendingConfirmations: state.pendingConfirmations.filter((request) => request.id !== id),
    })),

  clearPendingConfirmations: () => set({ pendingConfirmations: [] }),
}))
