import type { BrowserTaskFailureReason } from './browser-task-types'

export function classifyBrowserError(error: unknown): BrowserTaskFailureReason {
  const message = error instanceof Error ? error.message : String(error ?? '')
  const normalized = message.toLowerCase()

  if (normalized.includes('target closed') || normalized.includes('page closed') || normalized.includes('tab closed')) {
    return 'tab_closed'
  }
  if (normalized.includes('timeout') || normalized.includes('timed out')) {
    return 'timeout'
  }
  if (normalized.includes('download')) {
    return 'download_failed'
  }
  if (normalized.includes('interrupted') || normalized.includes('cancelled') || normalized.includes('canceled')) {
    return 'user_interrupted'
  }
  if (normalized.includes('selector') || normalized.includes('locator')) {
    return 'selector_missing'
  }

  return 'unknown'
}

