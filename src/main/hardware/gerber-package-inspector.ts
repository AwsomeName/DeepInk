import * as yauzl from 'yauzl'
import type {
  GerberLayerCandidate,
  GerberLayerKind,
  GerberLayerPreview,
  GerberPackageInspection,
} from './types'

interface ZipEntryPreview {
  name: string
  byteSize: number
  sample: string
}

const SAMPLE_BYTES = 8_192
const PREVIEW_BYTES = 64 * 1024
const GEOMETRY_BYTES = 2 * 1024 * 1024

function readZipEntryPreviews(filePath: string): Promise<ZipEntryPreview[]> {
  return new Promise((resolve, reject) => {
    yauzl.open(filePath, { lazyEntries: true }, (openError, zipFile) => {
      if (openError) {
        reject(openError)
        return
      }
      if (!zipFile) {
        reject(new Error('无法打开 Gerber zip'))
        return
      }

      const entries: ZipEntryPreview[] = []

      const readNext = (): void => zipFile.readEntry()

      zipFile.on('entry', (entry) => {
        if (entry.fileName.endsWith('/')) {
          readNext()
          return
        }

        zipFile.openReadStream(entry, (streamError, stream) => {
          if (streamError || !stream) {
            reject(streamError ?? new Error(`无法读取 zip 条目: ${entry.fileName}`))
            return
          }

          const chunks: Buffer[] = []
          let collected = 0

          stream.on('data', (chunk: Buffer) => {
            if (collected < SAMPLE_BYTES) {
              const slice = chunk.subarray(0, Math.max(0, SAMPLE_BYTES - collected))
              chunks.push(slice)
              collected += slice.length
            }
          })
          stream.on('end', () => {
            entries.push({
              name: entry.fileName,
              byteSize: entry.uncompressedSize,
              sample: Buffer.concat(chunks).toString('utf-8'),
            })
            readNext()
          })
          stream.on('error', reject)
        })
      })

      zipFile.on('end', () => resolve(entries))
      zipFile.on('error', reject)
      readNext()
    })
  })
}

function readGerberLayerContent(
  packagePath: string,
  entryName: string,
  byteLimit: number,
): Promise<GerberLayerPreview> {
  return new Promise((resolve, reject) => {
    yauzl.open(packagePath, { lazyEntries: true }, (openError, zipFile) => {
      if (openError) {
        reject(openError)
        return
      }
      if (!zipFile) {
        reject(new Error('无法打开 Gerber zip'))
        return
      }

      let settled = false
      const finish = (result: GerberLayerPreview): void => {
        if (settled) return
        settled = true
        zipFile.close()
        resolve(result)
      }
      const fail = (error: Error): void => {
        if (settled) return
        settled = true
        zipFile.close()
        reject(error)
      }
      const readNext = (): void => zipFile.readEntry()

      zipFile.on('entry', (entry) => {
        if (entry.fileName !== entryName || entry.fileName.endsWith('/')) {
          readNext()
          return
        }

        zipFile.openReadStream(entry, (streamError, stream) => {
          if (streamError || !stream) {
            fail(streamError ?? new Error(`无法读取 zip 条目: ${entry.fileName}`))
            return
          }

          const chunks: Buffer[] = []
          let collected = 0

          stream.on('data', (chunk: Buffer) => {
            if (collected < byteLimit) {
              const slice = chunk.subarray(0, Math.max(0, byteLimit - collected))
              chunks.push(slice)
              collected += slice.length
            }
          })
          stream.on('end', () =>
            finish({
              packagePath,
              entry: entry.fileName,
              content: Buffer.concat(chunks).toString('utf-8'),
              byteSize: entry.uncompressedSize,
              truncated: entry.uncompressedSize > byteLimit,
            }),
          )
          stream.on('error', fail)
        })
      })

      zipFile.on('end', () => fail(new Error(`Gerber zip 中未找到条目: ${entryName}`)))
      zipFile.on('error', fail)
      readNext()
    })
  })
}

export function readGerberLayerPreview(
  packagePath: string,
  entryName: string,
): Promise<GerberLayerPreview> {
  return readGerberLayerContent(packagePath, entryName, PREVIEW_BYTES)
}

export function readGerberLayerGeometryContent(
  packagePath: string,
  entryName: string,
): Promise<GerberLayerPreview> {
  return readGerberLayerContent(packagePath, entryName, GEOMETRY_BYTES)
}

function hasAny(value: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(value))
}

function detectByName(name: string): { kind: GerberLayerKind; score: number; reason: string } {
  const lower = name.toLowerCase()

  if (hasAny(lower, [/\.(gm1|gko|gml|gmb|gpb)$/i, /outline/, /edge/, /profile/, /board.?outline/, /外形/])) {
    return { kind: 'outline', score: 0.82, reason: '文件名像外形/机械层' }
  }
  if (hasAny(lower, [/\.(gtl|gbl|g[0-9]+)$/i, /copper/, /top.*layer/, /bottom.*layer/, /inner/])) {
    return { kind: 'copper', score: 0.78, reason: '文件名像铜层' }
  }
  if (hasAny(lower, [/\.(gts|gbs)$/i, /mask/, /solder.?mask/, /阻焊/])) {
    return { kind: 'solder-mask', score: 0.76, reason: '文件名像阻焊层' }
  }
  if (hasAny(lower, [/\.(gto|gbo)$/i, /silk/, /legend/, /overlay/, /丝印/])) {
    return { kind: 'silkscreen', score: 0.74, reason: '文件名像丝印层' }
  }
  if (hasAny(lower, [/\.(drl|xln)$/i, /drill/, /pth/, /npth/, /孔/])) {
    return { kind: 'drill', score: 0.84, reason: '文件名像钻孔文件' }
  }
  if (hasAny(lower, [/mechanical/, /fab/, /drawing/])) {
    return { kind: 'mechanical', score: 0.58, reason: '文件名像机械/制造说明层' }
  }
  return { kind: 'unknown', score: 0.12, reason: '文件名无法判断层类型' }
}

function isGerberLike(sample: string): boolean {
  return /%FS|%MO|%ADD|D0[123]\*|G0[123]\*/.test(sample)
}

function isDrillLike(sample: string): boolean {
  return /M48|INCH|METRIC|T\d+C|X[-+]?\d+Y[-+]?\d+/.test(sample)
}

function contentReasons(kind: GerberLayerKind, sample: string): { score: number; reasons: string[] } {
  const reasons: string[] = []
  let score = 0

  if (isGerberLike(sample)) {
    score += 0.12
    reasons.push('内容包含 Gerber 命令')
  }
  if (isDrillLike(sample)) {
    score += kind === 'drill' ? 0.14 : 0.04
    reasons.push('内容包含钻孔格式线索')
  }
  if (/G36\*|G37\*/.test(sample)) {
    score += 0.04
    reasons.push('内容包含 Gerber region')
  }
  if (/D03\*/.test(sample)) {
    score += 0.03
    reasons.push('内容包含 flash/pad 命令')
  }

  return { score, reasons }
}

function classifyLayer(entry: ZipEntryPreview): GerberLayerCandidate {
  const byName = detectByName(entry.name)
  const byContent = contentReasons(byName.kind, entry.sample)
  const gerberLike = isGerberLike(entry.sample) || isDrillLike(entry.sample)
  const confidence = Math.min(0.99, byName.score + byContent.score)

  return {
    entry: entry.name,
    kind: byName.kind,
    confidence,
    reasons: [byName.reason, ...byContent.reasons],
    gerberLike,
    byteSize: entry.byteSize,
  }
}

function buildLayerHints(
  layers: GerberLayerCandidate[],
): GerberPackageInspection['layerHints'] {
  return {
    copper: layers.filter((layer) => layer.kind === 'copper').map((layer) => layer.entry),
    solderMask: layers.filter((layer) => layer.kind === 'solder-mask').map((layer) => layer.entry),
    silkscreen: layers.filter((layer) => layer.kind === 'silkscreen').map((layer) => layer.entry),
    drill: layers.filter((layer) => layer.kind === 'drill').map((layer) => layer.entry),
    outline: layers.filter((layer) => layer.kind === 'outline').map((layer) => layer.entry),
    other: layers
      .filter((layer) => layer.kind === 'unknown' || layer.kind === 'mechanical')
      .map((layer) => layer.entry),
  }
}

export async function inspectGerberPackage(filePath: string): Promise<GerberPackageInspection> {
  const entries = await readZipEntryPreviews(filePath)
  const layers = entries
    .map(classifyLayer)
    .sort((a, b) => b.confidence - a.confidence || a.entry.localeCompare(b.entry))

  return {
    filePath,
    entries: entries.map((entry) => entry.name),
    layers,
    layerHints: buildLayerHints(layers),
  }
}
