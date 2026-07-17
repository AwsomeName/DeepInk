import { GitBackupError } from './git-backup-error'
import { normalizeGitHubUsername } from './git-backup-validation'

interface GitHubUserResponse {
  login?: string
}

interface GitHubRepositoryResponse {
  name?: string
  full_name?: string
  clone_url?: string
  private?: boolean
  permissions?: { push?: boolean }
}

interface GitHubResponse<T> {
  ok: boolean
  status: number
  json(): Promise<T>
  text(): Promise<string>
}

type FetchLike = (
  input: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
) => Promise<GitHubResponse<unknown>>

export interface GitHubRepository {
  name: string
  fullName: string
  cloneUrl: string
  private: boolean
}

export class GitHubClient {
  constructor(
    private readonly token: string,
    private readonly fetchImpl: FetchLike = fetch as FetchLike,
    private readonly apiBaseUrl = 'https://api.github.com',
  ) {}

  async getAuthenticatedLogin(): Promise<string> {
    const response = await this.request<GitHubUserResponse>('/user')
    if (!response.login) throw new GitBackupError('AUTHENTICATION_FAILED', 'GitHub 未返回账号信息')
    return response.login
  }

  async verifyAccount(expectedUsername: string): Promise<string> {
    const username = normalizeGitHubUsername(expectedUsername)
    const login = await this.getAuthenticatedLogin()
    if (login.toLowerCase() !== username.toLowerCase()) {
      throw new GitBackupError(
        'AUTHENTICATION_FAILED',
        `Token 属于 GitHub 账号 ${login}，与填写的 ${username} 不一致`,
      )
    }
    return login
  }

  async getOrCreatePrivateRepository(
    username: string,
    repositoryName: string,
  ): Promise<GitHubRepository> {
    const owner = normalizeGitHubUsername(username)
    const existing = await this.requestOptional<GitHubRepositoryResponse>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repositoryName)}`,
    )
    if (existing) {
      if (existing.private !== true) {
        throw new GitBackupError(
          'REMOTE_CONFLICT',
          '同名 GitHub 仓库不是私有仓库，请填写其他项目名或完整仓库地址',
        )
      }
      if (
        existing.permissions?.push !== true ||
        !existing.clone_url ||
        !existing.full_name ||
        !existing.name
      ) {
        throw new GitBackupError(
          'AUTHENTICATION_FAILED',
          '同名 GitHub 仓库存在，但当前 Token 没有写入权限',
        )
      }
      return {
        name: existing.name,
        fullName: existing.full_name,
        cloneUrl: existing.clone_url,
        private: existing.private === true,
      }
    }

    const created = await this.request<GitHubRepositoryResponse>('/user/repos', {
      method: 'POST',
      body: JSON.stringify({ name: repositoryName, private: true, auto_init: false }),
    })
    if (!created.clone_url || !created.full_name || !created.name) {
      throw new GitBackupError('NETWORK_ERROR', 'GitHub 创建仓库成功，但返回信息不完整')
    }
    return {
      name: created.name,
      fullName: created.full_name,
      cloneUrl: created.clone_url,
      private: created.private === true,
    }
  }

  private async request<T>(
    path: string,
    options: { method?: string; body?: string } = {},
  ): Promise<T> {
    let response: GitHubResponse<unknown>
    try {
      response = await this.fetchImpl(`${this.apiBaseUrl}${path}`, {
        method: options.method ?? 'GET',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'CCLink-Studio',
        },
        body: options.body,
      })
    } catch (error: unknown) {
      throw new GitBackupError(
        'NETWORK_ERROR',
        '无法连接 GitHub，请检查网络后重试',
        undefined,
        error instanceof Error ? { cause: error } : undefined,
      )
    }
    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      if (response.status === 401 || response.status === 403) {
        throw new GitBackupError('AUTHENTICATION_FAILED', 'GitHub Token 无效或权限不足')
      }
      throw new GitBackupError('NETWORK_ERROR', `GitHub 请求失败（${response.status}）`, {
        detail: detail.slice(0, 1000),
      })
    }
    return (await response.json()) as T
  }

  private async requestOptional<T>(path: string): Promise<T | null> {
    try {
      return await this.request<T>(path)
    } catch (error: unknown) {
      if (
        error instanceof GitBackupError &&
        error.code === 'NETWORK_ERROR' &&
        error.message.includes('404')
      ) {
        return null
      }
      throw error
    }
  }
}
