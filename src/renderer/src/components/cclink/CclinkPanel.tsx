import { useEffect, useState } from 'react'
import type { ChatccServer, ChatccWorkspace } from '@shared/chatcc'
import type {
  RemoteDiagnosticCheckStatus,
  RemoteDiagnosticReport,
} from '@shared/remote-protocol'
import { remoteWorkspaceRef } from '@shared/workspace-ref'
import { useAuthStore, useCclinkStore } from '../../stores'
import { IconChevronDown, IconFile, IconFolder, IconLink, IconRobot } from '../common/Icons'

function serverStatusLabel(status: ChatccServer['status']): string {
  switch (status) {
    case 'online':
      return '在线'
    case 'connecting':
      return '连接中'
    case 'offline':
      return '离线'
  }
}

function realtimeStatusLabel(state: string): string {
  switch (state) {
    case 'online':
      return '实时链路在线'
    case 'connecting':
      return '正在连接'
    case 'offline':
      return '实时链路已断开'
    case 'error':
      return '实时链路异常'
    case 'idle':
    default:
      return '实时链路未连接'
  }
}

function diagnosticStatusLabel(status: RemoteDiagnosticCheckStatus): string {
  switch (status) {
    case 'pass':
      return '通过'
    case 'warn':
      return '警告'
    case 'fail':
      return '失败'
    case 'unknown':
      return '未知'
  }
}

function buildDiagnosticText(report: RemoteDiagnosticReport): string {
  const lines = [
    'DeepInk Remote Diagnostic Report',
    `traceId: ${report.traceId}`,
    `generatedAt: ${new Date(report.generatedAt).toISOString()}`,
    `transport: ${report.ref.transport}`,
    `endpointId: ${report.ref.endpointId}`,
    `endpointName: ${report.ref.endpointName ?? report.status.endpointName ?? 'unknown'}`,
    `workspaceId: ${report.ref.workspaceId}`,
    `workspacePath: ${report.status.workspacePath}`,
    `state: ${report.status.state}`,
    `agentVersion: ${report.status.agentVersion ?? 'unknown'}`,
    `protocolVersion: ${report.status.protocolVersion ?? 'unknown'}`,
    `compatibility.status: ${report.status.compatibility?.status ?? 'unknown'}`,
    `compatibility.minSupported: ${report.status.compatibility?.minSupported ?? 'unknown'}`,
    `compatibility.currentExpected: ${report.status.compatibility?.currentExpected ?? 'unknown'}`,
    `compatibility.message: ${report.status.compatibility?.message ?? 'unknown'}`,
    `lastSeen: ${report.status.lastSeen ?? 'unknown'}`,
    `capability.file: tree=${report.status.capabilities.file.tree}, read=${report.status.capabilities.file.read}, write=${report.status.capabilities.file.write}`,
    `capability.shell: command=${report.status.capabilities.shell.command}, pty=${report.status.capabilities.shell.pty}`,
    `capability.agent: codex=${report.status.capabilities.agent.codex}, claudeCode=${report.status.capabilities.agent.claudeCode}`,
    `capability.session: list=${report.status.capabilities.session.list}, stream=${report.status.capabilities.session.stream}`,
    '',
    'checks:',
  ]

  for (const check of report.checks) {
    lines.push(`- [${check.status}] ${check.label}: ${check.message}`)
    if (check.remoteError) {
      lines.push(
        `  remoteError: code=${check.remoteError.code}, layer=${check.remoteError.layer}, retryable=${check.remoteError.retryable}`,
      )
    }
  }

  if (report.recentErrors.length > 0) {
    lines.push('', 'recentErrors:')
    for (const event of report.recentErrors) {
      lines.push(
        `- ${new Date(event.timestamp).toISOString()} ${event.operation} traceId=${event.traceId}: ${event.message}`,
      )
      if (event.remoteError) {
        lines.push(
          `  remoteError: code=${event.remoteError.code}, layer=${event.remoteError.layer}, retryable=${event.remoteError.retryable}`,
        )
      }
    }
  }

  return lines.join('\n')
}

export function CclinkPanel(): React.ReactElement {
  const servers = useCclinkStore((s) => s.servers)
  const identity = useCclinkStore((s) => s.identity)
  const realtimeStatus = useCclinkStore((s) => s.realtimeStatus)
  const loading = useCclinkStore((s) => s.loading)
  const identityLoading = useCclinkStore((s) => s.identityLoading)
  const preflightLoading = useCclinkStore((s) => s.preflightLoading)
  const realtimeLoading = useCclinkStore((s) => s.realtimeLoading)
  const legacyPreflight = useCclinkStore((s) => s.legacyPreflight)
  const error = useCclinkStore((s) => s.error)
  const authUser = useAuthStore((s) => s.user)
  const loggedIn = useAuthStore((s) => s.loggedIn)
  const load = useCclinkStore((s) => s.load)
  const preflightLegacyImport = useCclinkStore((s) => s.preflightLegacyImport)
  const ensureIdentity = useCclinkStore((s) => s.ensureIdentity)
  const sendLegacySmsCode = useCclinkStore((s) => s.sendLegacySmsCode)
  const importLegacyIdentity = useCclinkStore((s) => s.importLegacyIdentity)
  const clearIdentity = useCclinkStore((s) => s.clearIdentity)
  const syncPairedAgents = useCclinkStore((s) => s.syncPairedAgents)
  const connectRealtime = useCclinkStore((s) => s.connectRealtime)
  const disconnectRealtime = useCclinkStore((s) => s.disconnectRealtime)
  const seedDemoData = useCclinkStore((s) => s.seedDemoData)
  const clearLocalData = useCclinkStore((s) => s.clearLocalData)
  const [legacySmsCode, setLegacySmsCode] = useState('')
  const [legacySmsSent, setLegacySmsSent] = useState(false)
  const cachedPhone = loggedIn ? authUser?.phone : null
  const verifiedLegacyPhone = legacyPreflight?.ok
    ? (legacyPreflight.cloudUser?.phone ?? null)
    : null
  const canUseLegacyImport = Boolean(legacyPreflight?.ok && verifiedLegacyPhone)

  useEffect(() => {
    void load()
  }, [load])

  const handleSendLegacySmsCode = async (): Promise<void> => {
    const preflight = await preflightLegacyImport()
    if (!preflight?.ok) {
      useCclinkStore.setState({
        error: preflight?.message ?? '旧 CCLink 导入预检失败。',
      })
      return
    }
    if (identity) {
      await clearIdentity()
    }
    await sendLegacySmsCode()
    setLegacySmsSent(true)
  }

  const handleImportLegacyIdentity = async (): Promise<void> => {
    const preflight = legacyPreflight?.ok ? legacyPreflight : await preflightLegacyImport()
    if (!preflight?.ok) {
      useCclinkStore.setState({
        error: preflight?.message ?? '旧 CCLink 导入预检失败。',
      })
      return
    }
    await importLegacyIdentity(legacySmsCode)
    setLegacySmsCode('')
    setLegacySmsSent(false)
  }

  return (
    <div className="cclink-panel">
      <div className="cclink-intro">
        <div className="cclink-intro-title">
          <IconLink size={14} />
          CCLink 远程连接
        </div>
        <p>
          DeepInk 通过 CCLink 连接 <code>chatcc-agent</code>
          ；这里只处理账号、链路、服务器同步和诊断。
        </p>
      </div>

      <div className={`cclink-identity-card ${identity ? 'ready' : ''}`}>
        <div className="cclink-identity-main">
          <div className="cclink-identity-title">
            {identity ? '账户身份已同步' : '账户身份未同步'}
          </div>
          <div className="cclink-identity-detail">
            {identity
              ? `${identity.clientImUserId} · SDKAppID ${identity.sdkAppId}`
              : cachedPhone
                ? '没有旧 CCLink 服务器时可创建 DeepInk 新身份；已有旧服务器请用下方“导入旧 CCLink 账号”。'
                : loggedIn
                  ? '当前 DeepInk 账号没有手机号，无法创建或导入 CCLink 身份。'
                  : '当前为本机工作台模式；登录 DeepInk 云账号后可创建或导入 CCLink 身份。'}
          </div>
        </div>
        <div className="cclink-identity-actions">
          <button
            className="cclink-btn primary"
            onClick={() => void ensureIdentity()}
            disabled={identityLoading || !cachedPhone}
          >
            {identityLoading ? '处理中' : '创建 DeepInk 身份'}
          </button>
          {identity && (
            <button
              className="cclink-btn"
              onClick={() => void clearIdentity()}
              disabled={identityLoading}
            >
              移除
            </button>
          )}
        </div>
      </div>

      <div className="cclink-legacy-card">
        <div className="cclink-legacy-title">导入旧 CCLink 账号</div>
        <div className="cclink-legacy-hint">
          {verifiedLegacyPhone
            ? `云端预检确认当前 token 手机号为 ${verifiedLegacyPhone}；发送验证码前如已有本地身份，会先自动移除。`
            : cachedPhone
              ? `本地缓存手机号为 ${cachedPhone}；发送验证码前会先向云端 /auth/me 复核。`
              : loggedIn
                ? '当前 DeepInk 账号没有手机号，需先用旧 CCLink 手机号登录 DeepInk。'
                : '需先登录 DeepInk 云账号，再导入旧 CCLink 账号。'}
        </div>
        <div
          className={`cclink-preflight ${legacyPreflight?.ok ? 'ready' : legacyPreflight ? 'blocked' : ''}`}
        >
          <div className="cclink-preflight-title">
            旧账号导入预检：
            {preflightLoading
              ? '检查中'
              : legacyPreflight
                ? legacyPreflight.ok
                  ? '通过'
                  : '未通过'
                : '未检查'}
          </div>
          <div className="cclink-preflight-detail">
            {legacyPreflight?.message ??
              '不会发送短信、不会创建身份、不会改云端；只确认当前 token 对应的云端账号。'}
          </div>
          {legacyPreflight && (
            <div className="cclink-preflight-meta">
              <span>缓存：{legacyPreflight.cachedUser?.phone ?? '无手机号'}</span>
              <span>云端：{legacyPreflight.cloudUser?.phone ?? '无手机号'}</span>
              <span>版本：{legacyPreflight.cloudVersion?.version ?? '未知'}</span>
            </div>
          )}
        </div>
        <div className="cclink-legacy-actions">
          <button
            className="cclink-btn"
            onClick={() => void preflightLegacyImport()}
            disabled={preflightLoading || identityLoading || !loggedIn}
          >
            {preflightLoading ? '检查中' : '预检'}
          </button>
          <button
            className="cclink-btn"
            onClick={() => void handleSendLegacySmsCode()}
            disabled={identityLoading || preflightLoading || (!cachedPhone && !verifiedLegacyPhone)}
          >
            {legacySmsSent ? '重新发送验证码' : '预检并发送验证码'}
          </button>
          <input
            className="cclink-legacy-input"
            value={legacySmsCode}
            onChange={(event) => setLegacySmsCode(event.target.value)}
            placeholder="旧 CCLink 验证码"
            inputMode="numeric"
          />
          <button
            className="cclink-btn primary"
            onClick={() => void handleImportLegacyIdentity()}
            disabled={
              identityLoading ||
              preflightLoading ||
              !canUseLegacyImport ||
              legacySmsCode.trim().length === 0
            }
          >
            导入
          </button>
        </div>
      </div>

      <div className={`cclink-identity-card ${realtimeStatus.state === 'online' ? 'ready' : ''}`}>
        <div className="cclink-identity-main">
          <div className="cclink-identity-title">{realtimeStatusLabel(realtimeStatus.state)}</div>
          <div className="cclink-identity-detail">
            {realtimeStatus.error ||
              (identity
                ? '使用当前 CCLink/TIM 身份连接远程设备。'
                : '请先创建 DeepInk 身份，或导入旧 CCLink 账号。')}
          </div>
        </div>
        <div className="cclink-identity-actions">
          {realtimeStatus.state === 'online' ? (
            <button
              className="cclink-btn"
              onClick={() => void disconnectRealtime()}
              disabled={realtimeLoading}
            >
              {realtimeLoading ? '断开中' : '断开'}
            </button>
          ) : (
            <button
              className="cclink-btn primary"
              onClick={() => void connectRealtime()}
              disabled={realtimeLoading || !identity}
            >
              {realtimeLoading ? '连接中' : '连接实时链路'}
            </button>
          )}
        </div>
      </div>

      <div className="cclink-actions">
        <button
          className="cclink-btn primary"
          onClick={() => void seedDemoData()}
          disabled={loading}
        >
          生成示例数据
        </button>
        <button
          className="cclink-btn"
          onClick={() => void syncPairedAgents()}
          disabled={loading || !identity}
        >
          同步服务器
        </button>
        <button
          className="cclink-btn danger"
          onClick={() => void clearLocalData()}
          disabled={loading}
        >
          清空
        </button>
      </div>

      {error && <div className="cclink-error">{error}</div>}

      {servers.length === 0 && !loading && (
        <div className="cclink-empty">
          <IconRobot size={22} />
          <div className="cclink-empty-title">还没有同步远程设备</div>
          <div className="cclink-empty-hint">
            下一步接入 Setup Code 配对，把 chatcc-agent 绑定到当前账号。
          </div>
        </div>
      )}

      {servers.length > 0 && (
        <>
          <div className="sidebar-section">
            <div className="sidebar-section-header expanded">
              <IconChevronDown size={10} />
              远程设备
            </div>
            {servers.map((server) => (
              <ServerItem key={server.id} server={server} />
            ))}
          </div>

          <div className="cclink-preview">
            <div className="cclink-preview-title">会话已迁入工作空间</div>
            <div className="cclink-preview-path">
              远程会话和文件显示在对应的远程工作空间下；设置页只负责连接和诊断。
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function ServerItem({ server }: { server: ChatccServer }): React.ReactElement {
  return (
    <div className="cclink-server">
      <div className="cclink-server-head">
        <span className={`cclink-status ${server.status}`} />
        <span className="cclink-server-name">{server.name}</span>
        <span className="cclink-server-state">{serverStatusLabel(server.status)}</span>
      </div>
      <div className="cclink-server-meta">
        {server.hostname} · {server.os}
      </div>
      <div className="cclink-workspaces">
        {server.workspaces.map((workspace) => (
          <WorkspaceItem key={workspace.id} server={server} workspace={workspace} />
        ))}
      </div>
    </div>
  )
}

function WorkspaceItem({
  server,
  workspace,
}: {
  server: ChatccServer
  workspace: ChatccWorkspace
}): React.ReactElement {
  const [report, setReport] = useState<RemoteDiagnosticReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle')

  const loadDiagnostics = async (): Promise<void> => {
    setLoading(true)
    setError(null)
    setCopyStatus('idle')
    try {
      const nextReport = await window.deepink.remote.getDiagnostics(
        remoteWorkspaceRef({
          endpointId: server.id,
          endpointName: server.name,
          workspaceId: workspace.id,
          path: workspace.path,
          label: workspace.name,
        }),
      )
      setReport(nextReport)
    } catch (err) {
      setReport(null)
      setError(err instanceof Error ? err.message : '诊断失败')
    } finally {
      setLoading(false)
    }
  }

  const copyDiagnostics = async (): Promise<void> => {
    if (!report) return
    try {
      await navigator.clipboard.writeText(buildDiagnosticText(report))
      setCopyStatus('copied')
    } catch {
      setCopyStatus('failed')
    }
  }

  return (
    <div className="cclink-workspace-entry">
      <div className="cclink-workspace">
        {workspace.sessionCount > 0 ? <IconFolder size={13} /> : <IconFile size={13} />}
        <span>{workspace.name}</span>
        <span className="cclink-workspace-count">{workspace.sessionCount}</span>
        <button
          type="button"
          className="cclink-workspace-diagnose"
          onClick={() => void loadDiagnostics()}
          disabled={loading}
        >
          {loading ? '检查中' : report ? '刷新' : '诊断'}
        </button>
      </div>
      {(report || error) && (
        <div className="remote-diagnostic-report">
          {error ? (
            <div className="remote-diagnostic-error">{error}</div>
          ) : (
            report && (
              <>
                <div className="remote-diagnostic-head">
                  <span>{report.traceId}</span>
                  <div className="remote-diagnostic-head-actions">
                    <span>{new Date(report.generatedAt).toLocaleString()}</span>
                    <button type="button" onClick={() => void copyDiagnostics()}>
                      {copyStatus === 'copied'
                        ? '已复制'
                        : copyStatus === 'failed'
                          ? '失败'
                          : '复制'}
                    </button>
                  </div>
                </div>
                <div className={`remote-diagnostic-protocol ${report.status.compatibility?.status ?? 'unknown'}`}>
                  <div>
                    <span>Agent</span>
                    <strong>{report.status.agentVersion ?? 'unknown'}</strong>
                  </div>
                  <div>
                    <span>Protocol</span>
                    <strong>{report.status.protocolVersion ?? 'unknown'}</strong>
                  </div>
                  <div>
                    <span>Compatibility</span>
                    <strong>{report.status.compatibility?.status ?? 'unknown'}</strong>
                  </div>
                  <p>{report.status.compatibility?.message ?? '远端 agent 尚未返回协议兼容信息。'}</p>
                </div>
                <div className="remote-diagnostic-checks">
                  {report.checks.map((check) => (
                    <div
                      key={check.id}
                      className={`remote-diagnostic-check ${check.status}`}
                    >
                      <span className="remote-diagnostic-check-badge">
                        {diagnosticStatusLabel(check.status)}
                      </span>
                      <span className="remote-diagnostic-check-main">
                        <strong>{check.label}</strong>
                        <span>{check.message}</span>
                      </span>
                    </div>
                  ))}
                </div>
                {report.recentErrors.length > 0 && (
                  <div className="remote-diagnostic-history">
                    <div className="remote-diagnostic-history-title">最近错误</div>
                    {report.recentErrors.map((event) => (
                      <div key={event.id} className="remote-diagnostic-history-row">
                        <span>{event.operation}</span>
                        <span>{event.remoteError?.code ?? event.message}</span>
                        <code>{event.traceId}</code>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )
          )}
        </div>
      )}
    </div>
  )
}
