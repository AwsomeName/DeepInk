import type { RefObject } from 'react'
import type { Tab } from '../../types'
import { workspaceRefLabel, workspaceRefSourceLabel } from '../../../../shared/workspace-ref'
import { resolveConversationTab } from '../../utils/conversation-tab'
import { getUnsupportedConversationMeta } from '../../utils/conversation-runtime-adapter'
import { CclinkConversation } from '../cclink/CclinkConversation'
import { ErrorBoundary } from '../common/ErrorBoundary'
import { PanelErrorFallback } from '../common/ErrorFallback'
import { SettingsPage } from '../settings/SettingsPage'
import { AndroidDisplay } from './AndroidDisplay'
import { MarkdownEditor } from './MarkdownEditor'
import { ModelViewer } from './ModelViewer'
import { RemoteFileViewer } from './RemoteFileViewer'
import { WorkbenchAgentConversation } from './WorkbenchAgentConversation'
import { WeChatPreview } from './wechat/WeChatPreview'

interface WorkbenchContentProps {
  activeTab: Tab | undefined
  isBrowserTab: boolean
  contentRef: RefObject<HTMLDivElement | null>
}

export function WorkbenchContent({
  activeTab,
  isBrowserTab,
  contentRef,
}: WorkbenchContentProps): React.ReactElement {
  const conversationTarget = activeTab ? resolveConversationTab(activeTab) : null

  return (
    <div className="workbench-content" ref={contentRef}>
      <ErrorBoundary
        fallback={(error, retry) => (
          <PanelErrorFallback error={error} retry={retry} title="Tab 内容" />
        )}
      >
        {!isBrowserTab && activeTab && (
          <>
            {activeTab.type === 'settings' && (
              <SettingsPage initialSection={activeTab.settingsSection} />
            )}
            {activeTab.type === 'editor' && (
              <MarkdownEditor
                key={activeTab.filePath ?? activeTab.id}
                filePath={activeTab.filePath}
                tabId={activeTab.id}
              />
            )}
            {activeTab.type === 'android' && <AndroidDisplay />}
            {activeTab.type === 'preview' && activeTab.filePath && (
              <WeChatPreview key={activeTab.filePath} filePath={activeTab.filePath} />
            )}
            {activeTab.type === 'model' && activeTab.filePath && (
              <ModelViewer key={activeTab.filePath} filePath={activeTab.filePath} />
            )}
            {conversationTarget?.kind === 'remote-cclink' && (
              <CclinkConversation
                key={conversationTarget.sessionId}
                sessionId={conversationTarget.sessionId}
              />
            )}
            {conversationTarget?.kind === 'local-agent' && (
              <WorkbenchAgentConversation
                key={conversationTarget.conversationId}
                tabId={conversationTarget.tabId}
                conversationId={conversationTarget.conversationId}
              />
            )}
            {conversationTarget?.kind === 'unsupported' && (
              <UnsupportedConversationTab reason={conversationTarget.reason} />
            )}
            {activeTab.type === 'remote-file' && activeTab.remoteFile && (
              <RemoteFileViewer
                key={`${activeTab.remoteFile.serverId}:${activeTab.remoteFile.workspaceId}:${activeTab.remoteFile.path}`}
                remoteFile={activeTab.remoteFile}
              />
            )}
            {activeTab.type === 'terminal' && <TerminalPlaceholder tab={activeTab} />}
          </>
        )}
      </ErrorBoundary>
    </div>
  )
}

function TerminalPlaceholder({ tab }: { tab: Tab }): React.ReactElement {
  const terminal = tab.terminal
  const runtime = terminal?.runtime
  const workspace = runtime?.workspaceRef

  return (
    <div className="conversation-shell local">
      <div className="terminal-placeholder">
        <div className="terminal-placeholder-title">Terminal 尚未接入真实 shell</div>
        <div className="terminal-placeholder-desc">
          这是 M6 的受控工作现场：当前只创建 Tab、保存 runtime、展示权限/关闭语义，不启动本机或远端进程。
        </div>
        <div className="terminal-placeholder-grid">
          <TerminalMeta label="工作空间" value={workspace ? workspaceRefLabel(workspace) : '未知'} />
          <TerminalMeta
            label="来源"
            value={workspace ? workspaceRefSourceLabel(workspace) : '未知'}
          />
          <TerminalMeta label="运行位置" value={runtime?.location === 'remote' ? '远程' : '本地'} />
          <TerminalMeta label="传输" value={runtime?.transport ?? '未知'} />
          <TerminalMeta label="后端" value={runtime?.backend ?? '未知'} />
          <TerminalMeta label="cwd" value={runtime?.cwd ?? '未设置'} />
          <TerminalMeta label="权限模式" value={terminal?.permissionPolicy.mode ?? '未知'} />
          <TerminalMeta label="关闭策略" value={terminal?.closePolicy ?? '未知'} />
        </div>
      </div>
    </div>
  )
}

function TerminalMeta({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div className="terminal-placeholder-meta">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function UnsupportedConversationTab({ reason }: { reason: string }): React.ReactElement {
  const meta = getUnsupportedConversationMeta({
    kind: 'unsupported',
    tabId: 'unsupported',
    reason,
  })
  return (
    <div className="conversation-shell local">
      <div className="workbench-agent-empty">
        <strong>{meta.title}</strong>
        <br />
        {meta.reason}
        <br />
        这不是会话丢失，而是对应运行通道还没有接入 Workbench Tab。
      </div>
    </div>
  )
}
