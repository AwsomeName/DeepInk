import { useEffect, useState } from 'react'
import type { HardwareRiskLevel, HardwareReportConclusion } from '@shared/ipc/hardware'
import type { WorkspaceRef } from '../../../../shared/workspace-ref'
import { useAgentStore, useFsStore, useHardwareStore, useTabStore } from '../../stores'
import {
  IconChevronDown,
  IconChevronRight,
  IconFile,
  IconMonitor,
  IconRefresh,
} from '../common/Icons'

function conclusionLabel(conclusion: HardwareReportConclusion): string {
  switch (conclusion) {
    case 'ready':
      return '可进入报价'
    case 'quote-only':
      return '可报价，需复核'
    case 'blocked':
      return '阻塞'
  }
}

function riskLabel(level: HardwareRiskLevel): string {
  switch (level) {
    case 'blocking':
      return '阻塞'
    case 'warning':
      return '风险'
    case 'info':
      return '提示'
  }
}

export function HardwareProductionSection({
  workspacePath,
  workspaceRef,
  alwaysVisible = false,
  defaultExpanded = false,
}: {
  workspacePath: string
  workspaceRef: WorkspaceRef
  alwaysVisible?: boolean
  defaultExpanded?: boolean
}): React.ReactElement | null {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const openTab = useTabStore((s) => s.openTab)
  const createConversation = useAgentStore((s) => s.createConversation)
  const renameConversation = useAgentStore((s) => s.renameConversation)
  const setInput = useAgentStore((s) => s.setInput)
  const refreshDir = useFsStore((s) => s.refreshDir)
  const summary = useHardwareStore((s) => s.summary)
  const report = useHardwareStore((s) => s.report)
  const loading = useHardwareStore((s) => s.loading)
  const inspecting = useHardwareStore((s) => s.inspecting)
  const savingReport = useHardwareStore((s) => s.savingReport)
  const error = useHardwareStore((s) => s.error)
  const scanWorkspace = useHardwareStore((s) => s.scanWorkspace)
  const inspectProductionPackage = useHardwareStore((s) => s.inspectProductionPackage)
  const writeProductionReportMarkdown = useHardwareStore((s) => s.writeProductionReportMarkdown)
  const clear = useHardwareStore((s) => s.clear)
  const sameWorkspace = summary?.workspacePath === workspacePath
  const hasHardwareSignals = sameWorkspace && summary.hasHardwareSignals

  useEffect(() => {
    void scanWorkspace(workspacePath)
    return () => clear()
  }, [workspacePath, scanWorkspace, clear])

  if (!alwaysVisible && !loading && !error && !sameWorkspace) return null
  if (!alwaysVisible && !loading && !error && sameWorkspace && !summary.hasHardwareSignals) {
    return null
  }

  const gerberCount = sameWorkspace ? summary.counts['gerber-package'] : 0
  const bomCount = sameWorkspace ? summary.counts.bom : 0
  const centroidCount = sameWorkspace ? summary.counts.centroid : 0
  const riskCount = report?.risks.length ?? summary?.risks.length ?? 0
  const primaryGerberPath =
    report?.gerber?.filePath ?? (sameWorkspace ? summary.primaryGerberPackage?.path : undefined)
  const outlineLayerCount = report?.gerber?.layerHints.outline.length ?? 0
  const copperLayerCount = report?.gerber?.layerHints.copper.length ?? 0
  const drillLayerCount = report?.gerber?.layerHints.drill.length ?? 0

  const writeReport = async (): Promise<string | null> => {
    const result = await writeProductionReportMarkdown(workspacePath)
    if (!result) return null
    await refreshDir(workspacePath).catch(() => undefined)
    openTab({
      type: 'editor',
      title: result.filePath.split('/').pop() ?? '硬件检查报告.md',
      icon: '📝',
      filePath: result.filePath,
    })
    return result.filePath
  }

  const openHardwareCheckSession = async (): Promise<void> => {
    const reportFilePath = await writeReport()
    const conversationId = createConversation({
      surface: 'workbench-tab',
      runtime: {
        location: 'local',
        transport: 'local',
        backend: 'deepink-agent',
        workspaceRef,
      },
      activate: true,
    })
    renameConversation(conversationId, '硬件生产检查')
    setInput(
      [
        '请基于当前硬件项目做生产前检查。',
        `工作空间：${workspacePath}`,
        reportFilePath ? `已有检查报告：${reportFilePath}` : '请先调用硬件检查工具生成报告。',
        '重点检查 Gerber、BOM、坐标文件、源工程缺失、位号不一致和嘉立创打样风险。',
        '不要自动下单、付款或修改电路板；所有高风险动作必须先让我确认。',
      ].join('\n'),
      conversationId,
    )
    openTab({
      type: 'conversation',
      title: '硬件生产检查',
      icon: '🤖',
      conversation: {
        surface: 'workbench-tab',
        runtime: {
          location: 'local',
          transport: 'local',
          backend: 'deepink-agent',
          workspaceRef,
        },
        sessionId: conversationId,
      },
    })
  }

  const openGerberLayers = (): void => {
    if (!primaryGerberPath) return
    openTab({
      type: 'hardware-gerber',
      title: 'Gerber 层',
      icon: '🧩',
      hardwareGerber: {
        workspacePath,
        packagePath: primaryGerberPath,
      },
    })
  }

  return (
    <div className="sidebar-section hardware-production-section">
      <button
        className={`sidebar-section-header sidebar-section-header-button ${expanded ? 'expanded' : ''}`}
        onClick={() => setExpanded((value) => !value)}
      >
        {expanded ? <IconChevronDown size={10} /> : <IconChevronRight size={10} />}
        硬件生产
      </button>

      {!expanded && (
        <button
          className="project-panel-row project-panel-row-compact"
          onClick={() => setExpanded(true)}
          disabled={loading}
        >
          <IconMonitor size={14} />
          <span className="project-panel-row-main">
            <span className="project-panel-row-title">
              {loading ? '扫描硬件项目中' : hasHardwareSignals ? '检测到硬件生产文件' : '硬件扫描'}
            </span>
            <span className="project-panel-row-meta">
              {hasHardwareSignals
                ? `Gerber ${gerberCount} · BOM ${bomCount} · 坐标 ${centroidCount}`
                : '未发现硬件生产信号'}
            </span>
          </span>
        </button>
      )}

      {expanded && (
        <>
          <div className="project-panel-empty compact">
            {loading
              ? '正在扫描当前工作空间...'
              : hasHardwareSignals
                ? `Gerber ${gerberCount} · BOM ${bomCount} · 坐标 ${centroidCount} · 风险 ${riskCount}`
                : '当前工作空间暂未发现硬件生产文件'}
          </div>

          {report && (
            <div className={`hardware-report-status ${report.conclusion}`}>
              {conclusionLabel(report.conclusion)}
            </div>
          )}

          {report?.gerber && (
            <div className="hardware-layer-summary">
              <span>外形 {outlineLayerCount}</span>
              <span>铜层 {copperLayerCount}</span>
              <span>钻孔 {drillLayerCount}</span>
            </div>
          )}

          {(report?.risks ?? summary?.risks ?? []).slice(0, 4).map((risk) => (
            <div
              key={`${risk.level}:${risk.title}:${risk.detail}`}
              className={`hardware-risk ${risk.level}`}
            >
              <div className="hardware-risk-title">
                {riskLabel(risk.level)} · {risk.title}
              </div>
              <div className="hardware-risk-detail">{risk.detail}</div>
              <div className="hardware-risk-next">{risk.nextAction}</div>
            </div>
          ))}

          {error && <div className="project-panel-empty">{error}</div>}

          <div className="project-panel-quick-actions">
            <button
              className="project-panel-quick-action"
              onClick={() => void scanWorkspace(workspacePath)}
              disabled={loading || inspecting || savingReport}
              title="重新扫描硬件项目"
            >
              <IconRefresh size={14} />
              扫描
            </button>
            <button
              className="project-panel-quick-action"
              onClick={() => void inspectProductionPackage(workspacePath)}
              disabled={loading || inspecting || savingReport || !hasHardwareSignals}
              title="检查 Gerber / BOM / 坐标"
            >
              <IconFile size={14} />
              {inspecting ? '检查中' : '检查'}
            </button>
          </div>

          <div className="project-panel-quick-actions project-panel-quick-actions-single">
            <button
              className="project-panel-quick-action"
              onClick={() => void writeReport()}
              disabled={loading || inspecting || savingReport || !hasHardwareSignals}
              title="保存并打开硬件检查报告"
            >
              <IconFile size={14} />
              {savingReport ? '保存中' : '报告'}
            </button>
            <button
              className="project-panel-quick-action"
              onClick={openGerberLayers}
              disabled={loading || inspecting || savingReport || !primaryGerberPath}
              title="查看 Gerber 层和原始内容"
            >
              <IconFile size={14} />层
            </button>
            <button
              className="project-panel-quick-action"
              onClick={() => void openHardwareCheckSession()}
              disabled={loading || inspecting || savingReport || !hasHardwareSignals}
              title="创建硬件生产检查会话"
            >
              <IconMonitor size={14} />
              会话
            </button>
          </div>
        </>
      )}
    </div>
  )
}
