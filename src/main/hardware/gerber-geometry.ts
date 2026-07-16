import type {
  GerberGeometryBounds,
  GerberGeometryPoint,
  GerberGeometrySegment,
  GerberLayerGeometry,
  GerberOutlineCandidate,
  GerberOutlineRole,
} from './types'

interface CoordinateFormat {
  xInteger: number
  xDecimal: number
  yInteger: number
  yDecimal: number
}

type InterpolationMode = 'linear' | 'clockwise-arc' | 'counterclockwise-arc'
type DrawOperation = 'draw' | 'move' | 'flash'

interface ParserState {
  format: CoordinateFormat
  unit: 'mm' | 'inch'
  interpolation: InterpolationMode
  operation: DrawOperation
  current: GerberGeometryPoint
  segments: GerberGeometrySegment[]
  warnings: string[]
}

const DEFAULT_FORMAT: CoordinateFormat = {
  xInteger: 2,
  xDecimal: 4,
  yInteger: 2,
  yDecimal: 4,
}
const MAX_SEGMENTS = 20_000
const ARC_STEP_RADIANS = Math.PI / 36
const POINT_TOLERANCE_MM = 0.01

function splitStatements(content: string): string[] {
  return content
    .replace(/\r/g, '')
    .split('*')
    .map((statement) => statement.replace(/%/g, '').trim())
    .filter(Boolean)
}

function parseFormat(statement: string): CoordinateFormat | null {
  const match = statement.match(/FS[LT][AI]X(\d)(\d)Y(\d)(\d)/i)
  if (!match) return null
  return {
    xInteger: Number(match[1]),
    xDecimal: Number(match[2]),
    yInteger: Number(match[3]),
    yDecimal: Number(match[4]),
  }
}

function parseCoordinateValue(
  rawValue: string | undefined,
  integerDigits: number,
  decimalDigits: number,
  unit: ParserState['unit'],
): number | null {
  if (rawValue === undefined) return null
  if (rawValue.includes('.')) {
    const parsed = Number(rawValue)
    return Number.isFinite(parsed) ? normalizeUnit(parsed, unit) : null
  }

  const sign = rawValue.startsWith('-') ? -1 : 1
  const absolute = rawValue.replace(/^[+-]/, '')
  const scale = 10 ** decimalDigits
  const parsed = Number(absolute)
  const maxDigits = integerDigits + decimalDigits
  if (!Number.isFinite(parsed) || absolute.length > maxDigits) return null
  return normalizeUnit((sign * parsed) / scale, unit)
}

function normalizeUnit(value: number, unit: ParserState['unit']): number {
  return unit === 'inch' ? value * 25.4 : value
}

function extractAxis(statement: string, axis: 'X' | 'Y' | 'I' | 'J'): string | undefined {
  return statement.match(new RegExp(`${axis}([+-]?\\d+(?:\\.\\d+)?)`, 'i'))?.[1]
}

function extractOperation(statement: string): DrawOperation | null {
  const match = statement.match(/D0?([123])\b/i)
  if (!match) return null
  if (match[1] === '1') return 'draw'
  if (match[1] === '2') return 'move'
  return 'flash'
}

function updateModes(statement: string, state: ParserState): void {
  const format = parseFormat(statement)
  if (format) state.format = format
  if (/MOIN/i.test(statement)) state.unit = 'inch'
  if (/MOMM/i.test(statement)) state.unit = 'mm'
  if (/G01/i.test(statement)) state.interpolation = 'linear'
  if (/G02/i.test(statement)) state.interpolation = 'clockwise-arc'
  if (/G03/i.test(statement)) state.interpolation = 'counterclockwise-arc'

  const operation = extractOperation(statement)
  if (operation) state.operation = operation
}

function nearlySamePoint(a: GerberGeometryPoint, b: GerberGeometryPoint): boolean {
  return Math.abs(a.x - b.x) <= POINT_TOLERANCE_MM && Math.abs(a.y - b.y) <= POINT_TOLERANCE_MM
}

function buildArcPoints(
  start: GerberGeometryPoint,
  end: GerberGeometryPoint,
  center: GerberGeometryPoint,
  mode: InterpolationMode,
): GerberGeometryPoint[] {
  const startAngle = Math.atan2(start.y - center.y, start.x - center.x)
  let endAngle = Math.atan2(end.y - center.y, end.x - center.x)
  const radius = Math.hypot(start.x - center.x, start.y - center.y)
  if (!Number.isFinite(radius) || radius <= 0) return [start, end]

  if (mode === 'clockwise-arc') {
    while (endAngle >= startAngle) endAngle -= Math.PI * 2
  } else {
    while (endAngle <= startAngle) endAngle += Math.PI * 2
  }

  const sweep = endAngle - startAngle
  const steps = Math.max(6, Math.min(96, Math.ceil(Math.abs(sweep) / ARC_STEP_RADIANS)))
  const points: GerberGeometryPoint[] = []
  for (let index = 0; index <= steps; index++) {
    const angle = startAngle + (sweep * index) / steps
    points.push({
      x: center.x + Math.cos(angle) * radius,
      y: center.y + Math.sin(angle) * radius,
    })
  }
  return points
}

function parseTarget(statement: string, state: ParserState): GerberGeometryPoint | null {
  const x = parseCoordinateValue(
    extractAxis(statement, 'X'),
    state.format.xInteger,
    state.format.xDecimal,
    state.unit,
  )
  const y = parseCoordinateValue(
    extractAxis(statement, 'Y'),
    state.format.yInteger,
    state.format.yDecimal,
    state.unit,
  )
  if (x === null && y === null) return null
  return {
    x: x ?? state.current.x,
    y: y ?? state.current.y,
  }
}

function parseOffset(statement: string, state: ParserState): GerberGeometryPoint | null {
  const i = parseCoordinateValue(
    extractAxis(statement, 'I'),
    state.format.xInteger,
    state.format.xDecimal,
    state.unit,
  )
  const j = parseCoordinateValue(
    extractAxis(statement, 'J'),
    state.format.yInteger,
    state.format.yDecimal,
    state.unit,
  )
  if (i === null || j === null) return null
  return { x: i, y: j }
}

function addSegment(
  state: ParserState,
  kind: GerberGeometrySegment['kind'],
  start: GerberGeometryPoint,
  end: GerberGeometryPoint,
  points: GerberGeometryPoint[],
  source: string,
): void {
  if (state.segments.length >= MAX_SEGMENTS) {
    if (state.segments.length === MAX_SEGMENTS) {
      state.warnings.push(`图元超过 ${MAX_SEGMENTS} 个，后续内容已忽略。`)
    }
    return
  }
  if (points.length < 2 || nearlySamePoint(start, end)) return
  state.segments.push({
    id: `seg-${state.segments.length + 1}`,
    kind,
    start,
    end,
    points,
    source,
  })
}

function parseCoordinateStatement(statement: string, state: ParserState): void {
  if (/^(FS|MO|AD|LP|SR|TF|TA|TO|AM)/i.test(statement)) return
  if (!/[XY]/i.test(statement)) return

  const target = parseTarget(statement, state)
  if (!target) return

  const start = state.current
  if (state.operation === 'move') {
    state.current = target
    return
  }
  if (state.operation === 'flash') {
    state.current = target
    return
  }

  if (state.interpolation === 'linear') {
    addSegment(state, 'line', start, target, [start, target], statement)
    state.current = target
    return
  }

  const offset = parseOffset(statement, state)
  if (!offset) {
    state.warnings.push(`圆弧命令缺少 I/J，已按直线处理：${statement}`)
    addSegment(state, 'line', start, target, [start, target], statement)
    state.current = target
    return
  }

  const center = { x: start.x + offset.x, y: start.y + offset.y }
  const points = buildArcPoints(start, target, center, state.interpolation)
  addSegment(state, 'arc', start, target, points, statement)
  state.current = target
}

function computeBounds(segments: GerberGeometrySegment[]): GerberGeometryBounds | null {
  const points = segments.flatMap((segment) => segment.points)
  return computePointBounds(points)
}

function computePointBounds(points: GerberGeometryPoint[]): GerberGeometryBounds | null {
  if (points.length === 0) return null
  const minX = Math.min(...points.map((point) => point.x))
  const minY = Math.min(...points.map((point) => point.y))
  const maxX = Math.max(...points.map((point) => point.x))
  const maxY = Math.max(...points.map((point) => point.y))
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  }
}

function pointDistance(a: GerberGeometryPoint, b: GerberGeometryPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function pathPerimeter(points: GerberGeometryPoint[]): number {
  return points.slice(1).reduce((sum, point, index) => sum + pointDistance(points[index], point), 0)
}

function pathArea(points: GerberGeometryPoint[]): number {
  if (points.length < 4) return 0
  let area = 0
  for (let index = 0; index < points.length - 1; index++) {
    const current = points[index]
    const next = points[index + 1]
    area += current.x * next.y - next.x * current.y
  }
  return Math.abs(area) / 2
}

function appendSegmentPoints(
  currentPoints: GerberGeometryPoint[],
  segment: GerberGeometrySegment,
): void {
  const points = segment.points
  if (currentPoints.length === 0) {
    currentPoints.push(...points)
    return
  }
  currentPoints.push(...points.slice(1))
}

function scoreOutlineCandidate(input: {
  closed: boolean
  areaMm2: number
  perimeterMm: number
  segmentCount: number
}): { confidence: number; reasons: string[] } {
  const reasons: string[] = []
  let confidence = 0.18
  if (input.closed) {
    confidence += 0.48
    reasons.push('路径首尾闭合')
  }
  if (input.areaMm2 > 0.01) {
    confidence += 0.16
    reasons.push('闭合区域面积有效')
  }
  if (input.perimeterMm > 1) {
    confidence += 0.1
    reasons.push('轮廓周长有效')
  }
  if (input.segmentCount >= 4) {
    confidence += 0.08
    reasons.push('包含多个边段')
  }
  return {
    confidence: Math.min(confidence, 0.98),
    reasons,
  }
}

function createOutlineCandidate(
  id: string,
  segments: GerberGeometrySegment[],
  points: GerberGeometryPoint[],
): GerberOutlineCandidate | null {
  const bounds = computePointBounds(points)
  if (!bounds || points.length < 2) return null
  const closed = nearlySamePoint(points[0], points[points.length - 1])
  const areaMm2 = closed ? pathArea(points) : 0
  const perimeterMm = pathPerimeter(points)
  const score = scoreOutlineCandidate({
    closed,
    areaMm2,
    perimeterMm,
    segmentCount: segments.length,
  })
  return {
    id,
    role: 'unknown',
    segmentIds: segments.map((segment) => segment.id),
    points,
    bounds,
    closed,
    areaMm2,
    perimeterMm,
    confidence: score.confidence,
    reasons: score.reasons,
  }
}

function centroid(points: GerberGeometryPoint[]): GerberGeometryPoint {
  const usable = points.length > 1 ? points.slice(0, -1) : points
  const sum = usable.reduce((acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }), {
    x: 0,
    y: 0,
  })
  return {
    x: usable.length ? sum.x / usable.length : 0,
    y: usable.length ? sum.y / usable.length : 0,
  }
}

function boundsContain(outer: GerberGeometryBounds, inner: GerberGeometryBounds): boolean {
  return (
    inner.minX >= outer.minX - POINT_TOLERANCE_MM &&
    inner.maxX <= outer.maxX + POINT_TOLERANCE_MM &&
    inner.minY >= outer.minY - POINT_TOLERANCE_MM &&
    inner.maxY <= outer.maxY + POINT_TOLERANCE_MM
  )
}

function pointInPolygon(point: GerberGeometryPoint, polygon: GerberGeometryPoint[]): boolean {
  let inside = false
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const currentPoint = polygon[index]
    const previousPoint = polygon[previous]
    const intersects =
      currentPoint.y > point.y !== previousPoint.y > point.y &&
      point.x <
        ((previousPoint.x - currentPoint.x) * (point.y - currentPoint.y)) /
          (previousPoint.y - currentPoint.y) +
          currentPoint.x
    if (intersects) inside = !inside
  }
  return inside
}

function aspectRatio(bounds: GerberGeometryBounds): number {
  const shorter = Math.min(bounds.width, bounds.height)
  const longer = Math.max(bounds.width, bounds.height)
  return shorter <= 0 ? Number.POSITIVE_INFINITY : longer / shorter
}

function withRole(
  candidate: GerberOutlineCandidate,
  role: GerberOutlineRole,
  reason: string,
  parentId?: string,
): GerberOutlineCandidate {
  return {
    ...candidate,
    role,
    parentId,
    reasons: [...candidate.reasons, reason],
    confidence:
      role === 'outer' || role === 'hole' || role === 'slot'
        ? Math.min(0.99, candidate.confidence + 0.04)
        : candidate.confidence,
  }
}

function classifyOutlineCandidates(candidates: GerberOutlineCandidate[]): GerberOutlineCandidate[] {
  if (candidates.length === 0) return []
  const sorted = [...candidates].sort(
    (a, b) => b.areaMm2 - a.areaMm2 || b.confidence - a.confidence,
  )
  const outer = withRole(sorted[0], 'outer', '面积最大的闭合轮廓，暂定为外轮廓')

  return [
    outer,
    ...sorted.slice(1).map((candidate) => {
      const containedByOuter =
        boundsContain(outer.bounds, candidate.bounds) &&
        pointInPolygon(centroid(candidate.points), outer.points)
      if (containedByOuter) {
        const role: GerberOutlineRole = aspectRatio(candidate.bounds) >= 3 ? 'slot' : 'hole'
        return withRole(
          candidate,
          role,
          role === 'slot' ? '位于外轮廓内部且形状狭长，疑似开槽' : '位于外轮廓内部，疑似内孔',
          outer.id,
        )
      }

      const areaRatio = candidate.areaMm2 / Math.max(outer.areaMm2, 0.000001)
      if (areaRatio < 0.05) {
        return withRole(candidate, 'auxiliary', '位于外轮廓外且面积较小，疑似辅助线')
      }
      return withRole(candidate, 'unknown', '闭合轮廓未包含在主外形内，需人工确认')
    }),
  ]
}

function detectOutlineCandidates(segments: GerberGeometrySegment[]): GerberOutlineCandidate[] {
  const candidates: GerberOutlineCandidate[] = []
  let currentSegments: GerberGeometrySegment[] = []
  let currentPoints: GerberGeometryPoint[] = []

  const flush = (): void => {
    const candidate = createOutlineCandidate(
      `outline-${candidates.length + 1}`,
      currentSegments,
      currentPoints,
    )
    if (candidate && candidate.closed && candidate.areaMm2 > 0.01) candidates.push(candidate)
    currentSegments = []
    currentPoints = []
  }

  for (const segment of segments) {
    if (currentSegments.length === 0) {
      currentSegments = [segment]
      currentPoints = [...segment.points]
      continue
    }

    const previousEnd = currentSegments[currentSegments.length - 1].end
    if (!nearlySamePoint(previousEnd, segment.start)) flush()
    currentSegments.push(segment)
    appendSegmentPoints(currentPoints, segment)
  }
  flush()

  return classifyOutlineCandidates(candidates)
}

export function parseGerberLayerGeometry(input: {
  packagePath: string
  entry: string
  content: string
  truncated: boolean
}): GerberLayerGeometry {
  const state: ParserState = {
    format: DEFAULT_FORMAT,
    unit: 'mm',
    interpolation: 'linear',
    operation: 'draw',
    current: { x: 0, y: 0 },
    segments: [],
    warnings: [],
  }

  for (const statement of splitStatements(input.content)) {
    updateModes(statement, state)
    parseCoordinateStatement(statement, state)
  }

  if (input.truncated) {
    state.warnings.push('源 Gerber 内容过大，当前仅解析了前 2 MB。')
  }
  if (state.segments.length === 0) {
    state.warnings.push(
      '未解析到可绘制线段；可能是钻孔文件、纯 aperture/region，或暂不支持的 Gerber 写法。',
    )
  }

  return {
    packagePath: input.packagePath,
    entry: input.entry,
    unit: state.unit,
    bounds: computeBounds(state.segments),
    segments: state.segments,
    outlineCandidates: detectOutlineCandidates(state.segments),
    warnings: state.warnings,
    truncated: input.truncated,
  }
}
