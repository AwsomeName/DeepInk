import { app } from 'electron'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path'
import { parseHardwareTable } from './bom-parser'
import { parseGerberLayerGeometry } from './gerber-geometry'
import {
  inspectGerberPackage,
  readGerberLayerGeometryContent,
  readGerberLayerPreview,
} from './gerber-package-inspector'
import type {
  GerberLayerGeometry,
  GerberLayerPreview,
  FpcShapeContext,
  FpcShapeContextReadiness,
  FpcShapeOutlineCandidateSummary,
  FpcShapeOutlineContext,
  HardwareArtifact,
  HardwareArtifactType,
  HardwareProjectSummary,
  HardwareRisk,
  HardwareReportConclusion,
  HardwareReportMarkdownResult,
  HardwareStructuralArtifact,
  ProductionPackageReport,
} from './types'
import type { CadInspectModelResult } from '../../shared/ipc/cad'

const MAX_SCAN_FILES = 2_000
const MAX_SCAN_DEPTH = 5
const GERBER_PREVIEW_BYTES = 64 * 1024
const GERBER_GEOMETRY_BYTES = 2 * 1024 * 1024
const STRUCTURAL_MODEL_EXTENSIONS = new Set([
  '.step',
  '.stp',
  '.stl',
  '.3mf',
  '.glb',
  '.gltf',
  '.fbx',
])

const ALL_ARTIFACT_TYPES: HardwareArtifactType[] = [
  'schematic',
  'pcb-source',
  'gerber-package',
  'bom',
  'centroid',
  'drill',
  'assembly-drawing',
  'enclosure',
  'firmware',
  'datasheet',
  'unknown',
]

interface FileCandidate {
  path: string
  name: string
  relativePath: string
  extension: string
}

interface CadModelInspector {
  inspectModel(inputPath: string): Promise<CadInspectModelResult>
}

function normalizeText(value: string): string {
  return value.toLowerCase()
}

function detectVersion(value: string): string | undefined {
  return value.match(/(?:^|[_\-\s])v?(\d+(?:\.\d+){0,3})(?:[_\-\s]|$)/i)?.[1]
}

function createRisk(
  level: HardwareRisk['level'],
  title: string,
  detail: string,
  artifactIds: string[],
  nextAction: string,
): HardwareRisk {
  return { level, title, detail, artifactIds, nextAction }
}

function classifyFile(candidate: FileCandidate): {
  type: HardwareArtifactType
  confidence: number
  metadata?: Record<string, unknown>
} {
  const name = normalizeText(candidate.name)
  const path = normalizeText(candidate.relativePath)
  const extension = candidate.extension

  if (extension === '.zip' && /gerber|生产|pcb|fpc|打样/.test(path)) {
    return { type: 'gerber-package', confidence: /gerber/.test(path) ? 0.96 : 0.72 }
  }
  if (
    /bom|物料|bill.?of.?materials/.test(path) &&
    ['.csv', '.tsv', '.txt', '.xlsx', '.xls'].includes(extension)
  ) {
    return { type: 'bom', confidence: 0.92 }
  }
  if (
    /coord|centroid|position|pick.?place|坐标|贴片坐标|位置/.test(path) &&
    ['.csv', '.tsv', '.txt', '.xlsx', '.xls'].includes(extension)
  ) {
    return { type: 'centroid', confidence: 0.92 }
  }
  if (['.kicad_pcb', '.kicad_pro', '.pcbdoc', '.schdoc'].includes(extension)) {
    return { type: 'pcb-source', confidence: 0.95 }
  }
  if (['.kicad_sch', '.sch'].includes(extension) || /原理图|schematic/.test(path)) {
    return { type: 'schematic', confidence: 0.9 }
  }
  if (/\.(drl|xln)$/i.test(candidate.name) || /drill|钻孔/.test(path)) {
    return { type: 'drill', confidence: 0.85 }
  }
  if (
    /装配|assembly|位号图|placement/.test(path) &&
    ['.pdf', '.png', '.jpg', '.jpeg'].includes(extension)
  ) {
    return { type: 'assembly-drawing', confidence: 0.82 }
  }
  if (
    ['.step', '.stp', '.stl', '.dxf'].includes(extension) ||
    /外壳|结构|enclosure|housing/.test(path)
  ) {
    return { type: 'enclosure', confidence: 0.78 }
  }
  if (['.hex', '.bin', '.elf', '.uf2'].includes(extension) || /firmware|固件|烧录/.test(path)) {
    return { type: 'firmware', confidence: 0.75 }
  }
  if (extension === '.pdf' && /datasheet|规格书|手册|manual/.test(path)) {
    return { type: 'datasheet', confidence: 0.76 }
  }
  if (extension === '.zip' && /pcb|fpc|gerber|生产/.test(name)) {
    return { type: 'gerber-package', confidence: 0.65 }
  }
  return { type: 'unknown', confidence: 0.2 }
}

function artifactId(type: HardwareArtifactType, relativePath: string): string {
  return `${type}:${relativePath}`
}

function pickPrimary(
  artifacts: HardwareArtifact[],
  type: HardwareArtifactType,
): HardwareArtifact | undefined {
  return artifacts
    .filter((artifact) => artifact.type === type)
    .sort((a, b) => b.confidence - a.confidence || a.path.localeCompare(b.path))[0]
}

function countArtifacts(artifacts: HardwareArtifact[]): Record<HardwareArtifactType, number> {
  return Object.fromEntries(
    ALL_ARTIFACT_TYPES.map((type) => [
      type,
      artifacts.filter((artifact) => artifact.type === type).length,
    ]),
  ) as Record<HardwareArtifactType, number>
}

function refsDifference(source: string[], target: string[]): string[] {
  const targetSet = new Set(target)
  return source.filter((ref) => !targetSet.has(ref))
}

function conclusionLabel(conclusion: HardwareReportConclusion): string {
  switch (conclusion) {
    case 'ready':
      return '可进入报价'
    case 'quote-only':
      return '可报价，需复核'
    case 'blocked':
      return '阻塞'
  }
}

function formatTimestamp(date = new Date()): string {
  const pad = (value: number): string => String(value).padStart(2, '0')
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    '-',
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join('')
}

function summarizeOutlineCandidate(
  candidate: GerberLayerGeometry['outlineCandidates'][number],
): FpcShapeOutlineCandidateSummary {
  return {
    id: candidate.id,
    role: candidate.role,
    bounds: candidate.bounds,
    closed: candidate.closed,
    areaMm2: candidate.areaMm2,
    perimeterMm: candidate.perimeterMm,
    confidence: candidate.confidence,
    reasons: candidate.reasons,
  }
}

function determineFpcShapeReadiness({
  reportBlocked,
  hasOutline,
  hasStructuralArtifacts,
  hasUnavailableCad,
}: {
  reportBlocked: boolean
  hasOutline: boolean
  hasStructuralArtifacts: boolean
  hasUnavailableCad: boolean
}): FpcShapeContextReadiness {
  if (reportBlocked) return 'blocked'
  if (!hasOutline) return 'needs-outline-selection'
  if (hasUnavailableCad) return 'needs-cad-backend'
  if (hasStructuralArtifacts) return 'needs-structure-alignment'
  return 'ready-for-review'
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)]
}

export class HardwareService {
  private readonly allowedRoots: string[]

  constructor(private readonly cadModelInspector?: CadModelInspector) {
    const home = app.getPath('home')
    this.allowedRoots = [
      home,
      app.getPath('desktop'),
      app.getPath('documents'),
      app.getPath('downloads'),
    ]
  }

  async scanWorkspace(workspacePath: string): Promise<HardwareProjectSummary> {
    const workspace = this.validateWorkspacePath(workspacePath)
    const files = await this.collectFiles(workspace)
    const artifacts = files
      .map((file) => this.createArtifact(workspace, file))
      .filter((artifact): artifact is HardwareArtifact => artifact !== null)
      .sort((a, b) => a.type.localeCompare(b.type) || a.path.localeCompare(b.path))

    const primaryGerberPackage = pickPrimary(artifacts, 'gerber-package')
    const primaryBom = pickPrimary(artifacts, 'bom')
    const primaryCentroid = pickPrimary(artifacts, 'centroid')
    const structuralArtifacts = await this.inspectStructuralArtifacts(artifacts)
    const sourceEditable = artifacts.some((artifact) => artifact.type === 'pcb-source')
    const hasHardwareSignals = artifacts.some((artifact) => artifact.type !== 'unknown')
    const risks: HardwareRisk[] = []

    if (hasHardwareSignals && !sourceEditable) {
      risks.push(
        createRisk(
          'warning',
          '缺少可编辑源工程',
          '当前只发现生产输出或资料文件，无法可靠执行自动改板。',
          artifacts.map((artifact) => artifact.id),
          '找到 KiCad、嘉立创 EDA 或 Altium 源工程后再进入改板流程。',
        ),
      )
    }
    if (primaryGerberPackage && !primaryBom) {
      risks.push(
        createRisk(
          'warning',
          '缺少 BOM 文件',
          '可以做 PCB 报价，但无法进入可靠的 SMT 贴片检查。',
          [primaryGerberPackage.id],
          '补充 BOM 或确认本次只做裸板打样。',
        ),
      )
    }
    if (primaryGerberPackage && primaryBom && !primaryCentroid) {
      risks.push(
        createRisk(
          'warning',
          '缺少坐标文件',
          'BOM 存在但未找到贴片坐标文件，SMT 下单前还需要补齐坐标。',
          [primaryGerberPackage.id, primaryBom.id],
          '导出坐标文件后重新检查生产包。',
        ),
      )
    }

    return {
      workspacePath: workspace,
      projectName: basename(workspace),
      artifacts,
      structuralArtifacts,
      counts: countArtifacts(artifacts),
      hasHardwareSignals,
      sourceEditable,
      primaryGerberPackage,
      primaryBom,
      primaryCentroid,
      risks,
    }
  }

  async inspectProductionPackage(workspacePath: string): Promise<ProductionPackageReport> {
    const summary = await this.scanWorkspace(workspacePath)
    const risks = [...summary.risks]
    const gerberArtifact = summary.primaryGerberPackage
    const bomArtifact = summary.primaryBom
    const centroidArtifact = summary.primaryCentroid
    const suggestedJlcParams: Record<string, unknown> = {}

    const gerber = gerberArtifact
      ? await inspectGerberPackage(gerberArtifact.path).catch((error) => {
          risks.push(
            createRisk(
              'blocking',
              'Gerber zip 无法读取',
              error instanceof Error ? error.message : '无法打开 Gerber zip 文件',
              [gerberArtifact.id],
              '重新导出 Gerber zip 后再检查。',
            ),
          )
          return undefined
        })
      : undefined

    if (!gerberArtifact) {
      risks.push(
        createRisk(
          'blocking',
          '缺少 Gerber 生产包',
          '没有 Gerber zip 或可识别 PCB/FPC 生产包，无法进入 PCB 报价。',
          [],
          '从 EDA 工具导出 Gerber zip。',
        ),
      )
    }

    if (gerber) {
      suggestedJlcParams.layers = Math.max(2, gerber.layerHints.copper.length || 2)
      suggestedJlcParams.requiresDrillReview = gerber.layerHints.drill.length === 0
      const outlineCandidates = gerber.layers.filter(
        (layer) => layer.kind === 'outline' && layer.confidence >= 0.7,
      )
      suggestedJlcParams.outlineLayerCandidates = outlineCandidates.map((layer) => layer.entry)
      if (outlineCandidates.length === 0) {
        risks.push(
          createRisk(
            'warning',
            '未可靠识别外形层',
            'Gerber 包内没有高置信度外形/机械层候选，不能直接进入 FPC 外形自动修改。',
            gerberArtifact ? [gerberArtifact.id] : [],
            '请人工选择外形层，或补充 DXF/机械层文件后再尝试改形状。',
          ),
        )
      }
      if (gerber.layerHints.drill.length === 0) {
        risks.push(
          createRisk(
            'warning',
            'Gerber 包内未识别到钻孔文件',
            '未找到 .drl/.xln 或明显钻孔层，可能影响打样报价识别。',
            gerberArtifact ? [gerberArtifact.id] : [],
            '确认 zip 内是否包含钻孔文件，必要时重新导出。',
          ),
        )
      }
    }

    const bom = bomArtifact ? await parseHardwareTable(bomArtifact.path) : undefined
    const centroid = centroidArtifact ? await parseHardwareTable(centroidArtifact.path) : undefined

    if (bom?.unsupported) {
      risks.push(
        createRisk(
          'warning',
          'BOM 暂未解析',
          bom.warning ?? '当前 BOM 格式暂不支持解析。',
          bomArtifact ? [bomArtifact.id] : [],
          '先导出 csv/tsv 格式 BOM，或人工确认 Excel 内容。',
        ),
      )
    }
    if (centroid?.unsupported) {
      risks.push(
        createRisk(
          'warning',
          '坐标文件暂未解析',
          centroid.warning ?? '当前坐标文件格式暂不支持解析。',
          centroidArtifact ? [centroidArtifact.id] : [],
          '先导出 csv/tsv 格式坐标文件，或人工确认 Excel 内容。',
        ),
      )
    }

    if (bom && centroid && !bom.unsupported && !centroid.unsupported) {
      const missingInCentroid = refsDifference(
        bom.referenceDesignators,
        centroid.referenceDesignators,
      )
      const extraInCentroid = refsDifference(
        centroid.referenceDesignators,
        bom.referenceDesignators,
      )

      if (missingInCentroid.length > 0) {
        risks.push(
          createRisk(
            'warning',
            'BOM 中的位号缺少贴片坐标',
            `缺少坐标的位号：${missingInCentroid.slice(0, 20).join(', ')}${missingInCentroid.length > 20 ? ' 等' : ''}`,
            [bomArtifact?.id, centroidArtifact?.id].filter(Boolean) as string[],
            '确认这些位号是否不贴；如果需要贴片，请重新导出坐标文件。',
          ),
        )
      }
      if (extraInCentroid.length > 0) {
        risks.push(
          createRisk(
            'info',
            '坐标文件包含 BOM 外位号',
            `额外位号：${extraInCentroid.slice(0, 20).join(', ')}${extraInCentroid.length > 20 ? ' 等' : ''}`,
            [bomArtifact?.id, centroidArtifact?.id].filter(Boolean) as string[],
            '确认 BOM 是否漏项，或这些位号是否不需要采购贴装。',
          ),
        )
      }
    }

    if (bomArtifact && !centroidArtifact) {
      risks.push(
        createRisk(
          'warning',
          '贴片资料不完整',
          '检测到 BOM，但没有坐标文件。',
          [bomArtifact.id],
          '导出贴片坐标文件后再提交 SMT。',
        ),
      )
    }

    const conclusion = risks.some((risk) => risk.level === 'blocking')
      ? 'blocked'
      : risks.some((risk) => risk.level === 'warning')
        ? 'quote-only'
        : 'ready'

    return {
      id: randomUUID(),
      workspacePath: summary.workspacePath,
      createdAt: new Date().toISOString(),
      conclusion,
      risks,
      artifacts: summary.artifacts,
      structuralArtifacts: summary.structuralArtifacts,
      bom,
      centroid,
      gerber,
      suggestedJlcParams,
    }
  }

  async prepareFpcShapeContext(workspacePath: string): Promise<FpcShapeContext> {
    const report = await this.inspectProductionPackage(workspacePath)
    const risks = [...report.risks]
    const questions: string[] = []
    const nextActions: string[] = []
    let outline: FpcShapeOutlineContext | undefined

    const gerberPackage =
      report.artifacts.find((artifact) => artifact.id === report.gerber?.filePath) ??
      report.artifacts.find((artifact) => artifact.path === report.gerber?.filePath) ??
      report.artifacts.find((artifact) => artifact.type === 'gerber-package')

    const outlineEntry = report.gerber?.layerHints.outline[0]
    if (report.gerber?.filePath && outlineEntry) {
      const geometry = await this.readGerberLayerGeometry(
        report.workspacePath,
        report.gerber.filePath,
        outlineEntry,
      ).catch((error) => {
        risks.push(
          createRisk(
            'warning',
            '外形层几何读取失败',
            error instanceof Error ? error.message : '无法读取外形层几何。',
            gerberPackage ? [gerberPackage.id] : [],
            '人工选择或重新导出外形层后再准备 FPC 改形状上下文。',
          ),
        )
        return undefined
      })
      if (geometry) {
        outline = {
          packagePath: geometry.packagePath,
          entry: geometry.entry,
          unit: geometry.unit,
          bounds: geometry.bounds,
          outlineCandidates: geometry.outlineCandidates.map(summarizeOutlineCandidate),
          warnings: geometry.warnings,
          truncated: geometry.truncated,
        }
      }
    }

    if (!report.gerber) {
      questions.push('请先提供或选择 Gerber/FPC 生产包。')
      nextActions.push('从 EDA 工具重新导出 Gerber zip，或在文件树中确认哪一个 zip 是 FPC 生产包。')
    } else if (!outlineEntry) {
      questions.push('请确认哪一层是 FPC 外形层。')
      nextActions.push('打开 Gerber 预览，选择 Edge/Outline/Profile/机械层后再继续。')
    } else if (!outline || outline.outlineCandidates.length === 0) {
      questions.push('当前外形层未识别到闭合 FPC 外形，请确认外形层是否正确。')
      nextActions.push('人工选择其它外形层，或补充 DXF/机械层文件。')
    }

    const structuralArtifacts = report.structuralArtifacts
    if (structuralArtifacts.length === 0) {
      questions.push('是否有光机、镜腿、连接件等结构件文件可作为避让参考？')
      nextActions.push('如有结构件，请把 STEP/STP/STL/3MF 文件放入项目目录后重新扫描。')
    } else {
      const unavailable = structuralArtifacts.filter((artifact) => !artifact.canPreview)
      if (unavailable.length > 0) {
        questions.push('部分 STEP/STP 结构件还不能预览，是否要先启用本机 FreeCAD？')
        nextActions.push(
          '在设置 > 硬件与 CAD 中启用本机 FreeCAD，或先只把这些结构件作为文件名参考。',
        )
      }
      const missingMetadata = structuralArtifacts.filter((artifact) => !artifact.metadata?.bounds)
      if (missingMetadata.length > 0) {
        questions.push('部分结构件缺少尺寸 metadata，是否先打开/转换这些模型以生成尺寸？')
        nextActions.push('打开结构件预览；STEP/STP 需要 CAD 后端转换后才会生成 metadata。')
      }
      questions.push('请确认 FPC 外形坐标和结构件坐标如何对齐，或指出至少两个共同参考点。')
      nextActions.push('在没有装配坐标/参考点前，AI 只能把结构件作为视觉参考，不能断言干涉。')
    }

    const readiness = determineFpcShapeReadiness({
      reportBlocked: report.conclusion === 'blocked',
      hasOutline: Boolean(outline && outline.outlineCandidates.length > 0),
      hasStructuralArtifacts: structuralArtifacts.length > 0,
      hasUnavailableCad: structuralArtifacts.some(
        (artifact) => artifact.requiresBackend && !artifact.canPreview,
      ),
    })

    return {
      workspacePath: report.workspacePath,
      createdAt: new Date().toISOString(),
      readiness,
      gerberPackage,
      outline,
      structuralArtifacts,
      risks,
      questions: uniqueStrings(questions),
      nextActions: uniqueStrings(nextActions),
    }
  }

  async writeProductionReportMarkdown(
    workspacePath: string,
  ): Promise<HardwareReportMarkdownResult> {
    const workspace = this.validateWorkspacePath(workspacePath)
    const report = await this.inspectProductionPackage(workspace)
    const filePath = this.resolveWithinWorkspace(
      workspace,
      'hardware',
      'reports',
      `${formatTimestamp()}-production-report.md`,
    )
    await mkdir(dirname(filePath), { recursive: true })
    await writeFile(filePath, this.formatReportMarkdown(workspace, report), 'utf-8')
    return { filePath, report }
  }

  async readGerberLayerPreview(
    workspacePath: string,
    packagePath: string,
    entry: string,
  ): Promise<GerberLayerPreview> {
    const workspace = this.validateWorkspacePath(workspacePath)
    const gerberPackage = this.validateFileWithinWorkspace(workspace, packagePath)
    if (!entry || entry.endsWith('/') || entry.includes('\0')) {
      throw new Error('Gerber 条目名称无效')
    }
    if (extname(gerberPackage).toLowerCase() !== '.zip') {
      return this.readStandaloneGerberLayerContent(gerberPackage, entry, GERBER_PREVIEW_BYTES)
    }
    return readGerberLayerPreview(gerberPackage, entry)
  }

  async readGerberLayerGeometry(
    workspacePath: string,
    packagePath: string,
    entry: string,
  ): Promise<GerberLayerGeometry> {
    const workspace = this.validateWorkspacePath(workspacePath)
    const gerberPackage = this.validateFileWithinWorkspace(workspace, packagePath)
    if (!entry || entry.endsWith('/') || entry.includes('\0')) {
      throw new Error('Gerber 条目名称无效')
    }
    const content =
      extname(gerberPackage).toLowerCase() === '.zip'
        ? await readGerberLayerGeometryContent(gerberPackage, entry)
        : await this.readStandaloneGerberLayerContent(gerberPackage, entry, GERBER_GEOMETRY_BYTES)
    return parseGerberLayerGeometry({
      packagePath: gerberPackage,
      entry,
      content: content.content,
      truncated: content.truncated,
    })
  }

  private async readStandaloneGerberLayerContent(
    filePath: string,
    entry: string,
    byteLimit: number,
  ): Promise<GerberLayerPreview> {
    const content = await readFile(filePath)
    const visible = content.subarray(0, byteLimit)
    return {
      packagePath: filePath,
      entry,
      content: visible.toString('utf-8'),
      byteSize: content.byteLength,
      truncated: content.byteLength > byteLimit,
    }
  }

  private createArtifact(workspace: string, file: FileCandidate): HardwareArtifact | null {
    const classification = classifyFile(file)
    if (classification.type === 'unknown') return null
    return {
      id: artifactId(classification.type, file.relativePath),
      type: classification.type,
      path: file.path,
      displayName: file.name,
      version: detectVersion(file.name),
      confidence: classification.confidence,
      metadata: {
        relativePath: file.relativePath,
        extension: file.extension,
        ...classification.metadata,
        workspace,
      },
    }
  }

  private async inspectStructuralArtifacts(
    artifacts: HardwareArtifact[],
  ): Promise<HardwareStructuralArtifact[]> {
    const structuralCandidates = artifacts.filter(
      (artifact) =>
        artifact.type === 'enclosure' &&
        STRUCTURAL_MODEL_EXTENSIONS.has(String(artifact.metadata.extension ?? '').toLowerCase()),
    )

    const inspected = await Promise.all(
      structuralCandidates.map(async (artifact) => this.inspectStructuralArtifact(artifact)),
    )
    return inspected.sort((a, b) => a.path.localeCompare(b.path))
  }

  private async inspectStructuralArtifact(
    artifact: HardwareArtifact,
  ): Promise<HardwareStructuralArtifact> {
    const extension = String(artifact.metadata.extension ?? extname(artifact.path)).toLowerCase()
    if (!this.cadModelInspector) {
      const nativeMesh = ['.stl', '.3mf', '.glb', '.gltf', '.fbx'].includes(extension)
      return {
        artifactId: artifact.id,
        path: artifact.path,
        displayName: artifact.displayName,
        extension,
        previewMode: nativeMesh ? 'native-mesh' : 'cad-conversion',
        canPreview: nativeMesh,
        requiresBackend: !nativeMesh,
        message: nativeMesh
          ? '该模型格式可直接使用内置 3D 预览器打开。'
          : '该 CAD 文件需要 CAD 转换服务提供 STEP/STP 预览状态。',
        cacheHit: false,
      }
    }

    const inspected = await this.cadModelInspector.inspectModel(artifact.path).catch(
      (error): CadInspectModelResult => ({
        support: {
          inputPath: artifact.path,
          extension,
          mode: 'unsupported' as const,
          canPreview: false,
          requiresBackend: false,
          message: error instanceof Error ? error.message : '结构件检查失败。',
        },
        sourceHash: undefined,
        cacheHit: false,
        metadata: undefined,
        diagnostics: [],
      }),
    )

    return {
      artifactId: artifact.id,
      path: artifact.path,
      displayName: artifact.displayName,
      extension,
      previewMode: inspected.support.mode,
      canPreview: inspected.support.canPreview,
      requiresBackend: inspected.support.requiresBackend,
      message: inspected.support.message,
      sourceHash: inspected.sourceHash,
      cacheHit: inspected.cacheHit,
      metadata: inspected.metadata,
    }
  }

  private async collectFiles(workspacePath: string): Promise<FileCandidate[]> {
    const files: FileCandidate[] = []
    const walk = async (dirPath: string, depth: number): Promise<void> => {
      if (files.length >= MAX_SCAN_FILES || depth > MAX_SCAN_DEPTH) return
      const entries = await readdir(dirPath, { withFileTypes: true }).catch(() => [])
      for (const entry of entries) {
        if (files.length >= MAX_SCAN_FILES) return
        if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'out') {
          continue
        }
        const path = join(dirPath, entry.name)
        if (entry.isDirectory()) {
          await walk(path, depth + 1)
          continue
        }
        if (!entry.isFile()) continue
        files.push({
          path,
          name: entry.name,
          relativePath: relative(workspacePath, path),
          extension: extname(entry.name).toLowerCase(),
        })
      }
    }

    await walk(workspacePath, 0)
    return files
  }

  private validateWorkspacePath(workspacePath: string): string {
    const resolved = resolve(workspacePath)
    const allowed = this.allowedRoots.some(
      (root) => resolved === root || resolved.startsWith(root + sep),
    )
    if (!allowed) throw new Error(`工作空间不在允许范围内: ${resolved}`)
    return resolved
  }

  private resolveWithinWorkspace(workspacePath: string, ...segments: string[]): string {
    const workspace = this.validateWorkspacePath(workspacePath)
    const target = resolve(workspace, ...segments)
    if (target !== workspace && !target.startsWith(workspace + sep)) {
      throw new Error(`路径不在当前工作空间内: ${target}`)
    }
    return target
  }

  private validateFileWithinWorkspace(workspacePath: string, filePath: string): string {
    const workspace = this.validateWorkspacePath(workspacePath)
    const target = resolve(filePath)
    if (target === workspace || !target.startsWith(workspace + sep)) {
      throw new Error(`文件不在当前工作空间内: ${target}`)
    }
    return target
  }

  private formatReportMarkdown(workspacePath: string, report: ProductionPackageReport): string {
    const rel = (filePath: string): string => relative(workspacePath, filePath) || filePath
    const lines: string[] = [
      '# 硬件生产包检查报告',
      '',
      `- 工作空间：${workspacePath}`,
      `- 生成时间：${new Date(report.createdAt).toLocaleString('zh-CN', { hour12: false })}`,
      `- 结论：${conclusionLabel(report.conclusion)} (${report.conclusion})`,
      '',
      '## 风险',
      '',
    ]

    if (report.risks.length === 0) {
      lines.push('- 未发现阻塞风险。', '')
    } else {
      for (const risk of report.risks) {
        lines.push(
          `### ${risk.level} · ${risk.title}`,
          '',
          risk.detail,
          '',
          `下一步：${risk.nextAction}`,
          '',
        )
      }
    }

    lines.push('## 识别到的生产文件', '')
    if (report.artifacts.length === 0) {
      lines.push('- 未识别到硬件生产文件。', '')
    } else {
      for (const artifact of report.artifacts) {
        lines.push(
          `- ${artifact.type} · ${rel(artifact.path)} · confidence=${artifact.confidence.toFixed(2)}`,
        )
      }
      lines.push('')
    }

    lines.push('## BOM / 坐标', '')
    lines.push(`- BOM 位号数：${report.bom?.referenceDesignators.length ?? 0}`)
    lines.push(`- 坐标位号数：${report.centroid?.referenceDesignators.length ?? 0}`)
    if (report.bom?.unsupported) lines.push(`- BOM 提示：${report.bom.warning ?? '暂不支持解析'}`)
    if (report.centroid?.unsupported) {
      lines.push(`- 坐标提示：${report.centroid.warning ?? '暂不支持解析'}`)
    }
    lines.push('')

    lines.push('## Gerber 线索', '')
    if (report.gerber) {
      lines.push(`- 文件：${rel(report.gerber.filePath)}`)
      lines.push(`- 铜层线索：${report.gerber.layerHints.copper.length}`)
      lines.push(`- 钻孔线索：${report.gerber.layerHints.drill.length}`)
      lines.push(`- 外形线索：${report.gerber.layerHints.outline.length}`)
      lines.push('')
      lines.push('### 层候选')
      lines.push('')
      for (const layer of report.gerber.layers) {
        lines.push(
          `- ${layer.kind} · ${layer.entry} · confidence=${layer.confidence.toFixed(2)} · ${layer.reasons.join('；')}`,
        )
      }
      lines.push('')
    } else {
      lines.push('- 未生成 Gerber 结构信息。', '')
    }

    lines.push('## 结构件 / CAD 约束', '')
    if (report.structuralArtifacts.length === 0) {
      lines.push('- 未识别到可作为结构约束的 STEP/STP/STL/3MF/GLB/FBX 文件。', '')
    } else {
      for (const artifact of report.structuralArtifacts) {
        const size = artifact.metadata?.bounds?.size
        const sizeText = size
          ? ` · size=${size.x.toFixed(2)} × ${size.y.toFixed(2)} × ${size.z.toFixed(2)} ${artifact.metadata?.unit ?? 'unknown'}`
          : ''
        const cacheText = artifact.cacheHit ? ' · metadata=缓存命中' : ''
        lines.push(
          `- ${artifact.previewMode} · ${rel(artifact.path)} · canPreview=${artifact.canPreview}${cacheText}${sizeText}`,
        )
        if (!artifact.canPreview || artifact.requiresBackend) {
          lines.push(`  - 提示：${artifact.message}`)
        }
      }
      lines.push('')
    }

    lines.push('## 嘉立创参数建议', '')
    const params = Object.entries(report.suggestedJlcParams)
    if (params.length === 0) {
      lines.push('- 暂无自动参数建议。')
    } else {
      for (const [key, value] of params) {
        lines.push(`- ${key}：${String(value)}`)
      }
    }
    lines.push('')

    return lines.join('\n')
  }
}
