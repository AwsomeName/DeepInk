import { useEffect } from 'react'
import { IconLink, IconSettings } from '../common/Icons'
import { useGitBackupStore, useTabStore } from '../../stores'
import { useToastStore } from '../common/Toast'
import { formatGitBackupMeta } from './git-backup-sidebar-view-model'

export function GitBackupSidebarCard({
  workspacePath,
}: {
  workspacePath: string
}): React.ReactElement {
  const openTab = useTabStore((state) => state.openTab)
  const showToast = useToastStore((state) => state.show)
  const accountStatus = useGitBackupStore((state) => state.accountStatus)
  const projectStatus = useGitBackupStore((state) => state.projectStatus)
  const loading = useGitBackupStore((state) => state.loading)
  const busy = useGitBackupStore((state) => state.busy)
  const error = useGitBackupStore((state) => state.error)
  const loadWorkspace = useGitBackupStore((state) => state.loadWorkspace)
  const requestBackup = useGitBackupStore((state) => state.requestBackup)

  useEffect(() => {
    void loadWorkspace(workspacePath)
  }, [loadWorkspace, workspacePath])

  const handleBackup = async (): Promise<void> => {
    const result = await requestBackup(workspacePath)
    if (result) showToast(result.message, result.success ? 'success' : 'error')
  }

  const openGitSettings = (): void => {
    openTab({
      type: 'settings',
      title: 'Git 备份设置',
      icon: '⚙️',
      settingsSection: 'git-backup',
    })
  }

  const message = formatGitBackupMeta({ accountStatus, projectStatus, loading, busy, error })
  const statusClass = error
    ? 'error'
    : busy || loading || (!projectStatus?.lastBackupAt && accountStatus?.tokenConfigured)
      ? 'pending'
      : projectStatus?.lastBackupAt
        ? 'authenticated'
        : ''

  return (
    <div className="project-git-backup-card">
      <button
        type="button"
        className="project-panel-row project-git-backup-main"
        disabled={busy || loading}
        onClick={() => void handleBackup()}
        title={error ?? projectStatus?.remoteUrl ?? '手动备份当前项目全部可备份变更'}
      >
        <IconLink size={14} />
        <span className="project-panel-row-main">
          <span className="project-panel-row-title project-operations-title">
            <span>GitHub 备份</span>
            <span className={`project-operations-status ${statusClass}`} aria-hidden="true" />
          </span>
          <span className="project-panel-row-meta">{message}</span>
        </span>
      </button>
      <button
        type="button"
        className="project-git-backup-settings"
        onClick={openGitSettings}
        title="打开 Git 备份设置"
      >
        <IconSettings size={13} />
      </button>
    </div>
  )
}
