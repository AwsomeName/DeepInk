import { useEffect } from 'react'
import { useTerminalStore } from '../stores/terminal-store'
import type { TerminalCommandConfirmationRequest } from '../types'

export function useTerminalEvents(): void {
  useEffect(() => {
    const offConfirmation = window.deepink.terminal.onRequestCommandConfirmation(
      (request: TerminalCommandConfirmationRequest) => {
        useTerminalStore.getState().addPendingConfirmation(request)
      },
    )

    return () => {
      offConfirmation()
    }
  }, [])
}
