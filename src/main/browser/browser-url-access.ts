import { realpath, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const LOCAL_HTML_EXTENSIONS = new Set(['.html', '.htm'])

export function isSupportedBrowserUrl(value: string): boolean {
  if (value === 'about:blank') return true
  try {
    return ['http:', 'https:', 'file:'].includes(new URL(value).protocol)
  } catch {
    return false
  }
}

export async function assertBrowserUrlAccess(
  value: string,
  workspaceKey: string | null,
): Promise<void> {
  if (value === 'about:blank') return

  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('浏览器 URL 无效')
  }
  if (url.protocol === 'http:' || url.protocol === 'https:') return
  if (url.protocol !== 'file:') throw new Error(`不允许的浏览器协议: ${url.protocol}`)
  if (!workspaceKey || !path.isAbsolute(workspaceKey)) {
    throw new Error('本地 HTML 必须绑定到本地工作空间')
  }

  let requestedPath: string
  try {
    requestedPath = fileURLToPath(url)
  } catch {
    throw new Error('本地 HTML URL 无效')
  }
  if (!LOCAL_HTML_EXTENSIONS.has(path.extname(requestedPath).toLowerCase())) {
    throw new Error('内嵌浏览器只能打开工作空间内的 HTML 文件')
  }

  const [workspacePath, filePath] = await Promise.all([
    realpath(workspaceKey),
    realpath(requestedPath),
  ])
  const relativePath = path.relative(workspacePath, filePath)
  if (
    relativePath === '..' ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath)
  ) {
    throw new Error('本地 HTML 不在当前工作空间内')
  }
  if (!(await stat(filePath)).isFile()) {
    throw new Error('本地 HTML 不是普通文件')
  }
}
