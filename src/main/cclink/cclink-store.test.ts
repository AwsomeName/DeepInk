import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CclinkStore } from './cclink-store'

const electronMock = vi.hoisted(() => ({
  userData: '',
}))

vi.mock('electron', () => ({
  app: {
    getPath: () => electronMock.userData,
  },
}))

describe('CclinkStore conversation messages', () => {
  beforeEach(async () => {
    electronMock.userData = await mkdtemp(join(tmpdir(), 'deepink-cclink-store-'))
  })

  afterEach(async () => {
    if (electronMock.userData) {
      await rm(electronMock.userData, { recursive: true, force: true })
    }
  })

  it('returns structured error when sending to a missing remote session', async () => {
    const store = new CclinkStore()

    const result = await store.sendLocalMessage('missing-session', 'hello')

    expect(result.success).toBe(false)
    expect(result.remoteError).toMatchObject({
      layer: 'execution-backend',
      code: 'REMOTE_SESSION_NOT_FOUND',
      retryable: true,
      context: { sessionId: 'missing-session' },
    })
  })
})
