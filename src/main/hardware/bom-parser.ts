import { readFile } from 'node:fs/promises'
import { extname } from 'node:path'
import { XMLParser } from 'fast-xml-parser'
import * as yauzl from 'yauzl'
import type { HardwareTablePreview } from './types'

const REFERENCE_HEADER_HINTS = ['designator', 'reference', 'refdes', 'ref', '位号', '编号']

function detectDelimiter(line: string): string {
  const candidates = ['\t', ',', ';']
  return (
    candidates
      .map((delimiter) => ({ delimiter, count: line.split(delimiter).length }))
      .sort((a, b) => b.count - a.count)[0]?.delimiter ?? ','
  )
}

function parseDelimitedLine(line: string, delimiter: string): string[] {
  const cells: string[] = []
  let current = ''
  let quoted = false

  for (let index = 0; index < line.length; index++) {
    const char = line[index]
    const next = line[index + 1]
    if (char === '"' && quoted && next === '"') {
      current += '"'
      index++
      continue
    }
    if (char === '"') {
      quoted = !quoted
      continue
    }
    if (char === delimiter && !quoted) {
      cells.push(current.trim())
      current = ''
      continue
    }
    current += char
  }
  cells.push(current.trim())
  return cells
}

function extractReferenceTokens(value: string): string[] {
  return value
    .split(/[,，;；\s]+/)
    .map((item) => item.trim())
    .filter((item) => /^[A-Za-z]{1,6}\d+[A-Za-z0-9-]*$/.test(item))
}

function findReferenceColumn(headers: string[]): string | null {
  const normalized = headers.map((header) => header.trim().toLowerCase())
  const index = normalized.findIndex((header) =>
    REFERENCE_HEADER_HINTS.some((hint) => header === hint || header.includes(hint)),
  )
  return index >= 0 ? headers[index] : (headers[0] ?? null)
}

function unsupportedPreview(filePath: string, warning: string): HardwareTablePreview {
  return {
    filePath,
    headers: [],
    rows: [],
    referenceDesignators: [],
    unsupported: true,
    warning,
  }
}

function toArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return []
  return Array.isArray(value) ? value : [value]
}

function textValue(value: unknown): string {
  if (value === undefined || value === null) return ''
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  if (typeof value !== 'object') return ''
  const record = value as Record<string, unknown>
  if (record['#text'] !== undefined) return textValue(record['#text'])
  if (record.t !== undefined) return textValue(record.t)
  return ''
}

function columnIndex(cellRef: string | undefined): number {
  const letters = cellRef?.match(/^[A-Z]+/i)?.[0]?.toUpperCase()
  if (!letters) return 0
  let index = 0
  for (const char of letters) {
    index = index * 26 + (char.charCodeAt(0) - 64)
  }
  return Math.max(0, index - 1)
}

function readZipEntryText(filePath: string, entryName: string): Promise<string | null> {
  return new Promise((resolve, reject) => {
    yauzl.open(filePath, { lazyEntries: true }, (openError, zipFile) => {
      if (openError) {
        reject(openError)
        return
      }
      if (!zipFile) {
        resolve(null)
        return
      }

      zipFile.readEntry()
      zipFile.on('entry', (entry) => {
        if (entry.fileName !== entryName) {
          zipFile.readEntry()
          return
        }
        zipFile.openReadStream(entry, (streamError, stream) => {
          if (streamError || !stream) {
            reject(streamError ?? new Error(`无法读取 ${entryName}`))
            return
          }
          const chunks: Buffer[] = []
          stream.on('data', (chunk: Buffer) => chunks.push(chunk))
          stream.on('end', () => {
            zipFile.close()
            resolve(Buffer.concat(chunks).toString('utf-8'))
          })
          stream.on('error', reject)
        })
      })
      zipFile.on('end', () => resolve(null))
      zipFile.on('error', reject)
    })
  })
}

function parseSharedStrings(value: unknown): string[] {
  const root = value as { sst?: { si?: unknown } }
  return toArray(root.sst?.si).map((item) => {
    const si = item as Record<string, unknown>
    if (si.t !== undefined) return textValue(si.t)
    const richParts = toArray(si.r).map((part) => textValue((part as Record<string, unknown>).t))
    return richParts.join('')
  })
}

function cellValue(cell: Record<string, unknown>, sharedStrings: string[]): string {
  const type = typeof cell.t === 'string' ? cell.t : undefined
  if (type === 's') {
    const index = Number(textValue(cell.v))
    return Number.isFinite(index) ? (sharedStrings[index] ?? '') : ''
  }
  if (type === 'inlineStr') {
    return textValue((cell.is as Record<string, unknown> | undefined)?.t)
  }
  return textValue(cell.v)
}

async function parseXlsxTable(filePath: string): Promise<HardwareTablePreview> {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '',
    textNodeName: '#text',
  })
  const [sharedStringsXml, sheetXml] = await Promise.all([
    readZipEntryText(filePath, 'xl/sharedStrings.xml'),
    readZipEntryText(filePath, 'xl/worksheets/sheet1.xml'),
  ])

  if (!sheetXml) {
    return unsupportedPreview(filePath, 'xlsx 文件缺少 xl/worksheets/sheet1.xml，暂无法解析')
  }

  const sharedStrings = sharedStringsXml ? parseSharedStrings(parser.parse(sharedStringsXml)) : []
  const parsedSheet = parser.parse(sheetXml) as {
    worksheet?: { sheetData?: { row?: unknown } }
  }
  const parsedRows = toArray(parsedSheet.worksheet?.sheetData?.row)
    .map((row) => {
      const cells = toArray((row as Record<string, unknown>).c)
      const values: string[] = []
      for (const rawCell of cells) {
        const cell = rawCell as Record<string, unknown>
        values[columnIndex(typeof cell.r === 'string' ? cell.r : undefined)] = cellValue(
          cell,
          sharedStrings,
        )
      }
      return values.map((value) => value ?? '')
    })
    .filter((row) => row.some((value) => value.trim().length > 0))

  if (parsedRows.length === 0) {
    return {
      filePath,
      headers: [],
      rows: [],
      referenceDesignators: [],
      warning: 'xlsx 第一张表为空',
    }
  }

  const headers = parsedRows[0].map((header, index) => header || `列${index + 1}`)
  const referenceColumn = findReferenceColumn(headers)
  const rows = parsedRows
    .slice(1, 101)
    .map((cells) =>
      Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ''])),
    )

  const references = new Set<string>()
  if (referenceColumn) {
    for (const row of rows) {
      for (const token of extractReferenceTokens(row[referenceColumn] ?? '')) {
        references.add(token.toUpperCase())
      }
    }
  }

  return {
    filePath,
    headers,
    rows,
    referenceDesignators: [...references].sort((a, b) => a.localeCompare(b, 'en')),
  }
}

export async function parseHardwareTable(filePath: string): Promise<HardwareTablePreview> {
  const extension = extname(filePath).toLowerCase()
  if (extension === '.xlsx') {
    return parseXlsxTable(filePath)
  }
  if (extension === '.xls') {
    return unsupportedPreview(filePath, '当前版本只识别 xls 文件存在，暂不解析旧版 xls 内容')
  }

  const raw = await readFile(filePath, 'utf-8')
  const lines = raw
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  if (lines.length === 0) {
    return {
      filePath,
      headers: [],
      rows: [],
      referenceDesignators: [],
      warning: '文件为空',
    }
  }

  const delimiter = detectDelimiter(lines[0])
  const headers = parseDelimitedLine(lines[0], delimiter).map(
    (header, index) => header || `列${index + 1}`,
  )
  const referenceColumn = findReferenceColumn(headers)
  const rows = lines.slice(1, 101).map((line) => {
    const cells = parseDelimitedLine(line, delimiter)
    return Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? '']))
  })

  const references = new Set<string>()
  if (referenceColumn) {
    for (const row of rows) {
      for (const token of extractReferenceTokens(row[referenceColumn] ?? '')) {
        references.add(token.toUpperCase())
      }
    }
  }

  return {
    filePath,
    headers,
    rows,
    referenceDesignators: [...references].sort((a, b) => a.localeCompare(b, 'en')),
  }
}
