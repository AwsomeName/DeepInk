import { useEffect, useState } from 'react'
import type { ProjectOpsPlatform } from '@shared/ipc/project-ops'
import type { WorkspaceRef } from '../../../../shared/workspace-ref'
import { IconGlobe } from '../common/Icons'
import { useAgentStore, useTabStore } from '../../stores'

function draftTitle(platform: ProjectOpsPlatform): string {
  return `${platform.name}宣发稿`
}

function defaultDraftFile(platform: ProjectOpsPlatform): string {
  return `${draftTitle(platform)}.md`
}

function formatAccount(platform: ProjectOpsPlatform): string {
  return platform.account
    ? `${platform.account} · ${platform.browserProfile || platform.id}`
    : platform.browserProfile || platform.id
}

export function ProjectOperationsSection({
  workspacePath,
  workspaceRef,
}: {
  workspacePath: string
  workspaceRef: WorkspaceRef
}): React.ReactElement | null {
  const openTab = useTabStore((s) => s.openTab)
  const createConversation = useAgentStore((s) => s.createConversation)
  const renameConversation = useAgentStore((s) => s.renameConversation)
  const setInput = useAgentStore((s) => s.setInput)
  const [platforms, setPlatforms] = useState<ProjectOpsPlatform[]>([])

  useEffect(() => {
    let cancelled = false

    void window.cclinkStudio.projectOps
      .getAccounts(workspacePath)
      .then((result) => {
        if (cancelled) return
        setPlatforms(result.issues.length === 0 ? (result.config?.platforms ?? []) : [])
      })
      .catch(() => {
        if (!cancelled) setPlatforms([])
      })

    return () => {
      cancelled = true
    }
  }, [workspacePath])

  const openPlatformSession = (platform: ProjectOpsPlatform): void => {
    const contentFile =
      window.prompt('要提交的 Markdown 文件路径', `docs/${defaultDraftFile(platform)}`) ||
      `docs/${defaultDraftFile(platform)}`
    openTab({
      type: 'browser',
      title: platform.name,
      icon: '🌐',
      initialUrl: platform.url,
      browserProfile: platform.browserProfile || platform.id,
      forceNew: true,
    })
    const conversationId = createConversation({
      surface: 'workbench-tab',
      runtime: {
        location: 'local',
        transport: 'local',
        backend: 'cclink-studio-agent',
        workspaceRef,
      },
      activate: true,
    })
    renameConversation(conversationId, `${platform.name}操作会话`)
    setInput(
      [
        `请打开并维护 ${platform.name} 平台页面。`,
        `平台 URL：${platform.url}`,
        `账号备注：${platform.account || '未填写'}`,
        `登录说明：${platform.notes || '无'}`,
        `浏览器 Profile：${platform.browserProfile || platform.id}`,
        `要提交的文案文件：${contentFile}`,
        '请先读取文案文件，再在浏览器中可见地填写页面。',
        '发布、提交、删除、修改账号资料、发送评论或私信前必须请求我确认。',
      ].join('\n'),
      conversationId,
    )
    openTab({
      type: 'conversation',
      title: `${platform.name}操作会话`,
      icon: '🤖',
      conversation: {
        surface: 'workbench-tab',
        runtime: {
          location: 'local',
          transport: 'local',
          backend: 'cclink-studio-agent',
          workspaceRef,
        },
        sessionId: conversationId,
      },
    })
  }

  if (platforms.length === 0) return null

  return (
    <div className="sidebar-section">
      {platforms.map((platform) => (
        <button
          key={platform.id}
          className="project-panel-row"
          onClick={() => openPlatformSession(platform)}
          title={platform.url}
        >
          <IconGlobe size={14} />
          <span className="project-panel-row-main">
            <span className="project-panel-row-title">{platform.name}</span>
            <span className="project-panel-row-meta">{formatAccount(platform)}</span>
          </span>
        </button>
      ))}
    </div>
  )
}
