import { afterEach, describe, expect, it, vi } from 'vitest'
import { SubscriptionService } from './subscription-service'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('SubscriptionService', () => {
  it('does not call a private endpoint when DEEPINK_API_URL is not configured', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const service = new SubscriptionService('')

    await expect(service.getPlans()).rejects.toThrow('DEEPINK_API_URL')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
