import { mkdir, mkdtemp, readFile, rm, truncate, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const electronMock = vi.hoisted(() => ({ home: '' }))

vi.mock('electron', () => ({
  app: {
    getPath: () => electronMock.home,
  },
}))

import { FileService } from './file-service'

let tempDir = ''

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'cclink-studio-fs-'))
  electronMock.home = tempDir
})

afterEach(async () => {
  if (tempDir) await rm(tempDir, { recursive: true, force: true })
})

describe('FileService', () => {
  it('reads markdown as UTF-8 text', async () => {
    const service = new FileService()
    const filePath = join(tempDir, 'README.md')
    await writeFile(filePath, '# CCLink Studio', 'utf-8')

    await expect(service.readFile(filePath)).resolves.toEqual({
      content: '# CCLink Studio',
      encoding: 'utf-8',
    })
  })

  it('reads text documents with stable version fingerprints', async () => {
    const service = new FileService()
    const filePath = join(tempDir, 'README.md')
    await writeFile(filePath, '# CCLink Studio', 'utf-8')

    const first = await service.readTextDocument(filePath)
    const second = await service.readTextDocument(filePath)

    expect(first).toMatchObject({
      path: filePath,
      content: '# CCLink Studio',
      size: Buffer.byteLength('# CCLink Studio'),
    })
    expect(first.hash).toHaveLength(64)
    expect(second.hash).toBe(first.hash)
  })

  it('atomically saves text documents and reports external conflicts', async () => {
    const service = new FileService()
    const filePath = join(tempDir, 'README.md')
    await writeFile(filePath, 'version one', 'utf-8')
    const opened = await service.readTextDocument(filePath)

    await writeFile(filePath, 'external edit', 'utf-8')
    await expect(
      service.saveTextDocument({
        filePath,
        content: 'studio edit',
        expectedHash: opened.hash,
      }),
    ).resolves.toMatchObject({
      status: 'conflict',
      current: { content: 'external edit' },
    })
    await expect(readFile(filePath, 'utf-8')).resolves.toBe('external edit')

    await expect(
      service.saveTextDocument({
        filePath,
        content: 'studio edit',
        expectedHash: opened.hash,
        force: true,
      }),
    ).resolves.toMatchObject({
      status: 'saved',
      snapshot: { content: 'studio edit' },
    })
    await expect(readFile(filePath, 'utf-8')).resolves.toBe('studio edit')
  })

  it('copies and writes images into a non-overwriting document asset directory', async () => {
    const service = new FileService()
    const documentPath = join(tempDir, 'notes.md')
    const sourcePath = join(tempDir, 'diagram.png')
    await writeFile(documentPath, '# Notes', 'utf-8')
    await writeFile(sourcePath, Buffer.from([1, 2, 3]))

    const imported = await service.importDocumentAsset(documentPath, sourcePath)
    const pasted = await service.saveDocumentAsset({
      documentPath,
      fileName: 'diagram.png',
      mimeType: 'image/png',
      content: Buffer.from([4, 5, 6]).toString('base64'),
      encoding: 'base64',
    })

    expect(imported.relativePath).toBe('.assets/notes/diagram.png')
    expect(pasted.relativePath).toBe('.assets/notes/diagram-1.png')
    await expect(readFile(imported.path)).resolves.toEqual(Buffer.from([1, 2, 3]))
    await expect(readFile(pasted.path)).resolves.toEqual(Buffer.from([4, 5, 6]))
  })

  it('checks directories without throwing for missing paths', async () => {
    const service = new FileService()
    const dirPath = join(tempDir, 'workspace')
    const filePath = join(tempDir, 'note.txt')
    await mkdir(dirPath)
    await writeFile(filePath, 'note', 'utf-8')

    await expect(service.isDirectory(dirPath)).resolves.toBe(true)
    await expect(service.isDirectory(filePath)).resolves.toBe(false)
    await expect(service.isDirectory(join(tempDir, 'missing'))).resolves.toBe(false)
  })

  it.each([
    '.3mf',
    '.stl',
    '.glb',
    '.doc',
    '.docx',
    '.xls',
    '.xlsx',
    '.ppt',
    '.pptx',
    '.odt',
    '.ods',
    '.odp',
    '.pages',
    '.numbers',
    '.key',
    '.mp4',
    '.mov',
    '.webm',
    '.m4v',
    '.mp3',
    '.wav',
    '.zip',
    '.tar',
    '.7z',
    '.rar',
    '.pdf',
    '.png',
  ])('reads binary file %s as base64', async (extension) => {
    const service = new FileService()
    const filePath = join(tempDir, `asset${extension}`)
    const content = Buffer.from([0x00, 0xff, 0x10, 0x20])
    await mkdir(tempDir, { recursive: true })
    await writeFile(filePath, content)

    await expect(service.readFile(filePath)).resolves.toEqual({
      content: content.toString('base64'),
      encoding: 'base64',
    })
  })

  it('renders image files as image previews', async () => {
    const service = new FileService()
    const filePath = join(tempDir, 'pixel.png')
    const content = Buffer.from([0x89, 0x50, 0x4e, 0x47])
    await writeFile(filePath, content)

    await expect(service.renderFile(filePath)).resolves.toMatchObject({
      kind: 'image',
      content: content.toString('base64'),
      encoding: 'base64',
      mimeType: 'image/png',
      fileName: 'pixel.png',
    })
  })

  it('renders pdf files as pdf previews', async () => {
    const service = new FileService()
    const filePath = join(tempDir, 'brief.pdf')
    const content = Buffer.from('%PDF-1.7\n', 'utf-8')
    await writeFile(filePath, content)

    await expect(service.renderFile(filePath)).resolves.toMatchObject({
      kind: 'pdf',
      content: content.toString('base64'),
      encoding: 'base64',
      mimeType: 'application/pdf',
      fileName: 'brief.pdf',
    })
  })

  it('renders native media files as playable previews', async () => {
    const service = new FileService()
    const filePath = join(tempDir, 'clip.mp4')
    const content = Buffer.from([0x00, 0x00, 0x00, 0x18])
    await writeFile(filePath, content)

    await expect(service.renderFile(filePath)).resolves.toMatchObject({
      kind: 'media',
      mediaKind: 'video',
      playable: true,
      content: content.toString('base64'),
      encoding: 'base64',
      mimeType: 'video/mp4',
      fileName: 'clip.mp4',
    })
  })

  it('does not inline videos larger than 300MB', async () => {
    const service = new FileService()
    const filePath = join(tempDir, 'large.mp4')
    await writeFile(filePath, Buffer.alloc(0))
    await truncate(filePath, 300 * 1024 * 1024 + 1)

    await expect(service.renderFile(filePath)).resolves.toMatchObject({
      kind: 'media',
      mediaKind: 'video',
      playable: false,
      mimeType: 'video/mp4',
      fileName: 'large.mp4',
    })
  })

  it('renders docx files as read-only office previews', async () => {
    const service = new FileService()
    const filePath = join(tempDir, 'note.docx')
    await writeFile(
      filePath,
      createStoredZip([
        {
          name: 'word/document.xml',
          content: Buffer.from(
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
              '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
              '<w:body>' +
              '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>标题</w:t></w:r></w:p>' +
              '<w:p><w:r><w:t>第一段正文</w:t></w:r></w:p>' +
              '<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/></w:numPr></w:pPr><w:r><w:t>列表项</w:t></w:r></w:p>' +
              '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>A1</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>B1</w:t></w:r></w:p></w:tc></w:tr></w:tbl>' +
              '</w:body>' +
              '</w:document>',
            'utf-8',
          ),
        },
      ]),
    )

    await expect(service.renderFile(filePath)).resolves.toMatchObject({
      kind: 'office-preview',
      officeKind: 'word',
      fileName: 'note.docx',
      blocks: [
        { type: 'heading', level: 1, text: '标题' },
        { type: 'paragraph', text: '第一段正文' },
        { type: 'list-item', text: '列表项' },
        { type: 'table', rows: [['A1', 'B1']] },
      ],
    })
  })

  it('renders pptx files as read-only office previews', async () => {
    const service = new FileService()
    const filePath = join(tempDir, 'deck.pptx')
    await writeFile(
      filePath,
      createStoredZip([
        {
          name: 'ppt/slides/slide2.xml',
          content: Buffer.from(
            '<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">' +
              '<p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>第二页标题</a:t></a:r></a:p><a:p><a:r><a:t>第二页要点</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld>' +
              '</p:sld>',
            'utf-8',
          ),
        },
        {
          name: 'ppt/slides/slide1.xml',
          content: Buffer.from(
            '<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">' +
              '<p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>第一页标题</a:t></a:r></a:p><a:p><a:r><a:t>第一页要点</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld>' +
              '</p:sld>',
            'utf-8',
          ),
        },
      ]),
    )

    await expect(service.renderFile(filePath)).resolves.toMatchObject({
      kind: 'office-preview',
      officeKind: 'presentation',
      fileName: 'deck.pptx',
      blocks: [
        { type: 'slide', index: 1, title: '第一页标题', lines: ['第一页要点'] },
        { type: 'slide', index: 2, title: '第二页标题', lines: ['第二页要点'] },
      ],
    })
  })

  it.each(['.doc', '.xls', '.xlsx', '.ppt', '.odt', '.ods', '.odp'])(
    'renders office file %s as unsupported until S-level WYSIWYG is designed',
    async (extension) => {
      const service = new FileService()
      const filePath = join(tempDir, `office${extension}`)
      await writeFile(filePath, Buffer.from([0xd0, 0xcf, 0x11, 0xe0]))

      await expect(service.renderFile(filePath)).resolves.toMatchObject({
        kind: 'unsupported',
        fileName: `office${extension}`,
      })
    },
  )

  it('renders legacy doc files as unsupported instead of text garbage', async () => {
    const service = new FileService()
    const filePath = join(tempDir, 'legacy.doc')
    await writeFile(filePath, Buffer.from([0xd0, 0xcf, 0x11, 0xe0]))

    await expect(service.renderFile(filePath)).resolves.toMatchObject({
      kind: 'unsupported',
      fileName: 'legacy.doc',
    })
  })

  it('renders zip files as unsupported preview with extract guidance', async () => {
    const service = new FileService()
    const filePath = join(tempDir, 'assets.zip')
    await writeFile(
      filePath,
      createStoredZip([
        {
          name: 'images/',
          content: Buffer.from(''),
        },
        {
          name: 'images/a.png',
          content: Buffer.from([1, 2, 3]),
        },
      ]),
    )

    await expect(service.renderFile(filePath)).resolves.toMatchObject({
      kind: 'unsupported',
      fileName: 'assets.zip',
      reason: expect.stringContaining('右键'),
    })
  })

  it('extracts zip files to a same-name sibling directory', async () => {
    const service = new FileService()
    const filePath = join(tempDir, 'assets.zip')
    await writeFile(
      filePath,
      createStoredZip([
        {
          name: 'images/',
          content: Buffer.from(''),
        },
        {
          name: 'images/a.png',
          content: Buffer.from([1, 2, 3]),
        },
      ]),
    )

    await expect(service.extractZip(filePath)).resolves.toEqual({
      targetDir: join(tempDir, 'assets'),
      extracted: 1,
    })
    await expect(readFile(join(tempDir, 'assets/images/a.png'))).resolves.toEqual(
      Buffer.from([1, 2, 3]),
    )
  })

  it('extracts zip files to a numbered directory when the target exists', async () => {
    const service = new FileService()
    const filePath = join(tempDir, 'assets.zip')
    await mkdir(join(tempDir, 'assets'))
    await writeFile(
      filePath,
      createStoredZip([
        {
          name: 'a.txt',
          content: Buffer.from('hello', 'utf-8'),
        },
      ]),
    )

    await expect(service.extractZip(filePath)).resolves.toEqual({
      targetDir: join(tempDir, 'assets-1'),
      extracted: 1,
    })
    await expect(readFile(join(tempDir, 'assets-1/a.txt'), 'utf-8')).resolves.toBe('hello')
  })

  it('rejects zip slip entries during extraction', async () => {
    const service = new FileService()
    const filePath = join(tempDir, 'evil.zip')
    await writeFile(
      filePath,
      createStoredZip([
        {
          name: '../evil.txt',
          content: Buffer.from('nope', 'utf-8'),
        },
      ]),
    )

    await expect(service.extractZip(filePath)).rejects.toThrow(/非法路径|invalid relative path/)
  })

  it.each(['.pages', '.numbers', '.key', '.tar', '.7z', '.rar'])(
    'renders unsupported recognized file %s without text garbage',
    async (extension) => {
      const service = new FileService()
      const filePath = join(tempDir, `asset${extension}`)
      await writeFile(filePath, Buffer.from([0x00, 0xff, 0x10, 0x20]))

      await expect(service.renderFile(filePath)).resolves.toMatchObject({
        kind: 'unsupported',
        fileName: `asset${extension}`,
      })
    },
  )
})

function createStoredZip(entries: Array<{ name: string; content: Buffer }>): Buffer {
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf-8')
    const crc = crc32(entry.content)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0, 6)
    local.writeUInt16LE(0, 8)
    local.writeUInt16LE(0, 10)
    local.writeUInt16LE(0, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(entry.content.length, 18)
    local.writeUInt32LE(entry.content.length, 22)
    local.writeUInt16LE(name.length, 26)
    local.writeUInt16LE(0, 28)
    locals.push(local, name, entry.content)

    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(0, 8)
    central.writeUInt16LE(0, 10)
    central.writeUInt16LE(0, 12)
    central.writeUInt16LE(0, 14)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(entry.content.length, 20)
    central.writeUInt32LE(entry.content.length, 24)
    central.writeUInt16LE(name.length, 28)
    central.writeUInt16LE(0, 30)
    central.writeUInt16LE(0, 32)
    central.writeUInt16LE(0, 34)
    central.writeUInt16LE(0, 36)
    central.writeUInt32LE(0, 38)
    central.writeUInt32LE(offset, 42)
    centrals.push(central, name)

    offset += local.length + name.length + entry.content.length
  }

  const centralStart = offset
  const centralDirectory = Buffer.concat(centrals)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(0, 4)
  end.writeUInt16LE(0, 6)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(centralDirectory.length, 12)
  end.writeUInt32LE(centralStart, 16)
  end.writeUInt16LE(0, 20)

  return Buffer.concat([...locals, centralDirectory, end])
}

function crc32(input: Buffer): number {
  let crc = 0xffffffff
  for (const byte of input) {
    crc ^= byte
    for (let i = 0; i < 8; i += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}
