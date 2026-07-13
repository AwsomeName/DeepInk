import type { CclinkRemoteError, CclinkRemoteErrorLayer } from '@shared/ipc/cclink'

export type RemoteErrorLayer =
  | CclinkRemoteErrorLayer

export interface RemoteErrorExplanation {
  layer: RemoteErrorLayer
  layerLabel: string
  title: string
  message: string
  actionHint: string
  code?: string
  retryable?: boolean
}

export type RemoteErrorArea = 'file-tree' | 'file-read' | 'conversation'

const LAYER_LABEL: Record<RemoteErrorLayer, string> = {
  account: '账号',
  transport: '实时链路',
  'remote-agent': '远端 Agent',
  workspace: '远程工作空间',
  'file-provider': '文件 Provider',
  'execution-backend': '执行后端',
  unknown: '未知来源',
}

const ACTION_HINT: Record<RemoteErrorLayer, string> = {
  account: '先到设置页检查 DeepInk / CCLink 身份、手机号和登录状态。',
  transport: '先确认实时链路在线，再重试远程文件或会话操作。',
  'remote-agent': '先确认远端设备在线，且 chatcc-agent 正在运行。',
  workspace: '先重新同步服务器，确认远端工作空间仍存在。',
  'file-provider': '先确认远端 Agent 支持文件树 / 文件读取协议。',
  'execution-backend': '先确认远端会话后端可用，再重试发送。',
  unknown: '先查看远程连接设置和诊断日志，再重试。',
}

function normalizeMessage(message: string | null | undefined): string {
  return (message || '远程操作失败').trim()
}

export function classifyRemoteError(message: string | null | undefined, area: RemoteErrorArea): RemoteErrorLayer {
  const text = normalizeMessage(message)

  if (/账号|身份|登录|手机号|token|USER_NOT_FOUND|AUTH|JWT|鉴权/iu.test(text)) return 'account'
  if (/transport|实时|链路|TIM|IM|连接超时|timeout|网络/iu.test(text)) return 'transport'
  if (/远程设备不存在|远程设备当前|离线|连接中|agent.*离线|chatcc-agent/iu.test(text)) {
    return 'remote-agent'
  }
  if (/工作空间不存在|workspace|缺少远程设备|缺少.*工作空间/iu.test(text)) return 'workspace'
  if (/文件树|文件读取|file_tree|file_read|目录加载|远程文件/iu.test(text)) return 'file-provider'
  if (/执行|backend|Claude|Codex|会话|send|abort/iu.test(text)) return 'execution-backend'

  if (area === 'file-tree' || area === 'file-read') return 'file-provider'
  if (area === 'conversation') return 'execution-backend'
  return 'unknown'
}

export function explainRemoteError(
  message: string | null | undefined,
  area: RemoteErrorArea,
  structured?: CclinkRemoteError | null,
): RemoteErrorExplanation {
  if (structured) {
    return {
      layer: structured.layer,
      layerLabel: LAYER_LABEL[structured.layer],
      title: `${LAYER_LABEL[structured.layer]}异常`,
      message: structured.message || normalizeMessage(message),
      actionHint: ACTION_HINT[structured.layer],
      code: structured.code,
      retryable: structured.retryable,
    }
  }

  const layer = classifyRemoteError(message, area)
  return {
    layer,
    layerLabel: LAYER_LABEL[layer],
    title: `${LAYER_LABEL[layer]}异常`,
    message: normalizeMessage(message),
    actionHint: ACTION_HINT[layer],
  }
}
