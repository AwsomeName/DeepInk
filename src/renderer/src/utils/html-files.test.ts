import { describe, expect, it } from 'vitest'
import {
  buildHtmlBrowserTabDraft,
  buildHtmlTextTabDraft,
  isHtmlFileExtension,
  isHtmlFilePath,
  toLocalFileUrl,
} from './html-files'

describe('html-files', () => {
  it('识别 html 和 htm 文件', () => {
    expect(isHtmlFileExtension('.html')).toBe(true)
    expect(isHtmlFileExtension('.HTM')).toBe(true)
    expect(isHtmlFileExtension('.md')).toBe(false)
    expect(isHtmlFilePath('/project/public/index.html')).toBe(true)
    expect(isHtmlFilePath('/project/public/index.HTM')).toBe(true)
    expect(isHtmlFilePath('/project/public/demo #1.html')).toBe(true)
    expect(isHtmlFilePath('/project/public/index.html.txt')).toBe(false)
  })

  it('安全编码本地文件 URL', () => {
    expect(toLocalFileUrl('/Users/test/中文 #1/index.html')).toBe(
      'file:///Users/test/%E4%B8%AD%E6%96%87%20%231/index.html',
    )
  })

  it('默认浏览器草案和文本草案共享文件归属', () => {
    const browser = buildHtmlBrowserTabDraft('/project/index.html', 'index.html')
    const text = buildHtmlTextTabDraft('/project/index.html', 'index.html')

    expect(browser).toMatchObject({
      type: 'browser',
      filePath: '/project/index.html',
      initialUrl: 'file:///project/index.html',
    })
    expect(text).toMatchObject({ type: 'editor', filePath: '/project/index.html' })
  })
})
