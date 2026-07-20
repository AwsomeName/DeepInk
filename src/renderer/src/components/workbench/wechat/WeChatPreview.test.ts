import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { buildWechatPreviewDocument, escapeHtmlText, WeChatPreviewFrame } from './WeChatPreview'

describe('WeChatPreview security boundary', () => {
  it('renders converted HTML in a zero-permission sandboxed frame', () => {
    const markup = renderToStaticMarkup(
      createElement(WeChatPreviewFrame, { html: '<script>globalThis.compromised = true</script>' }),
    )

    expect(markup).toContain('<iframe')
    expect(markup).toContain('sandbox=""')
    expect(markup).toContain('referrerPolicy="no-referrer"')
    expect(markup).not.toContain('allow-scripts')
    expect(markup).not.toContain('allow-same-origin')
  })

  it('applies a restrictive document CSP before preview content', () => {
    const document = buildWechatPreviewDocument('<p>preview</p>')

    expect(document).toContain("default-src 'none'")
    expect(document).toContain("base-uri 'none'")
    expect(document).toContain("form-action 'none'")
    expect(document.indexOf('Content-Security-Policy')).toBeLessThan(document.indexOf('<p>preview'))
  })

  it('escapes file names before writing them into saved HTML titles', () => {
    expect(escapeHtmlText('</title><script>alert(1)</script>')).toBe(
      '&lt;/title&gt;&lt;script&gt;alert(1)&lt;/script&gt;',
    )
  })
})
