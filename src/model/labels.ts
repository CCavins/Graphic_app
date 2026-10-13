import { commandsBounds, sampleCommands, textFrame } from './geometry'
import type { CanvasSettings, LabelKind, LabelLocation, ObjectLabel, Rect, SceneNode } from './types'
import { formatArea, formatWorldLength, paperPointsToWorldInches } from './units'

export const DEFAULT_LOCATION: Record<LabelKind, LabelLocation> = {
  width: 'top',
  height: 'left',
  size: 'top',
  area: 'center',
  length: 'top',
  text: 'top',
}

/** The labels on a node, reading older single-label files too. */
export function nodeLabels(node: SceneNode): ObjectLabel[] {
  if (node.labels) return node.labels
  if (node.label) return [node.label]
  return []
}

export function makeLabel(kind: LabelKind, canvas: CanvasSettings, text = ''): ObjectLabel {
  return {
    kind,
    text,
    location: DEFAULT_LOCATION[kind],
    offset: 6,
    align: 'centered',
    showUnits: canvas.showUnits,
    precision: structuredClone(canvas.precision),
  }
}

/** Bounds in the node's own coordinate space (before its rotation and position). */
export function localBounds(node: SceneNode): Rect {
  const frame = textFrame(node)
  if (frame) return { x: 0, y: 0, w: frame.w, h: frame.h }
  if (node.dimension) {
    const d = node.dimension
    return { x: Math.min(d.x1, d.x2), y: Math.min(d.y1, d.y2), w: Math.abs(d.x2 - d.x1), h: Math.abs(d.y2 - d.y1) }
  }
  return commandsBounds(node.commands)
}

export function pathLength(node: SceneNode): number {
  if (node.dimension) return Math.hypot(node.dimension.x2 - node.dimension.x1, node.dimension.y2 - node.dimension.y1)
  const pts = sampleCommands(node.commands, 8)
  let total = 0
  for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y)
  return total
}

export function labelText(node: SceneNode, label: ObjectLabel, canvas: CanvasSettings): string {
  if (label.kind === 'text') return label.text
  const box = localBounds(node)
  const fmt = (points: number) =>
    formatWorldLength(paperPointsToWorldInches(points, canvas.realInchesPerPoint), canvas.labelUnit, label.precision, label.showUnits)
  if (label.kind === 'width') return fmt(box.w)
  if (label.kind === 'height') return fmt(box.h)
  if (label.kind === 'size') return `${fmt(box.w)} × ${fmt(box.h)}`
  if (label.kind === 'length') return fmt(pathLength(node))
  const inchesW = paperPointsToWorldInches(box.w, canvas.realInchesPerPoint)
  const inchesH = paperPointsToWorldInches(box.h, canvas.realInchesPerPoint)
  return formatArea(inchesW * inchesH, canvas.labelUnit, label.precision)
}

export interface LabelAnchor {
  x: number
  y: number
  /** Radians. Height labels read upward along the left edge. */
  angle: number
  textAlign: CanvasTextAlign
  baseline: CanvasTextBaseline
}

/**
 * Where a label sits, in the node's local space. `stackIndex` separates labels that share an edge.
 */
export function labelAnchor(node: SceneNode, label: ObjectLabel, stackIndex = 0): LabelAnchor {
  const box = localBounds(node)
  const gap = label.offset + stackIndex * 14
  switch (label.location) {
    case 'top':
      return { x: box.x + box.w / 2, y: box.y - gap, angle: 0, textAlign: 'center', baseline: 'bottom' }
    case 'bottom':
      return { x: box.x + box.w / 2, y: box.y + box.h + gap, angle: 0, textAlign: 'center', baseline: 'top' }
    case 'left':
      return { x: box.x - gap, y: box.y + box.h / 2, angle: -Math.PI / 2, textAlign: 'center', baseline: 'bottom' }
    case 'right':
      return { x: box.x + box.w + gap, y: box.y + box.h / 2, angle: -Math.PI / 2, textAlign: 'center', baseline: 'top' }
    default:
      return { x: box.x + box.w / 2, y: box.y + box.h / 2 + stackIndex * 14, angle: 0, textAlign: 'center', baseline: 'middle' }
  }
}

/** Labels with the stacking index for their edge, so width and size labels do not overlap. */
export function placedLabels(node: SceneNode): { label: ObjectLabel; stackIndex: number }[] {
  const counts: Partial<Record<LabelLocation, number>> = {}
  return nodeLabels(node).map((label) => {
    const index = counts[label.location] ?? 0
    counts[label.location] = index + 1
    return { label, stackIndex: index }
  })
}
