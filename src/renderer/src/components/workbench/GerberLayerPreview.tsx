import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  GerberLayerCandidate,
  GerberLayerGeometry,
  GerberLayerKind,
  GerberLayerPreview as GerberLayerPreviewResult,
  GerberOutlineRole,
  ProductionPackageReport,
} from '@shared/ipc/hardware'
import type { Tab } from '../../types'

type GerberTabRef = NonNullable<Tab['hardwareGerber']>

const GERBER_PREVIEW_LAYOUT_STORAGE_KEY = 'cclinkStudio:gerber-preview-layout'
const DEFAULT_LAYER_PANEL_WIDTH = 320
const MIN_LAYER_PANEL_WIDTH = 220
const MAX_LAYER_PANEL_WIDTH = 560
const DEFAULT_RENDER_PANEL_HEIGHT = 360
const MIN_RENDER_PANEL_HEIGHT = 180
const MAX_RENDER_PANEL_HEIGHT = 760

interface GerberPreviewLayout {
  layerPanelWidth: number
  renderPanelHeight: number
}

function basename(filePath: string): string {
  return filePath.split('/').filter(Boolean).pop() ?? filePath
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function loadGerberPreviewLayout(): GerberPreviewLayout {
  const fallback = {
    layerPanelWidth: DEFAULT_LAYER_PANEL_WIDTH,
    renderPanelHeight: DEFAULT_RENDER_PANEL_HEIGHT,
  }

  try {
    const rawLayout = window.localStorage.getItem(GERBER_PREVIEW_LAYOUT_STORAGE_KEY)
    if (!rawLayout) return fallback
    const parsed = JSON.parse(rawLayout) as Partial<GerberPreviewLayout>
    return {
      layerPanelWidth: clamp(
        Number(parsed.layerPanelWidth) || fallback.layerPanelWidth,
        MIN_LAYER_PANEL_WIDTH,
        MAX_LAYER_PANEL_WIDTH,
      ),
      renderPanelHeight: clamp(
        Number(parsed.renderPanelHeight) || fallback.renderPanelHeight,
        MIN_RENDER_PANEL_HEIGHT,
        MAX_RENDER_PANEL_HEIGHT,
      ),
    }
  } catch {
    return fallback
  }
}

function saveGerberPreviewLayout(layout: GerberPreviewLayout): void {
  try {
    window.localStorage.setItem(GERBER_PREVIEW_LAYOUT_STORAGE_KEY, JSON.stringify(layout))
  } catch {
    // 本地偏好保存失败不影响 Gerber 查看。
  }
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / 1024 / 1024).toFixed(1)} MB`
}

function kindLabel(kind: GerberLayerKind): string {
  switch (kind) {
    case 'outline':
      return '外形'
    case 'copper':
      return '铜层'
    case 'solder-mask':
      return '阻焊'
    case 'silkscreen':
      return '丝印'
    case 'drill':
      return '钻孔'
    case 'mechanical':
      return '机械'
    case 'unknown':
      return '未知'
  }
}

function buildLayerCounts(layers: GerberLayerCandidate[]): string {
  const counts = layers.reduce<Record<GerberLayerKind, number>>(
    (acc, layer) => {
      acc[layer.kind] += 1
      return acc
    },
    {
      outline: 0,
      copper: 0,
      'solder-mask': 0,
      silkscreen: 0,
      drill: 0,
      mechanical: 0,
      unknown: 0,
    },
  )
  return `外形 ${counts.outline} · 铜层 ${counts.copper} · 钻孔 ${counts.drill} · 未知 ${counts.unknown}`
}

function isZipPackage(filePath: string): boolean {
  return filePath.toLowerCase().endsWith('.zip')
}

function classifyGerberEntry(entry: string): GerberLayerKind {
  const lower = entry.toLowerCase()
  if (/\.(gko|gm\d+|gml|gmb|gpb)$/.test(lower) || /outline|edge|profile|外形/.test(lower)) {
    return 'outline'
  }
  if (/\.(gtl|gbl|g\d+)$/.test(lower)) return 'copper'
  if (/\.(gts|gbs)$/.test(lower)) return 'solder-mask'
  if (/\.(gto|gbo)$/.test(lower)) return 'silkscreen'
  if (/\.(drl|xln)$/.test(lower) || /drill|hole|孔/.test(lower)) return 'drill'
  return 'unknown'
}

function createSingleFileLayer(entry: string): GerberLayerCandidate {
  const kind = classifyGerberEntry(entry)
  return {
    entry,
    kind,
    confidence: kind === 'unknown' ? 0.4 : 0.82,
    reasons: [kind === 'unknown' ? '按单个 Gerber 文件打开' : '文件扩展名匹配 Gerber 层类型'],
    gerberLike: true,
    byteSize: 0,
  }
}

function geometryBoundsLabel(geometry: GerberLayerGeometry | null): string {
  if (!geometry?.bounds) return '暂无可绘制边界'
  const { width, height } = geometry.bounds
  const outlineCount = geometry.outlineCandidates.length
  return `${width.toFixed(2)} × ${height.toFixed(2)} mm · ${geometry.segments.length} 个图元 · 外形 ${outlineCount}`
}

function svgViewBox(geometry: GerberLayerGeometry): string {
  const bounds = geometry.bounds
  if (!bounds) return '0 0 10 10'
  const pad = Math.max(bounds.width, bounds.height, 1) * 0.06
  return [
    bounds.minX - pad,
    -bounds.maxY - pad,
    Math.max(bounds.width + pad * 2, 1),
    Math.max(bounds.height + pad * 2, 1),
  ].join(' ')
}

function svgStrokeWidth(geometry: GerberLayerGeometry): number {
  const bounds = geometry.bounds
  if (!bounds) return 0.05
  return Math.max(Math.max(bounds.width, bounds.height) / 360, 0.03)
}

function segmentPath(points: GerberLayerGeometry['segments'][number]['points']): string {
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')
}

function outlineRoleLabel(role: GerberOutlineRole): string {
  switch (role) {
    case 'outer':
      return '外轮廓'
    case 'hole':
      return '内孔'
    case 'slot':
      return '开槽'
    case 'auxiliary':
      return '辅助线'
    case 'unknown':
      return '待确认'
  }
}

function outlineSummary(geometry: GerberLayerGeometry | null): string {
  const outline = geometry?.outlineCandidates[0]
  if (!outline) return '未识别到闭合外形'
  return [
    `${outlineRoleLabel(outline.role)} ${(outline.confidence * 100).toFixed(0)}%`,
    `${outline.bounds.width.toFixed(2)} × ${outline.bounds.height.toFixed(2)} mm`,
    `面积 ${outline.areaMm2.toFixed(2)} mm²`,
    `周长 ${outline.perimeterMm.toFixed(2)} mm`,
  ].join(' · ')
}

export function GerberLayerPreview({
  hardwareGerber,
}: {
  hardwareGerber: GerberTabRef
}): React.ReactElement {
  const initialLayout = useMemo(() => loadGerberPreviewLayout(), [])
  const [report, setReport] = useState<ProductionPackageReport | null>(null)
  const [selectedEntry, setSelectedEntry] = useState<string | null>(hardwareGerber.entry ?? null)
  const [preview, setPreview] = useState<GerberLayerPreviewResult | null>(null)
  const [geometry, setGeometry] = useState<GerberLayerGeometry | null>(null)
  const [layerPanelWidth, setLayerPanelWidth] = useState(initialLayout.layerPanelWidth)
  const [renderPanelHeight, setRenderPanelHeight] = useState(initialLayout.renderPanelHeight)
  const [loadingReport, setLoadingReport] = useState(false)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [loadingGeometry, setLoadingGeometry] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [geometryError, setGeometryError] = useState<string | null>(null)
  const layerPanelWidthRef = useRef(layerPanelWidth)
  const renderPanelHeightRef = useRef(renderPanelHeight)
  const standaloneGerberFile = !isZipPackage(hardwareGerber.packagePath)

  const layers = useMemo(
    () =>
      standaloneGerberFile
        ? [createSingleFileLayer(hardwareGerber.entry ?? basename(hardwareGerber.packagePath))]
        : (report?.gerber?.layers ?? []),
    [hardwareGerber.entry, hardwareGerber.packagePath, report, standaloneGerberFile],
  )
  const selectedLayer = useMemo(
    () => layers.find((layer) => layer.entry === selectedEntry) ?? null,
    [layers, selectedEntry],
  )

  useEffect(() => {
    layerPanelWidthRef.current = layerPanelWidth
    renderPanelHeightRef.current = renderPanelHeight
    saveGerberPreviewLayout({ layerPanelWidth, renderPanelHeight })
  }, [layerPanelWidth, renderPanelHeight])

  const handleLayerPanelResizeStart = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault()
    const startX = event.clientX
    const startWidth = layerPanelWidthRef.current
    const previousCursor = document.body.style.cursor
    const previousUserSelect = document.body.style.userSelect

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const handleMove = (moveEvent: MouseEvent): void => {
      setLayerPanelWidth(
        clamp(
          startWidth + moveEvent.clientX - startX,
          MIN_LAYER_PANEL_WIDTH,
          MAX_LAYER_PANEL_WIDTH,
        ),
      )
    }
    const handleUp = (): void => {
      document.body.style.cursor = previousCursor
      document.body.style.userSelect = previousUserSelect
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }

    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
  }, [])

  const handleRenderPanelResizeStart = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault()
    const startY = event.clientY
    const startHeight = renderPanelHeightRef.current
    const previousCursor = document.body.style.cursor
    const previousUserSelect = document.body.style.userSelect

    document.body.style.cursor = 'row-resize'
    document.body.style.userSelect = 'none'

    const handleMove = (moveEvent: MouseEvent): void => {
      setRenderPanelHeight(
        clamp(
          startHeight + moveEvent.clientY - startY,
          MIN_RENDER_PANEL_HEIGHT,
          MAX_RENDER_PANEL_HEIGHT,
        ),
      )
    }
    const handleUp = (): void => {
      document.body.style.cursor = previousCursor
      document.body.style.userSelect = previousUserSelect
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }

    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
  }, [])

  useEffect(() => {
    let cancelled = false
    if (standaloneGerberFile) {
      setReport(null)
      setError(null)
      setPreview(null)
      setSelectedEntry(hardwareGerber.entry ?? basename(hardwareGerber.packagePath))
      return () => {
        cancelled = true
      }
    }
    setLoadingReport(true)
    setError(null)
    setReport(null)
    setPreview(null)

    void window.cclinkStudio.hardware
      .inspectProductionPackage(hardwareGerber.workspacePath)
      .then((nextReport) => {
        if (cancelled) return
        setReport(nextReport)
        const nextLayers = nextReport.gerber?.layers ?? []
        setSelectedEntry((current) =>
          current && nextLayers.some((layer) => layer.entry === current)
            ? current
            : (nextLayers[0]?.entry ?? null),
        )
      })
      .catch((nextError: unknown) => {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError.message : String(nextError))
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingReport(false)
      })

    return () => {
      cancelled = true
    }
  }, [
    hardwareGerber.entry,
    hardwareGerber.packagePath,
    hardwareGerber.workspacePath,
    standaloneGerberFile,
  ])

  useEffect(() => {
    if (!selectedEntry) return

    let cancelled = false
    setLoadingPreview(true)
    setError(null)
    setPreview(null)

    void window.cclinkStudio.hardware
      .readGerberLayerPreview(
        hardwareGerber.workspacePath,
        hardwareGerber.packagePath,
        selectedEntry,
      )
      .then((nextPreview) => {
        if (!cancelled) setPreview(nextPreview)
      })
      .catch((nextError: unknown) => {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError.message : String(nextError))
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingPreview(false)
      })

    return () => {
      cancelled = true
    }
  }, [hardwareGerber.packagePath, hardwareGerber.workspacePath, selectedEntry])

  useEffect(() => {
    if (!selectedEntry) return

    let cancelled = false
    setLoadingGeometry(true)
    setGeometry(null)
    setGeometryError(null)

    void window.cclinkStudio.hardware
      .readGerberLayerGeometry(
        hardwareGerber.workspacePath,
        hardwareGerber.packagePath,
        selectedEntry,
      )
      .then((nextGeometry) => {
        if (!cancelled) setGeometry(nextGeometry)
      })
      .catch((nextError: unknown) => {
        if (!cancelled) {
          setGeometryError(nextError instanceof Error ? nextError.message : String(nextError))
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingGeometry(false)
      })

    return () => {
      cancelled = true
    }
  }, [hardwareGerber.packagePath, hardwareGerber.workspacePath, selectedEntry])

  return (
    <div
      className="gerber-preview"
      style={
        {
          '--gerber-layer-panel-width': `${layerPanelWidth}px`,
          '--gerber-render-panel-height': `${renderPanelHeight}px`,
        } as React.CSSProperties
      }
    >
      <div className="gerber-preview-sidebar">
        <div className="gerber-preview-title">Gerber 层</div>
        <div className="gerber-preview-subtitle" title={hardwareGerber.packagePath}>
          {basename(hardwareGerber.packagePath)}
        </div>
        <div className="gerber-preview-counts">
          {loadingReport ? '正在识别层...' : buildLayerCounts(layers)}
        </div>

        <div className="gerber-layer-list">
          {layers.map((layer) => (
            <button
              key={layer.entry}
              type="button"
              className={`gerber-layer-row ${selectedEntry === layer.entry ? 'active' : ''}`}
              onClick={() => setSelectedEntry(layer.entry)}
              title={layer.entry}
            >
              <span className={`gerber-layer-kind ${layer.kind}`}>{kindLabel(layer.kind)}</span>
              <span className="gerber-layer-main">
                <span className="gerber-layer-name">{layer.entry}</span>
                <span className="gerber-layer-meta">
                  {(layer.confidence * 100).toFixed(0)}% · {formatBytes(layer.byteSize)}
                </span>
              </span>
            </button>
          ))}
          {!loadingReport && layers.length === 0 && (
            <div className="gerber-preview-empty">没有可展示的 Gerber 层。</div>
          )}
        </div>
      </div>

      <div
        className="gerber-preview-resize-x"
        role="separator"
        aria-orientation="vertical"
        aria-label="调整 Gerber 层列表宽度"
        onMouseDown={handleLayerPanelResizeStart}
      />

      <div className="gerber-preview-main">
        <div className="gerber-preview-toolbar">
          <div>
            <div className="gerber-preview-heading">{selectedEntry ?? '未选择层'}</div>
            <div className="gerber-preview-meta">
              {selectedLayer
                ? `${kindLabel(selectedLayer.kind)} · confidence=${selectedLayer.confidence.toFixed(2)} · ${geometryBoundsLabel(geometry)}`
                : '选择左侧层后查看原始内容'}
            </div>
          </div>
          {preview?.truncated && <span className="gerber-preview-badge">仅显示前 64 KB</span>}
        </div>

        <div className="gerber-render-panel">
          {loadingGeometry && <div className="gerber-render-empty">正在解析 Gerber 图形...</div>}
          {!loadingGeometry && geometry?.bounds && (
            <svg
              className="gerber-render-svg"
              viewBox={svgViewBox(geometry)}
              role="img"
              aria-label={`${selectedEntry ?? 'Gerber'} 图形预览`}
            >
              <g transform="scale(1 -1)">
                {geometry.outlineCandidates.map((outline) => (
                  <path
                    key={outline.id}
                    d={segmentPath(outline.points)}
                    className={`gerber-render-outline ${outline.role}`}
                    strokeWidth={svgStrokeWidth(geometry) * (outline.role === 'outer' ? 2.2 : 1.6)}
                  />
                ))}
                {geometry.segments.map((segment) => (
                  <path
                    key={segment.id}
                    d={segmentPath(segment.points)}
                    className={`gerber-render-segment ${segment.kind}`}
                    strokeWidth={svgStrokeWidth(geometry)}
                  />
                ))}
              </g>
            </svg>
          )}
          {!loadingGeometry && !geometry?.bounds && (
            <div className="gerber-render-empty">
              {geometryError ?? '当前层暂时没有可绘制图形。'}
            </div>
          )}
        </div>

        <div
          className="gerber-preview-resize-y"
          role="separator"
          aria-orientation="horizontal"
          aria-label="调整 Gerber 图形预览高度"
          onMouseDown={handleRenderPanelResizeStart}
        />

        <div className="gerber-outline-summary">{outlineSummary(geometry)}</div>

        {geometry && geometry.outlineCandidates.length > 0 && (
          <div className="gerber-outline-list">
            {geometry.outlineCandidates.slice(0, 6).map((outline) => (
              <div key={outline.id} className={`gerber-outline-item ${outline.role}`}>
                <span>{outlineRoleLabel(outline.role)}</span>
                <strong>
                  {outline.bounds.width.toFixed(2)} × {outline.bounds.height.toFixed(2)} mm
                </strong>
                <em>
                  {outline.areaMm2.toFixed(2)} mm² · {(outline.confidence * 100).toFixed(0)}%
                </em>
              </div>
            ))}
          </div>
        )}

        {selectedLayer && (
          <div className="gerber-preview-reasons">
            {selectedLayer.reasons.map((reason) => (
              <span key={reason}>{reason}</span>
            ))}
          </div>
        )}

        {error && <div className="gerber-preview-error">{error}</div>}
        {geometry?.warnings.map((warning) => (
          <div key={warning} className="gerber-preview-warning">
            {warning}
          </div>
        ))}

        <pre className="gerber-preview-code">
          {loadingPreview ? '正在读取 Gerber 层内容...' : preview?.content || '暂无内容。'}
        </pre>
      </div>
    </div>
  )
}
