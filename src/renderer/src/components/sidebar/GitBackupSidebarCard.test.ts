import { describe, expect, it } from 'vitest'
import { formatGitBackupMeta } from './git-backup-sidebar-view-model'

describe('formatGitBackupMeta', () => {
  it('shows the bound repository and last backup time', () => {
    const text = formatGitBackupMeta({
      accountStatus: null,
      projectStatus: {
        workspacePath: '/workspace/project',
        projectId: 'project-1',
        bound: true,
        remoteUrl: 'https://github.com/octocat/project.git',
        repositoryLabel: 'octocat/project',
        lastBackupAt: '2026-07-17T08:00:00.000Z',
        busy: false,
      },
      loading: false,
      busy: false,
      error: null,
    })

    expect(text).toContain('octocat/project')
    expect(text).not.toContain('尚未备份')
  })

  it('makes clear that SSH remains available without GitHub account settings', () => {
    expect(
      formatGitBackupMeta({
        accountStatus: null,
        projectStatus: null,
        loading: false,
        busy: false,
        error: null,
      }),
    ).toBe('未配置 GitHub · 也可填写 SSH 地址')
  })

  it('shows an operational error before repository metadata', () => {
    expect(
      formatGitBackupMeta({
        accountStatus: null,
        projectStatus: null,
        loading: false,
        busy: false,
        error: 'Git 不可用',
      }),
    ).toBe('Git 不可用')
  })
})
