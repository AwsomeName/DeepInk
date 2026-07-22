import { useEffect } from 'react'
import { useCommandStore } from '../../stores/command-store'
import { createTabContextCommands, tabMenuContributions } from './domains/tab-context-actions'
import { createFileContextCommands, fileMenuContributions } from './domains/file-context-actions'
import {
  createProjectContextCommands,
  projectMenuContributions,
} from './domains/project-context-actions'
import {
  createSelectionContextCommands,
  selectionMenuContributions,
} from './domains/selection-context-actions'
import {
  createThreadContextCommands,
  threadMenuContributions,
} from './domains/thread-context-actions'
import { useMenuContributionRegistry } from './menu-contribution-registry'

const commands = [
  ...createTabContextCommands(),
  ...createFileContextCommands(),
  ...createProjectContextCommands(),
  ...createSelectionContextCommands(),
  ...createThreadContextCommands(),
]
const contributions = [
  ...tabMenuContributions,
  ...fileMenuContributions,
  ...projectMenuContributions,
  ...selectionMenuContributions,
  ...threadMenuContributions,
]

export function useRegisterContextActions(): void {
  const registerCommands = useCommandStore((state) => state.registerCommands)
  const unregisterCommand = useCommandStore((state) => state.unregisterCommand)
  const registerContributions = useMenuContributionRegistry((state) => state.registerContributions)
  const unregisterContributions = useMenuContributionRegistry(
    (state) => state.unregisterContributions,
  )

  useEffect(() => {
    registerCommands(commands)
    registerContributions(contributions)
    return () => {
      commands.forEach((command) => unregisterCommand(command.id))
      unregisterContributions(contributions.map((item) => item.id))
    }
  }, [registerCommands, registerContributions, unregisterCommand, unregisterContributions])
}
