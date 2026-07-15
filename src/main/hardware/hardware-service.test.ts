import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const electronMock = vi.hoisted(() => ({ home: '' }))

vi.mock('electron', () => ({
  app: {
    getPath: () => electronMock.home,
  },
}))

import { HardwareService } from './hardware-service'
import { parseHardwareTable } from './bom-parser'
import { parseGerberLayerGeometry } from './gerber-geometry'
import { inspectGerberPackage } from './gerber-package-inspector'

let tempDir = ''
let workspacePath = ''

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'deepink-hardware-'))
  electronMock.home = tempDir
  workspacePath = join(tempDir, 'ai-glasses')
  await mkdir(workspacePath, { recursive: true })
})

afterEach(async () => {
  if (tempDir) await rm(tempDir, { recursive: true, force: true })
})

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff
  for (const byte of buffer) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

function createStoredZip(entries: Record<string, string>): Buffer {
  const localParts: Buffer[] = []
  const centralParts: Buffer[] = []
  let offset = 0

  for (const [name, content] of Object.entries(entries)) {
    const nameBuffer = Buffer.from(name)
    const contentBuffer = Buffer.from(content)
    const crc = crc32(contentBuffer)
    const localHeader = Buffer.alloc(30)
    localHeader.writeUInt32LE(0x04034b50, 0)
    localHeader.writeUInt16LE(20, 4)
    localHeader.writeUInt16LE(0, 6)
    localHeader.writeUInt16LE(0, 8)
    localHeader.writeUInt32LE(crc, 14)
    localHeader.writeUInt32LE(contentBuffer.length, 18)
    localHeader.writeUInt32LE(contentBuffer.length, 22)
    localHeader.writeUInt16LE(nameBuffer.length, 26)
    localParts.push(localHeader, nameBuffer, contentBuffer)

    const centralHeader = Buffer.alloc(46)
    centralHeader.writeUInt32LE(0x02014b50, 0)
    centralHeader.writeUInt16LE(20, 4)
    centralHeader.writeUInt16LE(20, 6)
    centralHeader.writeUInt16LE(0, 8)
    centralHeader.writeUInt16LE(0, 10)
    centralHeader.writeUInt32LE(crc, 16)
    centralHeader.writeUInt32LE(contentBuffer.length, 20)
    centralHeader.writeUInt32LE(contentBuffer.length, 24)
    centralHeader.writeUInt16LE(nameBuffer.length, 28)
    centralHeader.writeUInt32LE(offset, 42)
    centralParts.push(centralHeader, nameBuffer)

    offset += localHeader.length + nameBuffer.length + contentBuffer.length
  }

  const centralOffset = offset
  const centralDirectory = Buffer.concat(centralParts)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(Object.keys(entries).length, 8)
  end.writeUInt16LE(Object.keys(entries).length, 10)
  end.writeUInt32LE(centralDirectory.length, 12)
  end.writeUInt32LE(centralOffset, 16)

  return Buffer.concat([...localParts, centralDirectory, end])
}

async function writeMinimalXlsx(filePath: string): Promise<void> {
  const sharedStrings = [
    'Designator',
    'Value',
    'R1, R2',
    '10k',
    'U1',
    'MCU',
  ]
  const sheet = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
    '<sheetData>',
    '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>',
    '<row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2" t="s"><v>3</v></c></row>',
    '<row r="3"><c r="A3" t="s"><v>4</v></c><c r="B3" t="s"><v>5</v></c></row>',
    '</sheetData>',
    '</worksheet>',
  ].join('')
  const xlsx = createStoredZip({
    'xl/sharedStrings.xml': [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
      ...sharedStrings.map((value) => `<si><t>${value}</t></si>`),
      '</sst>',
    ].join(''),
    'xl/worksheets/sheet1.xml': sheet,
  })
  await writeFile(filePath, xlsx)
}

describe('HardwareService', () => {
  it('detects hardware production artifacts in a workspace', async () => {
    await mkdir(join(workspacePath, 'FPC生产文件', '右眼生产文件'), { recursive: true })
    await writeFile(join(workspacePath, '20260210_pcb_原理图.pdf'), 'pdf')
    await writeFile(join(workspacePath, 'FPC生产文件', '右眼生产文件', 'bom_51PIN_0.3FPC_R_V4.0.csv'), 'Designator,Value\nR1,10k\n')
    await writeFile(join(workspacePath, 'FPC生产文件', '右眼生产文件', 'coord_51PIN_0.3FPC_R_V4.0.csv'), 'Designator,X,Y\nR1,1,1\n')
    await writeFile(join(workspacePath, 'gerber_51PIN_0.3FPC_R_V4.0.zip'), 'not-a-real-zip')

    const result = await new HardwareService().scanWorkspace(workspacePath)

    expect(result.hasHardwareSignals).toBe(true)
    expect(result.primaryGerberPackage?.displayName).toBe('gerber_51PIN_0.3FPC_R_V4.0.zip')
    expect(result.primaryBom?.type).toBe('bom')
    expect(result.primaryCentroid?.type).toBe('centroid')
    expect(result.counts.schematic).toBe(1)
    expect(result.sourceEditable).toBe(false)
    expect(result.risks.some((risk) => risk.title === '缺少可编辑源工程')).toBe(true)
  })

  it('reports blocking risk when no Gerber package exists', async () => {
    await writeFile(join(workspacePath, 'bom_51PIN.csv'), 'Designator,Value\nR1,10k\n')
    await writeFile(join(workspacePath, 'coord_51PIN.csv'), 'Designator,X,Y\nR1,1,1\n')

    const report = await new HardwareService().inspectProductionPackage(workspacePath)

    expect(report.conclusion).toBe('blocked')
    expect(report.risks.some((risk) => risk.title === '缺少 Gerber 生产包')).toBe(true)
  })

  it('reports BOM and centroid reference mismatches', async () => {
    await writeFile(join(workspacePath, 'gerber_51PIN.zip'), 'not-a-real-zip')
    await writeFile(join(workspacePath, 'bom_51PIN.csv'), 'Designator,Value\nR1,10k\nR2,22k\n')
    await writeFile(join(workspacePath, 'coord_51PIN.csv'), 'Designator,X,Y\nR1,1,1\n')

    const report = await new HardwareService().inspectProductionPackage(workspacePath)

    expect(report.bom?.referenceDesignators).toEqual(['R1', 'R2'])
    expect(report.centroid?.referenceDesignators).toEqual(['R1'])
    expect(report.risks.some((risk) => risk.detail.includes('R2'))).toBe(true)
  })

  it('inspects Gerber zip layers with confidence and reasons', async () => {
    const filePath = join(workspacePath, 'gerber_51PIN.zip')
    await writeFile(
      filePath,
      createStoredZip({
        'Edge_Cuts.gm1': '%FSLAX24Y24*%\n%MOMM*%\nG01*\nX0Y0D02*\nX1000Y0D01*\nM02*',
        'top_copper.gtl': '%FSLAX24Y24*%\n%MOMM*%\n%ADD10C,0.150*%\nX1Y1D03*\nM02*',
        'drill.drl': 'M48\nMETRIC,TZ\nT01C0.3\nX0100Y0100\nM30',
      }),
    )

    const result = await inspectGerberPackage(filePath)

    expect(result.layers.find((layer) => layer.entry === 'Edge_Cuts.gm1')).toMatchObject({
      kind: 'outline',
      gerberLike: true,
    })
    expect(result.layers.find((layer) => layer.entry === 'top_copper.gtl')?.kind).toBe('copper')
    expect(result.layers.find((layer) => layer.entry === 'drill.drl')?.kind).toBe('drill')
    expect(result.layerHints.outline).toEqual(['Edge_Cuts.gm1'])
  })

  it('reads a Gerber layer preview from the selected package entry', async () => {
    const filePath = join(workspacePath, 'gerber_51PIN.zip')
    await writeFile(
      filePath,
      createStoredZip({
        'Edge_Cuts.gm1': '%FSLAX24Y24*%\n%MOMM*%\nX0Y0D02*\nM02*',
        'top_copper.gtl': '%FSLAX24Y24*%\n%MOMM*%\nX1Y1D03*\nM02*',
      }),
    )

    const result = await new HardwareService().readGerberLayerPreview(
      workspacePath,
      filePath,
      'Edge_Cuts.gm1',
    )

    expect(result.entry).toBe('Edge_Cuts.gm1')
    expect(result.content).toContain('%FSLAX24Y24*%')
    expect(result.truncated).toBe(false)
  })

  it('truncates large Gerber layer previews', async () => {
    const filePath = join(workspacePath, 'gerber_large.zip')
    await writeFile(
      filePath,
      createStoredZip({
        'big_outline.gm1': `%FSLAX24Y24*%\n${'X0Y0D01*\n'.repeat(8_000)}`,
      }),
    )

    const result = await new HardwareService().readGerberLayerPreview(
      workspacePath,
      filePath,
      'big_outline.gm1',
    )

    expect(result.truncated).toBe(true)
    expect(Buffer.byteLength(result.content, 'utf-8')).toBeLessThanOrEqual(64 * 1024)
  })

  it('rejects Gerber preview packages outside the current workspace', async () => {
    const outsidePackage = join(tempDir, 'outside.zip')
    await writeFile(outsidePackage, createStoredZip({ 'Edge_Cuts.gm1': '%FSLAX24Y24*%\n' }))

    await expect(
      new HardwareService().readGerberLayerPreview(workspacePath, outsidePackage, 'Edge_Cuts.gm1'),
    ).rejects.toThrow('文件不在当前工作空间内')
  })

  it('reads Gerber layer geometry for SVG rendering', async () => {
    const filePath = join(workspacePath, 'gerber_shape.zip')
    await writeFile(
      filePath,
      createStoredZip({
        'Edge_Cuts.gm1': [
          '%FSLAX24Y24*%',
          '%MOMM*%',
          'G01*',
          'X000000Y000000D02*',
          'X100000Y000000D01*',
          'X100000Y050000D01*',
          'X000000Y050000D01*',
          'X000000Y000000D01*',
          'M02*',
        ].join('\n'),
      }),
    )

    const result = await new HardwareService().readGerberLayerGeometry(
      workspacePath,
      filePath,
      'Edge_Cuts.gm1',
    )

    expect(result.segments).toHaveLength(4)
    expect(result.outlineCandidates).toHaveLength(1)
    expect(result.outlineCandidates[0]).toMatchObject({
      closed: true,
      areaMm2: 50,
      perimeterMm: 30,
    })
    expect(result.bounds).toMatchObject({
      minX: 0,
      minY: 0,
      maxX: 10,
      maxY: 5,
      width: 10,
      height: 5,
    })
  })

  it('reads standalone Gerber files for preview and geometry rendering', async () => {
    const filePath = join(workspacePath, 'Edge_Cuts.GKO')
    await writeFile(
      filePath,
      [
        '%FSLAX24Y24*%',
        '%MOMM*%',
        'G01*',
        'X000000Y000000D02*',
        'X080000Y000000D01*',
        'X080000Y030000D01*',
        'X000000Y030000D01*',
        'X000000Y000000D01*',
        'M02*',
      ].join('\n'),
    )

    const preview = await new HardwareService().readGerberLayerPreview(
      workspacePath,
      filePath,
      'Edge_Cuts.GKO',
    )
    const geometry = await new HardwareService().readGerberLayerGeometry(
      workspacePath,
      filePath,
      'Edge_Cuts.GKO',
    )

    expect(preview.content).toContain('%FSLAX24Y24*%')
    expect(preview.entry).toBe('Edge_Cuts.GKO')
    expect(geometry.outlineCandidates[0]).toMatchObject({
      role: 'outer',
      areaMm2: 24,
      perimeterMm: 22,
    })
  })

  it('warns when a Gerber package has no reliable outline layer candidate', async () => {
    await writeFile(
      join(workspacePath, 'gerber_51PIN.zip'),
      createStoredZip({
        'top_copper.gtl': '%FSLAX24Y24*%\n%MOMM*%\n%ADD10C,0.150*%\nX1Y1D03*\nM02*',
        'bottom_copper.gbl': '%FSLAX24Y24*%\n%MOMM*%\nX0Y0D02*\nM02*',
        'drill.drl': 'M48\nMETRIC,TZ\nT01C0.3\nX0100Y0100\nM30',
      }),
    )
    await writeFile(join(workspacePath, 'bom_51PIN.csv'), 'Designator,Value\nR1,10k\n')
    await writeFile(join(workspacePath, 'coord_51PIN.csv'), 'Designator,X,Y\nR1,1,1\n')

    const report = await new HardwareService().inspectProductionPackage(workspacePath)

    expect(report.gerber?.layers.map((layer) => layer.kind)).toContain('copper')
    expect(report.risks.some((risk) => risk.title === '未可靠识别外形层')).toBe(true)
  })

  it('writes production reports into the workspace hardware reports folder', async () => {
    await writeFile(join(workspacePath, 'bom_51PIN.csv'), 'Designator,Value\nR1,10k\n')

    const result = await new HardwareService().writeProductionReportMarkdown(workspacePath)
    const content = await readFile(result.filePath, 'utf-8')

    expect(result.filePath).toContain(join(workspacePath, 'hardware', 'reports'))
    expect(content).toContain('# 硬件生产包检查报告')
    expect(content).toContain('缺少 Gerber 生产包')
  })

  it('rejects workspaces outside allowed roots', async () => {
    const service = new HardwareService()

    await expect(service.scanWorkspace('/private/outside')).rejects.toThrow('工作空间不在允许范围内')
  })
})

describe('parseHardwareTable', () => {
  it('extracts reference designators from CSV rows', async () => {
    const filePath = join(workspacePath, 'bom.csv')
    await writeFile(filePath, 'Designator,Value\n"R1, R2",10k\nU1,MCU\n', 'utf-8')

    const result = await parseHardwareTable(filePath)

    expect(result.headers).toEqual(['Designator', 'Value'])
    expect(result.referenceDesignators).toEqual(['R1', 'R2', 'U1'])
  })

  it('extracts reference designators from xlsx rows', async () => {
    const filePath = join(workspacePath, 'bom.xlsx')
    await writeMinimalXlsx(filePath)

    const result = await parseHardwareTable(filePath)

    expect(result.unsupported).toBeUndefined()
    expect(result.headers).toEqual(['Designator', 'Value'])
    expect(result.referenceDesignators).toEqual(['R1', 'R2', 'U1'])
  })

  it('marks legacy xls files as unsupported preview input', async () => {
    const filePath = join(workspacePath, 'bom.xls')
    await writeFile(filePath, 'excel', 'utf-8')

    const result = await parseHardwareTable(filePath)

    expect(result.unsupported).toBe(true)
    expect(result.warning).toContain('旧版 xls')
  })
})

describe('parseGerberLayerGeometry', () => {
  it('parses linear Gerber outline commands into mm segments', () => {
    const result = parseGerberLayerGeometry({
      packagePath: '/tmp/shape.zip',
      entry: 'Edge_Cuts.gm1',
      truncated: false,
      content: [
        '%FSLAX24Y24*%',
        '%MOMM*%',
        'G01*',
        'X000000Y000000D02*',
        'X020000Y000000D01*',
        'X020000Y010000D01*',
        'M02*',
      ].join('\n'),
    })

    expect(result.unit).toBe('mm')
    expect(result.segments).toHaveLength(2)
    expect(result.outlineCandidates).toHaveLength(0)
    expect(result.bounds?.width).toBe(2)
    expect(result.bounds?.height).toBe(1)
    expect(result.warnings).toEqual([])
  })

  it('approximates arc commands into drawable points', () => {
    const result = parseGerberLayerGeometry({
      packagePath: '/tmp/shape.zip',
      entry: 'round.gm1',
      truncated: false,
      content: [
        '%FSLAX24Y24*%',
        '%MOMM*%',
        'X000000Y000000D02*',
        'G03*',
        'X010000Y010000I000000J010000D01*',
        'M02*',
      ].join('\n'),
    })

    expect(result.segments).toHaveLength(1)
    expect(result.segments[0].kind).toBe('arc')
    expect(result.segments[0].points.length).toBeGreaterThan(2)
    expect(result.bounds?.maxX).toBeCloseTo(1, 4)
    expect(result.bounds?.maxY).toBeCloseTo(1, 4)
  })

  it('detects closed outline candidates with area and perimeter', () => {
    const result = parseGerberLayerGeometry({
      packagePath: '/tmp/shape.zip',
      entry: 'Edge_Cuts.gm1',
      truncated: false,
      content: [
        '%FSLAX24Y24*%',
        '%MOMM*%',
        'G01*',
        'X000000Y000000D02*',
        'X030000Y000000D01*',
        'X030000Y020000D01*',
        'X000000Y020000D01*',
        'X000000Y000000D01*',
        'M02*',
      ].join('\n'),
    })

    expect(result.outlineCandidates).toHaveLength(1)
    expect(result.outlineCandidates[0].bounds.width).toBe(3)
    expect(result.outlineCandidates[0].bounds.height).toBe(2)
    expect(result.outlineCandidates[0].areaMm2).toBe(6)
    expect(result.outlineCandidates[0].perimeterMm).toBe(10)
    expect(result.outlineCandidates[0].confidence).toBeGreaterThan(0.8)
  })

  it('classifies outer outline, inner holes, slots, and auxiliary closed shapes', () => {
    const result = parseGerberLayerGeometry({
      packagePath: '/tmp/shape.zip',
      entry: 'Edge_Cuts.gm1',
      truncated: false,
      content: [
        '%FSLAX24Y24*%',
        '%MOMM*%',
        'G01*',
        'X000000Y000000D02*',
        'X100000Y000000D01*',
        'X100000Y060000D01*',
        'X000000Y060000D01*',
        'X000000Y000000D01*',
        'X020000Y020000D02*',
        'X030000Y020000D01*',
        'X030000Y030000D01*',
        'X020000Y030000D01*',
        'X020000Y020000D01*',
        'X050000Y020000D02*',
        'X090000Y020000D01*',
        'X090000Y030000D01*',
        'X050000Y030000D01*',
        'X050000Y020000D01*',
        'X120000Y000000D02*',
        'X125000Y000000D01*',
        'X125000Y005000D01*',
        'X120000Y005000D01*',
        'X120000Y000000D01*',
        'M02*',
      ].join('\n'),
    })

    expect(result.outlineCandidates.map((candidate) => candidate.role)).toEqual([
      'outer',
      'slot',
      'hole',
      'auxiliary',
    ])
    expect(result.outlineCandidates[1].parentId).toBe(result.outlineCandidates[0].id)
    expect(result.outlineCandidates[2].parentId).toBe(result.outlineCandidates[0].id)
  })
})
