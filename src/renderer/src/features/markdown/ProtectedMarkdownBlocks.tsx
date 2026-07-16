import { useEffect, useId, useState } from 'react'
import { mergeAttributes, Node } from '@tiptap/core'
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react'
import mermaid from 'mermaid'

type ProtectedToken = {
  type: string
  raw: string
  body?: string
}

let mermaidInitialized = false

function ensureMermaidInitialized(): void {
  if (mermaidInitialized) return
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    theme: 'dark',
    fontFamily: 'inherit',
  })
  mermaidInitialized = true
}

export const FrontmatterBlock = Node.create({
  name: 'frontmatterBlock',
  group: 'block',
  atom: true,
  selectable: true,
  priority: 1200,

  addAttributes() {
    return {
      body: { default: '' },
    }
  },

  parseHTML() {
    return [{ tag: 'section[data-markdown-block="frontmatter"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'section',
      mergeAttributes(HTMLAttributes, {
        'data-markdown-block': 'frontmatter',
        class: 'markdown-protected-block frontmatter',
      }),
    ]
  },

  markdownTokenizer: {
    name: 'frontmatterBlock',
    level: 'block' as const,
    start: (source: string) => (source.startsWith('---\n') ? 0 : -1),
    tokenize(source: string) {
      const match = /^---\s*\n([\s\S]*?)\n---(?:\n|$)/.exec(source)
      if (!match) return undefined
      return {
        type: 'frontmatterBlock',
        raw: match[0],
        body: match[1],
      }
    },
  },

  parseMarkdown(token, helpers) {
    const parsed = token as ProtectedToken
    return helpers.createNode('frontmatterBlock', { body: parsed.body ?? '' })
  },

  renderMarkdown(node) {
    return `---\n${String(node.attrs?.body ?? '')}\n---`
  },

  addNodeView() {
    return ReactNodeViewRenderer(FrontmatterNodeView)
  },
})

export const MermaidBlock = Node.create({
  name: 'mermaidBlock',
  group: 'block',
  atom: true,
  selectable: true,
  priority: 1150,

  addAttributes() {
    return {
      source: { default: '' },
    }
  },

  parseHTML() {
    return [{ tag: 'section[data-markdown-block="mermaid"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'section',
      mergeAttributes(HTMLAttributes, {
        'data-markdown-block': 'mermaid',
        class: 'markdown-protected-block mermaid',
      }),
    ]
  },

  markdownTokenizer: {
    name: 'mermaidBlock',
    level: 'block' as const,
    start(source: string) {
      return source.search(/^ {0,3}```mermaid\s*$/m)
    },
    tokenize(source: string) {
      const match = /^ {0,3}```mermaid\s*\n([\s\S]*?)\n {0,3}```(?:\n|$)/.exec(source)
      if (!match) return undefined
      return {
        type: 'mermaidBlock',
        raw: match[0],
        body: match[1],
      }
    },
  },

  parseMarkdown(token, helpers) {
    const parsed = token as ProtectedToken
    return helpers.createNode('mermaidBlock', { source: parsed.body ?? '' })
  },

  renderMarkdown(node) {
    return `\`\`\`mermaid\n${String(node.attrs?.source ?? '')}\n\`\`\``
  },

  addNodeView() {
    return ReactNodeViewRenderer(MermaidNodeView)
  },
})

export const RawMarkdownBlock = Node.create({
  name: 'rawMarkdownBlock',
  group: 'block',
  atom: true,
  selectable: true,
  priority: 1100,

  addAttributes() {
    return {
      raw: { default: '' },
    }
  },

  parseHTML() {
    return [{ tag: 'section[data-markdown-block="raw"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'section',
      mergeAttributes(HTMLAttributes, {
        'data-markdown-block': 'raw',
        class: 'markdown-protected-block raw',
      }),
    ]
  },

  markdownTokenizer: {
    name: 'rawMarkdownBlock',
    level: 'block' as const,
    start(source: string) {
      return source.search(/^\s*<(?:!--|\/?[A-Za-z][A-Za-z0-9:-]*(?:\s|>|\/))/m)
    },
    tokenize(source: string) {
      if (!/^\s*<(?:!--|\/?[A-Za-z][A-Za-z0-9:-]*(?:\s|>|\/))/.test(source)) {
        return undefined
      }
      const boundary = source.search(/\n\s*\n/)
      const raw = boundary >= 0 ? source.slice(0, boundary + 1) : source
      return { type: 'rawMarkdownBlock', raw, body: raw.replace(/\n$/, '') }
    },
  },

  parseMarkdown(token, helpers) {
    const parsed = token as ProtectedToken
    return helpers.createNode('rawMarkdownBlock', { raw: parsed.body ?? parsed.raw })
  },

  renderMarkdown(node) {
    return String(node.attrs?.raw ?? '')
  },

  addNodeView() {
    return ReactNodeViewRenderer(RawMarkdownNodeView)
  },
})

function FrontmatterNodeView({
  node,
  updateAttributes,
  selected,
}: NodeViewProps): React.ReactElement {
  return (
    <NodeViewWrapper
      as="section"
      className={`markdown-protected-card frontmatter${selected ? ' selected' : ''}`}
      data-markdown-block="frontmatter"
    >
      <div className="markdown-protected-label">Frontmatter</div>
      <textarea
        value={String(node.attrs.body ?? '')}
        onChange={(event) => updateAttributes({ body: event.target.value })}
        spellCheck={false}
      />
    </NodeViewWrapper>
  )
}

function RawMarkdownNodeView({
  node,
  updateAttributes,
  selected,
}: NodeViewProps): React.ReactElement {
  return (
    <NodeViewWrapper
      as="section"
      className={`markdown-protected-card raw${selected ? ' selected' : ''}`}
      data-markdown-block="raw"
    >
      <div className="markdown-protected-label">原始 Markdown / HTML</div>
      <textarea
        value={String(node.attrs.raw ?? '')}
        onChange={(event) => updateAttributes({ raw: event.target.value })}
        spellCheck={false}
      />
    </NodeViewWrapper>
  )
}

function MermaidNodeView({ node, updateAttributes, selected }: NodeViewProps): React.ReactElement {
  const source = String(node.attrs.source ?? '')
  const reactId = useId().replace(/:/g, '')
  const [svg, setSvg] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    ensureMermaidInitialized()
    if (!source.trim()) {
      setSvg('')
      setError('')
      return
    }
    void mermaid
      .render(`markdown-mermaid-${reactId}`, source)
      .then((result) => {
        if (cancelled) return
        setSvg(result.svg)
        setError('')
      })
      .catch((reason: unknown) => {
        if (cancelled) return
        setSvg('')
        setError(reason instanceof Error ? reason.message : 'Mermaid 渲染失败')
      })
    return () => {
      cancelled = true
    }
  }, [reactId, source])

  return (
    <NodeViewWrapper
      as="section"
      className={`markdown-protected-card mermaid${selected ? ' selected' : ''}`}
      data-markdown-block="mermaid"
    >
      <div className="markdown-protected-label">Mermaid</div>
      {svg ? (
        <div
          className="markdown-mermaid-preview"
          contentEditable={false}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      ) : (
        <div className={`markdown-mermaid-empty${error ? ' error' : ''}`}>
          {error || '输入 Mermaid 源码后显示图表'}
        </div>
      )}
      <textarea
        value={source}
        onChange={(event) => updateAttributes({ source: event.target.value })}
        spellCheck={false}
      />
    </NodeViewWrapper>
  )
}
