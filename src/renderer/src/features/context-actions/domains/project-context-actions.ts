import type { Command } from '../../../stores/command-store'
import { useFsStore } from '../../../stores/fs-store'
import { getProjectCloseSuccessor, useOpenProjectsStore } from '../../../stores/open-projects-store'
import { useWorkspaceStore } from '../../../stores/workspace-store'
import { useToastStore } from '../../../components/common/Toast'
import type { CommandContext } from '../context-target'
import type { MenuContribution } from '../menu-contribution-registry'

function projectPath(context?: CommandContext): string | null {
  return context?.target?.kind === 'project' ? context.target.path : null
}

async function activateProject(path: string): Promise<boolean> {
  const success = await useFsStore.getState().openRecentWorkspace(path)
  if (!success) {
    const reason = useFsStore.getState().error
    useToastStore.getState().show(reason || '项目切换失败，已保留当前现场', 'error')
  }
  return success
}

export function createProjectContextCommands(): Command[] {
  return [
    {
      id: 'project.close',
      label: '关闭项目',
      contextOnly: true,
      category: '项目',
      enabled: (context) => {
        const path = projectPath(context)
        return {
          enabled: Boolean(path && useOpenProjectsStore.getState().openProjectPaths.includes(path)),
          reason: '项目已关闭',
        }
      },
      action: async (context) => {
        const path = projectPath(context)
        if (!path) throw new Error('项目目标已失效')
        const currentActive = useWorkspaceStore.getState().activeWorkspaceRef
        const projectsStore = useOpenProjectsStore.getState()
        const isActive = currentActive.kind === 'local' && currentActive.path === path
        if (!isActive) {
          projectsStore.removeProject(path)
          return
        }

        const nextPath = getProjectCloseSuccessor(projectsStore.openProjectPaths, path)
        if (nextPath) {
          if (await activateProject(nextPath)) useOpenProjectsStore.getState().removeProject(path)
          return
        }

        await useFsStore.getState().closeWorkspace()
        if (useWorkspaceStore.getState().activeWorkspaceRef.kind === 'global') {
          useOpenProjectsStore.getState().removeProject(path)
        }
      },
    },
  ]
}

export const projectMenuContributions: MenuContribution[] = [
  {
    id: 'project.close',
    targetKinds: ['project'],
    group: '90-manage',
    order: 10,
    commandId: 'project.close',
    icon: '✕',
  },
]
