import { adjustColor, colorsEqual, toRgb } from './color'
import { commandsBounds, paperBounds, unionBounds } from './geometry'
import type { AppearanceItem, Doc, Rect, SceneNode } from './types'
import { findNode, parentList, selectedNodes } from './factory'
import { InputError } from './units'
import { uid } from './types'

export type AlignMode = 'left' | 'right' | 'top' | 'bottom' | 'center' | 'middle'
export type SimilarKey =
  | 'appearance'
  | 'fill-stroke'
  | 'fill'
  | 'fill-color'
  | 'fill-type'
  | 'stroke'
  | 'stroke-color'
  | 'stroke-type'
  | 'stroke-width'
  | 'opacity'

function frontFill(node: SceneNode): AppearanceItem | undefined {
  return [...node.appearance].reverse().find((a) => a.kind === 'fill' && a.enabled)
}

function frontStroke(node: SceneNode): AppearanceItem | undefined {
  return [...node.appearance].reverse().find((a) => a.kind === 'stroke' && a.enabled)
}

export function alignNodes(nodes: SceneNode[], mode: AlignMode): void {
  if (nodes.length < 2) throw new InputError('Select at least two objects to align')
  const boxes = nodes.map((n) => paperBounds(n))
  const union = unionBounds(boxes)
  nodes.forEach((node, i) => {
    const box = boxes[i]
    if (mode === 'left') node.x += union.x - box.x
    if (mode === 'right') node.x += union.x + union.w - (box.x + box.w)
    if (mode === 'top') node.y += union.y - box.y
    if (mode === 'bottom') node.y += union.y + union.h - (box.y + box.h)
    if (mode === 'center') node.x += union.x + union.w / 2 - (box.x + box.w / 2)
    if (mode === 'middle') node.y += union.y + union.h / 2 - (box.y + box.h / 2)
  })
}

export function distributeNodes(nodes: SceneNode[], axis: 'h' | 'v'): void {
  if (nodes.length < 3) throw new InputError('Select at least three objects to distribute')
  const items = nodes
    .map((node) => ({ node, box: paperBounds(node) }))
    .sort((a, b) => (axis === 'h' ? a.box.x - b.box.x : a.box.y - b.box.y))
  const first = items[0].box
  const last = items[items.length - 1].box
  const span = axis === 'h' ? last.x + last.w - first.x : last.y + last.h - first.y
  const total = items.reduce((sum, item) => sum + (axis === 'h' ? item.box.w : item.box.h), 0)
  const gap = (span - total) / (items.length - 1)
  let cursor = axis === 'h' ? first.x : first.y
  for (const item of items) {
    if (axis === 'h') item.node.x += cursor - item.box.x
    else item.node.y += cursor - item.box.y
    cursor += (axis === 'h' ? item.box.w : item.box.h) + gap
  }
}

export function flipNodes(nodes: SceneNode[], axis: 'h' | 'v'): void {
  if (!nodes.length) throw new InputError('Nothing selected')
  const union = unionBounds(nodes.map((n) => paperBounds(n)))
  for (const node of nodes) {
    const box = paperBounds(node)
    if (axis === 'h') {
      const delta = union.x + union.w - (box.x + box.w) - (box.x - union.x)
      node.x += delta
    } else {
      const delta = union.y + union.h - (box.y + box.h) - (box.y - union.y)
      node.y += delta
    }
  }
}

export function sameAppearance(a: SceneNode, b: SceneNode, key: SimilarKey): boolean {
  const fa = frontFill(a)
  const fb = frontFill(b)
  const sa = frontStroke(a)
  const sb = frontStroke(b)
  const fillType = (item?: AppearanceItem) => {
    if (!item || item.kind !== 'fill') return 'none'
    if (item.imageId) return 'image'
    if (item.patternId) return 'pattern'
    if (item.gradient) return 'gradient'
    return 'solid'
  }
  if (key === 'opacity') return a.opacity === b.opacity
  if (key === 'fill-color') {
    return Boolean(fa && fb && fa.kind === 'fill' && fb.kind === 'fill' && !fa.gradient && !fb.gradient && colorsEqual(fa.color, fb.color))
  }
  if (key === 'fill-type') return fillType(fa) === fillType(fb)
  if (key === 'fill') {
    return Boolean(fa && fb && fa.kind === 'fill' && fb.kind === 'fill' && fillType(fa) === fillType(fb) && colorsEqual(fa.color, fb.color))
  }
  if (key === 'stroke-color') {
    return Boolean(sa && sb && sa.kind === 'stroke' && sb.kind === 'stroke' && colorsEqual(sa.color, sb.color))
  }
  if (key === 'stroke-width') {
    return Boolean(sa && sb && sa.kind === 'stroke' && sb.kind === 'stroke' && sa.width === sb.width)
  }
  if (key === 'stroke-type') {
    const dashed = (item?: AppearanceItem) => Boolean(item && item.kind === 'stroke' && item.dash.length)
    return dashed(sa) === dashed(sb)
  }
  if (key === 'stroke') {
    return Boolean(
      sa &&
        sb &&
        sa.kind === 'stroke' &&
        sb.kind === 'stroke' &&
        sa.width === sb.width &&
        colorsEqual(sa.color, sb.color) &&
        sa.dash.join() === sb.dash.join(),
    )
  }
  if (key === 'fill-stroke') return sameAppearance(a, b, 'fill') && sameAppearance(a, b, 'stroke')
  return JSON.stringify(a.appearance) === JSON.stringify(b.appearance) && a.opacity === b.opacity
}

export function selectSimilar(doc: Doc, source: SceneNode, key: SimilarKey, scope: 'layer' | 'all'): string[] {
  const ids: string[] = []
  const layers = scope === 'layer' ? doc.layers.filter((l) => l.id === doc.activeLayerId) : doc.layers
  const walk = (nodes: SceneNode[]) => {
    for (const node of nodes) {
      if (sameAppearance(source, node, key)) ids.push(node.id)
      walk(node.children)
    }
  }
  for (const layer of layers) walk(layer.children)
  return ids
}

export function recolorNode(node: SceneNode, method: 'hue' | 'balance' | 'brightness', amount: number): void {
  for (const attr of node.appearance) {
    if (attr.kind === 'blur') continue
    attr.color = adjustColor(attr.color, method, amount)
    if (attr.kind === 'fill' && attr.gradient) {
      attr.gradient.stops = attr.gradient.stops.map((stop) => ({
        ...stop,
        color: adjustColor(stop.color, method, amount),
      }))
    }
  }
  for (const child of node.children) recolorNode(child, method, amount)
}

export function joinOpenPaths(a: SceneNode, b: SceneNode): SceneNode['commands'] {
  const left = a.commands.filter((c) => c.c !== 'Z')
  const right = b.commands.filter((c) => c.c !== 'Z')
  if (!left.length || !right.length) throw new InputError('Join needs two open paths')
  return [...left, ...right.map((c, i) => (i === 0 ? { ...c, c: 'L' as const } : c))]
}

export function closePath(commands: SceneNode['commands']): SceneNode['commands'] {
  if (commands.some((c) => c.c === 'Z')) return commands
  return [...commands, { c: 'Z', x: 0, y: 0, x1: 0, y1: 0, x2: 0, y2: 0 }]
}

export function openPath(commands: SceneNode['commands']): SceneNode['commands'] {
  return commands.filter((c) => c.c !== 'Z')
}

export function resizeArtwork(doc: Doc, factor: number, scaleEffects: boolean): void {
  if (!(factor > 0)) throw new InputError('Scale factor must be positive')
  doc.canvas.width *= factor
  doc.canvas.height *= factor
  const scaleNode = (node: SceneNode) => {
    node.x *= factor
    node.y *= factor
    node.commands = node.commands.map((c) => ({
      ...c,
      x: c.x * factor,
      y: c.y * factor,
      x1: c.x1 * factor,
      y1: c.y1 * factor,
      x2: c.x2 * factor,
      y2: c.y2 * factor,
    }))
    if (scaleEffects) {
      for (const attr of node.appearance) {
        if (attr.kind === 'stroke') attr.width *= factor
        if (attr.kind !== 'fill' && attr.kind !== 'stroke') {
          attr.blur *= factor
          attr.dx *= factor
          attr.dy *= factor
        }
      }
    }
    if (node.text) node.text.fontSize *= factor
    if (node.dimension) {
      node.dimension.x1 *= factor
      node.dimension.y1 *= factor
      node.dimension.x2 *= factor
      node.dimension.y2 *= factor
      node.dimension.offset *= factor
    }
    node.children.forEach(scaleNode)
  }
  for (const layer of doc.layers) layer.children.forEach(scaleNode)
}

export function resizeCanvasSide(doc: Doc, side: 'left' | 'right' | 'top' | 'bottom', amount: number): void {
  if (side === 'right') doc.canvas.width += amount
  if (side === 'bottom') doc.canvas.height += amount
  if (side === 'left') {
    doc.canvas.width += amount
    for (const layer of doc.layers) for (const node of layer.children) node.x += amount
  }
  if (side === 'top') {
    doc.canvas.height += amount
    for (const layer of doc.layers) for (const node of layer.children) node.y += amount
  }
  if (!(doc.canvas.width > 0) || !(doc.canvas.height > 0)) throw new InputError('Canvas size must be positive')
  if (doc.canvas.width > 16000 || doc.canvas.height > 16000) throw new InputError('Canvas cannot exceed 16000 by 16000')
}

export function nodeLength(node: SceneNode): number {
  if (node.dimension) return Math.hypot(node.dimension.x2 - node.dimension.x1, node.dimension.y2 - node.dimension.y1)
  const box = commandsBounds(node.commands)
  return Math.max(box.w, box.h)
}

export function selectionBounds(doc: Doc, ids: string[]): Rect {
  return unionBounds(selectedNodes(doc, ids).map((n) => paperBounds(n)))
}

export function applyStyle(node: SceneNode, appearance: AppearanceItem[]): void {
  node.appearance = structuredClone(appearance)
}

export function removeNode(doc: Doc, id: string): void {
  const list = parentList(doc, id)
  if (!list) return
  const index = list.findIndex((n) => n.id === id)
  if (index >= 0) list.splice(index, 1)
}

export function bringForward(doc: Doc, id: string): void {
  const list = parentList(doc, id)
  if (!list) return
  const index = list.findIndex((n) => n.id === id)
  if (index < 0 || index === list.length - 1) return
  const [node] = list.splice(index, 1)
  list.splice(index + 1, 0, node)
}

export function sendBackward(doc: Doc, id: string): void {
  const list = parentList(doc, id)
  if (!list) return
  const index = list.findIndex((n) => n.id === id)
  if (index <= 0) return
  const [node] = list.splice(index, 1)
  list.splice(index - 1, 0, node)
}

export function cssOf(node: SceneNode): string {
  const fill = node.appearance.find((a) => a.kind === 'fill' && a.enabled)
  const stroke = node.appearance.find((a) => a.kind === 'stroke' && a.enabled)
  const fillCss = fill && fill.kind === 'fill' ? `fill: ${toRgb(fill.color).r};` : 'fill: none;'
  const strokeCss = stroke && stroke.kind === 'stroke' ? `stroke-width: ${stroke.width}px;` : ''
  return `${fillCss} ${strokeCss}`.trim()
}

export function cloneNode(node: SceneNode, dx = 16, dy = 16): SceneNode {
  const copy = structuredClone(node)
  const stamp = (item: SceneNode) => {
    item.id = uid('n')
    item.x += dx
    item.y += dy
    item.children.forEach(stamp)
  }
  stamp(copy)
  return copy
}

export function requireNode(doc: Doc, id: string): SceneNode {
  const node = findNode(doc, id)
  if (!node) throw new InputError('Object not found')
  return node
}
