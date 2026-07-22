import { describe, expect, it } from 'vitest'
import { resolveCompatibleClaudeSessionId } from './agent-bridge'

const FINGERPRINT_A = 'a'.repeat(64)
const FINGERPRINT_B = 'b'.repeat(64)

describe('resolveCompatibleClaudeSessionId', () => {
  it('restores a session only when its compatibility fingerprint matches', () => {
    expect(resolveCompatibleClaudeSessionId(' session-1 ', FINGERPRINT_A, FINGERPRINT_A)).toBe(
      'session-1',
    )
  })

  it('rejects a session created by a different runtime configuration', () => {
    expect(resolveCompatibleClaudeSessionId('session-1', FINGERPRINT_A, FINGERPRINT_B)).toBeNull()
  })

  it('rejects legacy sessions without provenance', () => {
    expect(resolveCompatibleClaudeSessionId('session-1', undefined, FINGERPRINT_A)).toBeNull()
  })
})
