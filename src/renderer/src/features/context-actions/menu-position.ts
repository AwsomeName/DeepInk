export interface MenuPositionInput {
  x: number
  y: number
  menuWidth: number
  menuHeight: number
  viewportWidth: number
  viewportHeight: number
  margin?: number
}

export function fitMenuPosition(input: MenuPositionInput): { left: number; top: number } {
  const margin = input.margin ?? 8
  return {
    left: Math.max(margin, Math.min(input.x, input.viewportWidth - input.menuWidth - margin)),
    top: Math.max(margin, Math.min(input.y, input.viewportHeight - input.menuHeight - margin)),
  }
}

export function findNextEnabledIndex(
  enabled: boolean[],
  currentIndex: number,
  direction: 1 | -1,
): number {
  if (enabled.length === 0) return -1
  let next = currentIndex
  for (let step = 0; step < enabled.length; step += 1) {
    next = (next + direction + enabled.length) % enabled.length
    if (enabled[next]) return next
  }
  return currentIndex
}

export function findBoundaryEnabledIndex(enabled: boolean[], edge: 'start' | 'end'): number {
  if (edge === 'start') return enabled.findIndex(Boolean)
  for (let index = enabled.length - 1; index >= 0; index -= 1) {
    if (enabled[index]) return index
  }
  return -1
}
