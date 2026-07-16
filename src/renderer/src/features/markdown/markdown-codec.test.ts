import { describe, expect, it } from 'vitest'
import {
  analyzeMarkdown,
  hashMarkdownSnapshot,
  mapTopLevelSelectionToSource,
  scanMarkdownBlocks,
  sourceRangeFromOffsets,
} from './markdown-codec'

describe('markdown-codec', () => {
  it('scans frontmatter, normal blocks, mermaid, tables and raw html in source order', () => {
    const source = [
      '---',
      'title: Demo',
      '---',
      '',
      '# 标题',
      '',
      '- A',
      '- B',
      '',
      '| A | B |',
      '| --- | --- |',
      '| 1 | 2 |',
      '',
      '```mermaid',
      'graph TD',
      '  A --> B',
      '```',
      '',
      '<details>',
      '<summary>更多</summary>',
      '</details>',
    ].join('\n')

    expect(scanMarkdownBlocks(source).map((block) => block.kind)).toEqual([
      'frontmatter',
      'heading',
      'list',
      'table',
      'mermaid',
      'html',
    ])
  })

  it('maps ordered editor nodes to markdown lines without searching duplicate text', () => {
    const source = ['重复', '', '重复', '', '> 重复', '', '```ts', '重复', '```'].join('\n')
    const result = mapTopLevelSelectionToSource(source, 1, 2, '重复')

    expect(result.range).toMatchObject({
      startLine: 3,
      endLine: 5,
      selectedText: '重复',
      sourceSnapshot: ['重复', '', '> 重复'].join('\n'),
    })
  })

  it('computes exact source ranges from CodeMirror offsets', () => {
    const source = '第一行\n第二行内容\n第三行'
    const start = source.indexOf('二')
    const end = source.indexOf('容') + 1

    expect(sourceRangeFromOffsets(source, start, end)).toEqual({
      startLine: 2,
      endLine: 2,
      startColumn: 2,
      endColumn: 6,
      selectedText: '二行内容',
      sourceSnapshot: '第二行内容',
    })
  })

  it('forces source mode for MDX but keeps math and footnotes as informational diagnostics', () => {
    const mdx = analyzeMarkdown("import Card from './Card'\n\n<Card />")
    expect(mdx.forceSourceMode).toBe(true)

    const extended = analyzeMarkdown('$$\nx = 1\n$$\n\n[^a]: note')
    expect(extended.forceSourceMode).toBe(false)
    expect(extended.diagnostics.map((item) => item.code)).toEqual([
      'source-only-math',
      'source-only-footnote',
    ])
  })

  it('blocks saving when a protected block disappears during serialization', () => {
    const before = ['---', 'title: Demo', '---', '', '# Heading'].join('\n')
    const after = '# Heading'
    const analysis = analyzeMarkdown(before, after)

    expect(analysis.safeToSave).toBe(false)
    expect(analysis.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'protected-block-changed', severity: 'error' }),
    )
  })

  it('creates stable compact snapshot hashes', () => {
    expect(hashMarkdownSnapshot('same')).toBe(hashMarkdownSnapshot('same'))
    expect(hashMarkdownSnapshot('same')).not.toBe(hashMarkdownSnapshot('other'))
  })
})
