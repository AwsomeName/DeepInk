import type { RemoteProtocolCompatibility } from './remote-protocol'

export const MIN_SUPPORTED_REMOTE_PROTOCOL_VERSION = '2'
export const CURRENT_EXPECTED_REMOTE_PROTOCOL_VERSION = '2'

export function buildRemoteProtocolCompatibility(
  agentProtocolVersion?: string | number | null,
): RemoteProtocolCompatibility {
  const agentReported = normalizeVersion(agentProtocolVersion)
  if (!agentReported) {
    return {
      minSupported: MIN_SUPPORTED_REMOTE_PROTOCOL_VERSION,
      currentExpected: CURRENT_EXPECTED_REMOTE_PROTOCOL_VERSION,
      status: 'unknown',
      message: '远端 agent 未上报协议版本；仅允许安全降级能力。',
    }
  }

  if (compareVersions(agentReported, MIN_SUPPORTED_REMOTE_PROTOCOL_VERSION) < 0) {
    return {
      minSupported: MIN_SUPPORTED_REMOTE_PROTOCOL_VERSION,
      currentExpected: CURRENT_EXPECTED_REMOTE_PROTOCOL_VERSION,
      agentReported,
      status: 'upgrade-required',
      message: `远端协议版本 ${agentReported} 过旧，需要升级到 ${MIN_SUPPORTED_REMOTE_PROTOCOL_VERSION} 或更高版本。`,
    }
  }

  return {
    minSupported: MIN_SUPPORTED_REMOTE_PROTOCOL_VERSION,
    currentExpected: CURRENT_EXPECTED_REMOTE_PROTOCOL_VERSION,
    agentReported,
    status: 'compatible',
    message:
      agentReported === CURRENT_EXPECTED_REMOTE_PROTOCOL_VERSION
        ? '远端协议版本兼容。'
        : `远端协议版本 ${agentReported} 可兼容当前 DeepInk，当前期望版本为 ${CURRENT_EXPECTED_REMOTE_PROTOCOL_VERSION}。`,
  }
}

function normalizeVersion(version?: string | number | null): string | undefined {
  const normalized = String(version ?? '').trim()
  if (!normalized || normalized === 'unknown') return undefined
  return normalized
}

function compareVersions(left: string, right: string): number {
  const leftParts = parseVersion(left)
  const rightParts = parseVersion(right)
  if (!leftParts || !rightParts) return left.localeCompare(right)

  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const leftPart = leftParts[index] ?? 0
    const rightPart = rightParts[index] ?? 0
    if (leftPart !== rightPart) return leftPart - rightPart
  }
  return 0
}

function parseVersion(version: string): number[] | null {
  const match = version.match(/^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?/)
  if (!match) return null
  return [match[1], match[2], match[3]].filter(Boolean).map((part) => Number(part))
}
