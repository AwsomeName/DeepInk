import { create } from 'zustand'
import type { CommandContext, ContextTargetKind } from './context-target'

export interface MenuContribution {
  id: string
  targetKinds: ContextTargetKind[]
  group: string
  order: number
  commandId: string
  icon?: string
  when?: (context: CommandContext) => boolean
  inlineInput?: {
    ariaLabel: string
    initialValue: (context: CommandContext) => string
  }
}

interface MenuContributionRegistryState {
  contributions: MenuContribution[]
  registerContributions: (contributions: MenuContribution[]) => void
  unregisterContributions: (ids: string[]) => void
}

export const useMenuContributionRegistry = create<MenuContributionRegistryState>((set) => ({
  contributions: [],
  registerContributions: (contributions) =>
    set((state) => {
      const ids = new Set(contributions.map((item) => item.id))
      return {
        contributions: [
          ...state.contributions.filter((item) => !ids.has(item.id)),
          ...contributions,
        ],
      }
    }),
  unregisterContributions: (ids) =>
    set((state) => {
      const removed = new Set(ids)
      return { contributions: state.contributions.filter((item) => !removed.has(item.id)) }
    }),
}))

export function resolveMenuContributions(
  contributions: MenuContribution[],
  context: CommandContext,
): MenuContribution[] {
  const kind = context.target?.kind
  if (!kind) return []
  return contributions
    .filter((item) => item.targetKinds.includes(kind) && (item.when?.(context) ?? true))
    .sort((left, right) => left.group.localeCompare(right.group) || left.order - right.order)
}
