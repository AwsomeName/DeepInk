export type MarkdownBlockKind =
  | 'frontmatter'
  | 'mermaid'
  | 'fence'
  | 'heading'
  | 'paragraph'
  | 'list'
  | 'blockquote'
  | 'table'
  | 'html'
  | 'horizontal-rule'

export interface MarkdownSourceBlock {
  kind: MarkdownBlockKind
  startLine: number
  endLine: number
  raw: string
  language?: string
}

export interface MarkdownDiagnostic {
  code:
    | 'source-only-mdx'
    | 'source-only-math'
    | 'source-only-footnote'
    | 'source-only-directive'
    | 'protected-block-changed'
    | 'source-map-mismatch'
  severity: 'info' | 'warning' | 'error'
  message: string
  startLine?: number
  endLine?: number
}

export interface MarkdownAnalysis {
  blocks: MarkdownSourceBlock[]
  diagnostics: MarkdownDiagnostic[]
  forceSourceMode: boolean
  safeToSave: boolean
}

export interface MarkdownSourceRange {
  startLine: number
  endLine: number
  startColumn: number
  endColumn: number
  selectedText: string
  sourceSnapshot: string
}

const FRONTMATTER_DELIMITER = /^---\s*$/
const FENCE_START = /^ {0,3}(`{3,}|~{3,})\s*([^`]*)$/
const HEADING = /^ {0,3}#{1,6}\s+/
const HORIZONTAL_RULE = /^ {0,3}((\*\s*){3,}|(-\s*){3,}|(_\s*){3,})$/
const LIST_ITEM = /^(\s*)([-+*]|\d+[.)])\s+/
const TABLE_DELIMITER = /^\s*\|?(\s*:?-{3,}:?\s*\|)+\s*:?-{3,}:?\s*\|?\s*$/
const BLOCKQUOTE = /^ {0,3}>/
const BLOCK_HTML = /^\s*<(?:!--|\/?[A-Za-z][A-Za-z0-9:-]*(?:\s|>|\/))/
const MDX_IMPORT_EXPORT = /^\s*(?:import|export)\s+.+(?:from\s+)?['"][^'"]+['"]/m
const MDX_COMPONENT = /^\s*<[A-Z][A-Za-z0-9.]*(?:\s|\/?>)/m
const MATH_BLOCK = /^\s*\$\$\s*$/m
const FOOTNOTE = /^\s*\[\^[^\]]+\]:/m
const DIRECTIVE = /^\s*:::{1,}\s*[A-Za-z]/m

export function normalizeMarkdownSource(source: string): string {
  return source.replace(/\r\n?/g, '\n')
}

export function scanMarkdownBlocks(source: string): MarkdownSourceBlock[] {
  const normalized = normalizeMarkdownSource(source)
  const lines = normalized.split('\n')
  const blocks: MarkdownSourceBlock[] = []
  let index = 0

  if (FRONTMATTER_DELIMITER.test(lines[0] ?? '')) {
    const end = findLine(lines, 1, (line) => FRONTMATTER_DELIMITER.test(line))
    if (end >= 1) {
      blocks.push(makeBlock('frontmatter', lines, 0, end))
      index = end + 1
    }
  }

  while (index < lines.length) {
    if (isBlank(lines[index])) {
      index += 1
      continue
    }

    const fence = FENCE_START.exec(lines[index])
    if (fence) {
      const marker = fence[1]
      const language = fence[2].trim().split(/\s+/)[0]?.toLowerCase() || undefined
      const closing = new RegExp(`^ {0,3}${escapeRegExp(marker[0])}{${marker.length},}\\s*$`)
      const end = findLine(lines, index + 1, (line) => closing.test(line))
      const last = end >= 0 ? end : lines.length - 1
      blocks.push(
        makeBlock(language === 'mermaid' ? 'mermaid' : 'fence', lines, index, last, language),
      )
      index = last + 1
      continue
    }

    if (HEADING.test(lines[index])) {
      blocks.push(makeBlock('heading', lines, index, index))
      index += 1
      continue
    }

    if (HORIZONTAL_RULE.test(lines[index])) {
      blocks.push(makeBlock('horizontal-rule', lines, index, index))
      index += 1
      continue
    }

    if (BLOCKQUOTE.test(lines[index])) {
      const end = consumeWhile(lines, index + 1, (line) => isBlank(line) || BLOCKQUOTE.test(line))
      const trimmedEnd = trimTrailingBlankLines(lines, index + 1, end)
      blocks.push(makeBlock('blockquote', lines, index, trimmedEnd - 1))
      index = trimmedEnd
      continue
    }

    if (LIST_ITEM.test(lines[index])) {
      const end = consumeList(lines, index)
      blocks.push(makeBlock('list', lines, index, end - 1))
      index = end
      continue
    }

    if (
      lines[index].includes('|') &&
      index + 1 < lines.length &&
      TABLE_DELIMITER.test(lines[index + 1])
    ) {
      const end = consumeWhile(lines, index + 2, (line) => !isBlank(line) && line.includes('|'))
      blocks.push(makeBlock('table', lines, index, end - 1))
      index = end
      continue
    }

    if (BLOCK_HTML.test(lines[index])) {
      const end = consumeWhile(lines, index + 1, (line) => !isBlank(line))
      blocks.push(makeBlock('html', lines, index, end - 1))
      index = end
      continue
    }

    const end = consumeWhile(lines, index + 1, (line, lineIndex) => {
      if (isBlank(line)) return false
      return !startsNewBlock(lines, lineIndex)
    })
    blocks.push(makeBlock('paragraph', lines, index, end - 1))
    index = end
  }

  return blocks
}

export function analyzeMarkdown(source: string, serialized?: string): MarkdownAnalysis {
  const normalized = normalizeMarkdownSource(source)
  const blocks = scanMarkdownBlocks(normalized)
  const diagnostics: MarkdownDiagnostic[] = []

  if (MDX_IMPORT_EXPORT.test(normalized) || MDX_COMPONENT.test(normalized)) {
    diagnostics.push({
      code: 'source-only-mdx',
      severity: 'warning',
      message: '检测到 MDX/JSX 语法，文档将使用源码模式以避免内容损失。',
    })
  }
  if (MATH_BLOCK.test(normalized) || /(^|[^\\])\$[^$\n]+\$/m.test(normalized)) {
    diagnostics.push({
      code: 'source-only-math',
      severity: 'info',
      message: '数学公式首轮只保证源码编辑。',
    })
  }
  if (FOOTNOTE.test(normalized)) {
    diagnostics.push({
      code: 'source-only-footnote',
      severity: 'info',
      message: '脚注首轮只保证源码编辑。',
    })
  }
  if (DIRECTIVE.test(normalized)) {
    diagnostics.push({
      code: 'source-only-directive',
      severity: 'info',
      message: 'Markdown directive 首轮只保证源码编辑。',
    })
  }

  if (serialized !== undefined) {
    diagnostics.push(...compareProtectedBlocks(normalized, normalizeMarkdownSource(serialized)))
  }

  const forceSourceMode = diagnostics.some((item) => item.code === 'source-only-mdx')
  const safeToSave = !diagnostics.some((item) => item.severity === 'error')
  return { blocks, diagnostics, forceSourceMode, safeToSave }
}

export function mapTopLevelSelectionToSource(
  markdown: string,
  startIndex: number,
  endIndex: number,
  selectedText: string,
  expectedBlockCount?: number,
): { range: MarkdownSourceRange | null; diagnostics: MarkdownDiagnostic[] } {
  const normalized = normalizeMarkdownSource(markdown)
  const blocks = scanMarkdownBlocks(normalized)
  const diagnostics: MarkdownDiagnostic[] = []
  if (
    typeof expectedBlockCount === 'number' &&
    expectedBlockCount > 0 &&
    blocks.length !== expectedBlockCount
  ) {
    diagnostics.push({
      code: 'source-map-mismatch',
      severity: 'warning',
      message: `Markdown 源码块数量 ${blocks.length} 与编辑器顶层节点 ${expectedBlockCount} 不一致，选区采用邻近块映射。`,
    })
  }
  if (blocks.length === 0) return { range: null, diagnostics }

  const safeStart = clamp(startIndex, 0, blocks.length - 1)
  const safeEnd = clamp(Math.max(startIndex, endIndex), safeStart, blocks.length - 1)
  const startBlock = blocks[safeStart]
  const endBlock = blocks[safeEnd]
  const lines = normalized.split('\n')
  return {
    range: {
      startLine: startBlock.startLine,
      endLine: endBlock.endLine,
      startColumn: 1,
      endColumn: (lines[endBlock.endLine - 1]?.length ?? 0) + 1,
      selectedText,
      sourceSnapshot: lines.slice(startBlock.startLine - 1, endBlock.endLine).join('\n'),
    },
    diagnostics,
  }
}

export function sourceRangeFromOffsets(
  source: string,
  anchor: number,
  head: number,
): MarkdownSourceRange | null {
  const normalized = normalizeMarkdownSource(source)
  const startOffset = clamp(Math.min(anchor, head), 0, normalized.length)
  const endOffset = clamp(Math.max(anchor, head), 0, normalized.length)
  if (startOffset === endOffset) return null

  const start = offsetToLineColumn(normalized, startOffset)
  const end = offsetToLineColumn(normalized, endOffset)
  const lines = normalized.split('\n')
  return {
    startLine: start.line,
    endLine: end.line,
    startColumn: start.column,
    endColumn: end.column,
    selectedText: normalized.slice(startOffset, endOffset),
    sourceSnapshot: lines.slice(start.line - 1, end.line).join('\n'),
  }
}

export function hashMarkdownSnapshot(value: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function compareProtectedBlocks(before: string, after: string): MarkdownDiagnostic[] {
  const beforeBlocks = scanMarkdownBlocks(before).filter(isProtectedBlock)
  const afterBlocks = scanMarkdownBlocks(after).filter(isProtectedBlock)
  const diagnostics: MarkdownDiagnostic[] = []

  for (const block of beforeBlocks) {
    if (
      afterBlocks.some((candidate) => candidate.kind === block.kind && candidate.raw === block.raw)
    ) {
      continue
    }
    diagnostics.push({
      code: 'protected-block-changed',
      severity: 'error',
      message: `${protectedBlockLabel(block.kind)} 未能原样保留，已阻止普通保存。`,
      startLine: block.startLine,
      endLine: block.endLine,
    })
  }
  return diagnostics
}

function isProtectedBlock(block: MarkdownSourceBlock): boolean {
  return block.kind === 'frontmatter' || block.kind === 'mermaid' || block.kind === 'html'
}

function protectedBlockLabel(kind: MarkdownBlockKind): string {
  if (kind === 'frontmatter') return 'Frontmatter'
  if (kind === 'mermaid') return 'Mermaid 块'
  return '原始 HTML 块'
}

function makeBlock(
  kind: MarkdownBlockKind,
  lines: string[],
  startIndex: number,
  endIndex: number,
  language?: string,
): MarkdownSourceBlock {
  return {
    kind,
    startLine: startIndex + 1,
    endLine: endIndex + 1,
    raw: lines.slice(startIndex, endIndex + 1).join('\n'),
    ...(language ? { language } : {}),
  }
}

function startsNewBlock(lines: string[], index: number): boolean {
  const line = lines[index] ?? ''
  if (
    FENCE_START.test(line) ||
    HEADING.test(line) ||
    HORIZONTAL_RULE.test(line) ||
    BLOCKQUOTE.test(line) ||
    LIST_ITEM.test(line) ||
    BLOCK_HTML.test(line)
  ) {
    return true
  }
  return Boolean(
    line.includes('|') && index + 1 < lines.length && TABLE_DELIMITER.test(lines[index + 1]),
  )
}

function consumeList(lines: string[], start: number): number {
  let index = start + 1
  while (index < lines.length) {
    const line = lines[index]
    if (LIST_ITEM.test(line) || isBlank(line) || /^\s{2,}\S/.test(line)) {
      index += 1
      continue
    }
    break
  }
  while (index > start + 1 && isBlank(lines[index - 1])) index -= 1
  return index
}

function trimTrailingBlankLines(lines: string[], minimum: number, end: number): number {
  let index = end
  while (index > minimum && isBlank(lines[index - 1])) index -= 1
  return index
}

function consumeWhile(
  lines: string[],
  start: number,
  predicate: (line: string, index: number) => boolean,
): number {
  let index = start
  while (index < lines.length && predicate(lines[index], index)) index += 1
  return index
}

function findLine(lines: string[], start: number, predicate: (line: string) => boolean): number {
  for (let index = start; index < lines.length; index += 1) {
    if (predicate(lines[index])) return index
  }
  return -1
}

function offsetToLineColumn(source: string, offset: number): { line: number; column: number } {
  const before = source.slice(0, offset)
  const line = before.split('\n').length
  const lastBreak = before.lastIndexOf('\n')
  return { line, column: offset - lastBreak }
}

function isBlank(line: string): boolean {
  return line.trim() === ''
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
