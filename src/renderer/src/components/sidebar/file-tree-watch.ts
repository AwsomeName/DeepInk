import type { FsWatchDirEvent } from '@shared/ipc/fs'

/**
 * 把递归文件监听事件收敛成需要重读的目录。
 * 项目现场和 Git 自身会高频写入，但它们不属于文件树的用户内容变化。
 */
export function getFileTreeRefreshDirectory(
  workspacePath: string,
  event: FsWatchDirEvent,
): string | null {
  const filePath = event.filePath
  if (filePath !== workspacePath && !filePath.startsWith(workspacePath + '/')) return null

  const relativePath = filePath.slice(workspacePath.length).replace(/^\/+/, '')
  if (
    relativePath === '.git' ||
    relativePath.startsWith('.git/') ||
    relativePath === '.cclink-studio/project.json' ||
    relativePath.startsWith('.cclink-studio/project.json.') ||
    relativePath === '.cclink-studio/state' ||
    relativePath.startsWith('.cclink-studio/state/')
  ) {
    return null
  }

  const separatorIndex = filePath.lastIndexOf('/')
  const parentPath = separatorIndex > 0 ? filePath.slice(0, separatorIndex) : workspacePath
  return parentPath.startsWith(workspacePath) ? parentPath : workspacePath
}
