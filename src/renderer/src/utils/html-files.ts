export interface HtmlTabDraft {
  type: 'browser' | 'editor'
  title: string
  icon: string
  filePath: string
  initialUrl?: string
}

const HTML_EXTENSIONS = new Set(['.html', '.htm'])

export function isHtmlFileExtension(extension?: string): boolean {
  return HTML_EXTENSIONS.has(extension?.toLowerCase() ?? '')
}

export function isHtmlFilePath(filePath?: string): boolean {
  if (!filePath) return false
  const fileName = filePath.split(/[\\/]/).pop() ?? ''
  const extensionIndex = fileName.lastIndexOf('.')
  return extensionIndex >= 0 && isHtmlFileExtension(fileName.slice(extensionIndex))
}

export function toLocalFileUrl(filePath: string): string {
  const url = new URL('file:///')
  url.pathname = filePath
  return url.href
}

export function buildHtmlBrowserTabDraft(filePath: string, title: string): HtmlTabDraft {
  return {
    type: 'browser',
    title,
    icon: '🌐',
    filePath,
    initialUrl: toLocalFileUrl(filePath),
  }
}

export function buildHtmlTextTabDraft(filePath: string, title: string): HtmlTabDraft {
  return {
    type: 'editor',
    title,
    icon: '</>',
    filePath,
  }
}
