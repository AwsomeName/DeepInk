import { describe, expect, it } from 'vitest'
import { convertMarkdownToWechatHTML } from './convert'

describe('convertMarkdownToWechatHTML', () => {
  it('escapes raw HTML and rejects script-capable Markdown links', () => {
    const html = convertMarkdownToWechatHTML(`
# Safe heading

<script>globalThis.compromised = true</script>
<img src="x" onerror="globalThis.compromised = true">
[unsafe](javascript:globalThis.compromised=true)
`)

    expect(html).toContain('Safe heading')
    expect(html).not.toContain('<script')
    expect(html).not.toContain('<img')
    expect(html).not.toMatch(/<[^>]+\sonerror=/i)
    expect(html).not.toContain('href="javascript:')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('onerror=&quot;globalThis.compromised = true&quot;')
  })

  it('keeps generated Markdown formatting available for copy and save', () => {
    const html = convertMarkdownToWechatHTML('**bold** and [safe](https://example.com)')

    expect(html).toContain('<strong')
    expect(html).toContain('bold</strong>')
    expect(html).toContain('href="https://example.com"')
  })
})
