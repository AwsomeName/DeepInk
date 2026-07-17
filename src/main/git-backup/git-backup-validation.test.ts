import { describe, expect, it } from 'vitest'
import {
  findSensitiveFiles,
  normalizeGitHubUsername,
  parseRepositoryInput,
} from './git-backup-validation'

describe('git backup input validation', () => {
  it('distinguishes repository names from HTTPS and SSH remotes', () => {
    expect(parseRepositoryInput('my-project')).toEqual({
      kind: 'github-name',
      name: 'my-project',
    })
    expect(parseRepositoryInput('https://github.com/user/repo.git')).toMatchObject({
      kind: 'remote-url',
      url: 'https://github.com/user/repo.git',
    })
    expect(parseRepositoryInput('git@github.com:user/repo.git')).toMatchObject({
      kind: 'remote-url',
      url: 'git@github.com:user/repo.git',
    })
  })

  it('rejects credentials, shell fragments and invalid usernames', () => {
    expect(() => parseRepositoryInput('https://user:token@github.com/user/repo.git')).toThrow(
      '不能包含内嵌账号或密码',
    )
    expect(() => parseRepositoryInput('repo; rm -rf /')).toThrow('项目名只能包含')
    expect(() => parseRepositoryInput('http://github.com/user/repo.git')).toThrow(
      '只支持 HTTPS 或 SSH',
    )
    expect(() => normalizeGitHubUsername('-invalid')).toThrow('有效的 GitHub 账号')
  })

  it('detects tracked credential-like paths', () => {
    expect(
      findSensitiveFiles([
        'src/index.ts',
        '.env',
        'config/.env.production',
        'keys/id_ed25519',
        'certs/server.pem',
      ]),
    ).toEqual(['.env', 'config/.env.production', 'keys/id_ed25519', 'certs/server.pem'])
  })
})
