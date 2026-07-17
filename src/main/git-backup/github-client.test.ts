import { describe, expect, it, vi } from 'vitest'
import { GitHubClient } from './github-client'

function response(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  }
}

describe('GitHubClient', () => {
  it('creates repository names as private repositories', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(404, { message: 'Not Found' }))
      .mockResolvedValueOnce(
        response(201, {
          name: 'project',
          full_name: 'user/project',
          clone_url: 'https://github.com/user/project.git',
          private: true,
        }),
      )
    const client = new GitHubClient('token', fetchMock)

    expect(await client.getOrCreatePrivateRepository('user', 'project')).toMatchObject({
      fullName: 'user/project',
      private: true,
    })
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({
      name: 'project',
      private: true,
      auto_init: false,
    })
  })

  it('refuses an existing public repository in project-name mode', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      response(200, {
        name: 'project',
        full_name: 'user/project',
        clone_url: 'https://github.com/user/project.git',
        private: false,
        permissions: { push: true },
      }),
    )
    const client = new GitHubClient('token', fetchMock)

    await expect(client.getOrCreatePrivateRepository('user', 'project')).rejects.toMatchObject({
      code: 'REMOTE_CONFLICT',
    })
  })
})
