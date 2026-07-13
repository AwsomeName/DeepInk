import { describe, expect, it } from 'vitest'
import type { TerminalRuntimeRef } from '../../../shared/terminal'
import {
  formatTerminalExpiresIn,
  formatTerminalRuntime,
  TERMINAL_ACTOR_LABEL,
  TERMINAL_RISK_LABEL,
} from './terminal-confirmation'

describe('terminal-confirmation utils', () => {
  it('formats risk and actor labels', () => {
    expect(TERMINAL_RISK_LABEL.privileged).toBe('提权')
    expect(TERMINAL_RISK_LABEL.unknown).toBe('未知')
    expect(TERMINAL_ACTOR_LABEL.agent).toBe('Agent')
  })

  it('formats local terminal runtime', () => {
    const runtime: TerminalRuntimeRef = {
      location: 'local',
      transport: 'local',
      backend: 'local-shell',
      workspaceRef: {
        kind: 'local',
        path: '/Users/apple/Desktop/DeepInk',
      },
    }

    expect(formatTerminalRuntime(runtime)).toBe('本地 · DeepInk · local-shell')
  })

  it('formats remaining confirmation time', () => {
    expect(formatTerminalExpiresIn({ expiresAt: 65_100 }, 60_000)).toBe('6 秒')
    expect(formatTerminalExpiresIn({ expiresAt: 60_000 }, 65_000)).toBe('已超时')
  })
})
