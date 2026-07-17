import type { GitBackupAccountStatus, GitBackupProjectStatus } from '@shared/ipc/git-backup'

interface GitBackupSidebarState {
  accountStatus: GitBackupAccountStatus | null
  projectStatus: GitBackupProjectStatus | null
  loading: boolean
  busy: boolean
  error: string | null
}

export function formatGitBackupMeta({
  accountStatus,
  projectStatus,
  loading,
  busy,
  error,
}: GitBackupSidebarState): string {
  if (busy) return '正在备份当前项目…'
  if (loading) return '正在读取备份状态…'
  if (error) return error
  if (projectStatus?.repositoryLabel) {
    const time = projectStatus.lastBackupAt
      ? formatBackupTime(projectStatus.lastBackupAt)
      : '尚未备份'
    return `${projectStatus.repositoryLabel} · ${time}`
  }
  if (accountStatus?.tokenConfigured) {
    return `${accountStatus.username || 'GitHub 已配置'} · 尚未绑定仓库`
  }
  return '未配置 GitHub · 也可填写 SSH 地址'
}

function formatBackupTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '已备份'
  return date.toLocaleString([], {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}
