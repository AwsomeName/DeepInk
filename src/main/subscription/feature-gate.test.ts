import { describe, expect, it } from 'vitest'
import { hasEntitlement } from './feature-gate'
import type { UserSubscription } from '../../shared/ipc/subscription'

function subscription(input: Partial<UserSubscription>): UserSubscription {
  return {
    tier: 'free',
    status: 'inactive',
    plan: null,
    periodStart: null,
    periodEnd: null,
    ...input,
  }
}

describe('hasEntitlement', () => {
  it('keeps Pro subscriptions compatible when backend has not shipped explicit entitlements', () => {
    expect(hasEntitlement(subscription({ tier: 'pro', status: 'active' }), 'remote_workspace')).toBe(true)
    expect(hasEntitlement(subscription({ tier: 'pro', status: 'active' }), 'remote_agent_session')).toBe(true)
  })

  it('lets explicit entitlement grants override tier compatibility', () => {
    const sub = subscription({
      tier: 'pro',
      status: 'active',
      entitlements: [{ code: 'remote_terminal', enabled: false }],
    })

    expect(hasEntitlement(sub, 'remote_terminal')).toBe(false)
  })

  it('does not grant remote entitlements to inactive free subscriptions', () => {
    expect(hasEntitlement(subscription({}), 'remote_workspace')).toBe(false)
  })
})
