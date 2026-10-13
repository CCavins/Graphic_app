import { outlineStroke } from './boolean'
import { cmd, commandsBounds, distToSegment, localToPaper, paperBounds, paperToLocal, pivotOf, pointInPolygon, sampleCommands, unionBounds } from './geometry'
import type { Cmd, Doc, Pt, Rect, SceneNode, TransformOrigin, TransformStep } from './types'
import { InputError } from './units'

export const IDENTITY_STEP: TransformStep = { dx: 0, dy: 0, rotate: 0, scaleX: 1, scaleY: 1, shearX: 0, shearY: 0, origin: 'c' }

/** Stroke weight that stays a similar fraction of the symbol as the library thumbnail. */
export function symbolStrokeWidth(span: number): number {
  return Math.min(36, Math.max(0.75, span / 42))
}

export function originPoint(box: Rect, origin: TransformOrigin): Pt {
  const fx = origin.includes('w') ? 0 : origin.includes('e') ? 1 : 0.5
  const fy = origin.startsWith('n') ? 0 : origin.startsWith('s') ? 1 : 0.5
  return { x: box.x + box.w * fx, y: box.y + box.h * fy }
}

function rotatePoint(p: Pt, about: Pt, angle: number): Pt {
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const dx = p.x - about.x
  const dy = p.y - about.y
  return { x: about.x + dx * cos - dy * sin, y: about.y + dx * sin + dy * cos }
}

function mapCommands(commands: Cmd[], fn: (x: number, y: number) => Pt): Cmd[] {
  return commands.map((c) => {
    if (c.c === 'Z') return c
    const p = fn(c.x, c.y)
    if (c.c !== 'C') return { ...c, x: p.x, y: p.y }
    const p1 = fn(c.x1, c.y1)
    const p2 = fn(c.x2, c.y2)
    return { ...c, x: p.x, y: p.y, x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y }
  })
}

function nodeCenter(node: SceneNode): Pt {
  return localToPaper(node, pivotOf(node))
}

/**
 * Apply a transform step to nodes about an origin on their combined bounds.
 * Order: scale, shear, rotate, then move, which matches the panel's separate tabs being applied one at a time.
 */
export function transformNodes(nodes: SceneNode[], step: TransformStep, scaleStyles = false): void {
  if (!nodes.length) throw new InputError('Nothing selected')
  if (!(step.scaleX > 0) || !(step.scaleY > 0)) throw new InputError('Scale must be positive')
  const union = unionBounds(nodes.map((n) => paperBounds(n)))
  const origin = originPoint(union, step.origin)
  for (const node of nodes) {
    if (node.locked) continue
    if (node.dimension) {
      const d = node.dimension
      const pts = [
        { x: d.x1, y: d.y1 },
        { x: d.x2, y: d.y2 },
      ].map((p) => {
        let q = { x: origin.x + (p.x - origin.x) * step.scaleX, y: origin.y + (p.y - origin.y) * step.scaleY }
        q = { x: q.x + (q.y - origin.y) * Math.tan(step.shearX), y: q.y + (q.x - origin.x) * Math.tan(step.shearY) }
        q = rotatePoint(q, origin, step.rotate)
        return { x: q.x + step.dx, y: q.y + step.dy }
      })
      node.dimension = { ...d, x1: pts[0].x, y1: pts[0].y, x2: pts[1].x, y2: pts[1].y }
      continue
    }
    if (step.scaleX !== 1 || step.scaleY !== 1) {
      const before = nodeCenter(node)
      scaleLocal(node, step.scaleX, step.scaleY, scaleStyles)
      const after = nodeCenter(node)
      // The node's center scales about the origin like every other point.
      node.x += origin.x + (before.x - origin.x) * step.scaleX - after.x
      node.y += origin.y + (before.y - origin.y) * step.scaleY - after.y
    }
    if (step.shearX !== 0 || step.shearY !== 0) {
      const tx = Math.tan(step.shearX)
      const ty = Math.tan(step.shearY)
      const shear = (commands: SceneNode['commands']) => mapCommands(commands, (x, y) => ({ x: x + y * tx, y: y + x * ty }))
      node.commands = shear(node.commands)
      if (node.shade) node.shade = shear(node.shade)
      if (node.ink) node.ink = shear(node.ink)
      node.x += (node.y - origin.y) * tx
      node.y += (node.x - origin.x) * ty
    }
    if (step.rotate !== 0) rotateNode(node, step.rotate, origin)
    node.x += step.dx
    node.y += step.dy
  }
}

/** Scale a node in its own coordinate space about its local (0, 0); groups scale their children with them. */
export function scaleLocal(node: SceneNode, sx: number, sy: number, scaleStyles = false): void {
  const max = Math.max(sx, sy)
  const scale = (commands: SceneNode['commands']) => mapCommands(commands, (x, y) => ({ x: x * sx, y: y * sy }))
  node.commands = scale(node.commands)
  if (node.shade) node.shade = scale(node.shade)
  if (node.ink) node.ink = scale(node.ink)
  if (node.text) {
    node.text.fontSize *= max
    node.text.fieldWidth *= sx
  }
  if (node.dimension) {
    const d = node.dimension
    node.dimension = { ...d, x1: d.x1 * sx, y1: d.y1 * sy, x2: d.x2 * sx, y2: d.y2 * sy }
  }
  if (scaleStyles) {
    for (const attr of node.appearance) {
      if (attr.kind === 'stroke') attr.width *= max
      if (attr.kind !== 'fill' && attr.kind !== 'stroke') {
        attr.blur *= max
        attr.dx *= sx
        attr.dy *= sy
      }
    }
  }
  if (node.symbolId) {
    const box = commandsBounds(node.commands)
    const stroke = node.appearance.find((attr) => attr.kind === 'stroke')
    if (stroke && stroke.kind === 'stroke') stroke.width = symbolStrokeWidth(Math.max(box.w, box.h))
  }
  for (const child of node.children) {
    child.x *= sx
    child.y *= sy
    scaleLocal(child, sx, sy, scaleStyles)
  }
}

/**
 * Rotate a node about a point in its parent's coordinate space.
 * Groups have no rotation of their own: their children turn about the group's center instead.
 */
export function rotateNode(node: SceneNode, angle: number, about: Pt): void {
  const before = nodeCenter(node)
  const after = rotatePoint(before, about, angle)
  node.x += after.x - before.x
  node.y += after.y - before.y
  if (node.kind === 'group') {
    const pivot = pivotOf(node)
    for (const child of node.children) rotateNode(child, angle, pivot)
    return
  }
  if (node.dimension) {
    const d = node.dimension
    const center = { x: (d.x1 + d.x2) / 2, y: (d.y1 + d.y2) / 2 }
    const a = rotatePoint({ x: d.x1, y: d.y1 }, center, angle)
    const b = rotatePoint({ x: d.x2, y: d.y2 }, center, angle)
    node.dimension = { ...d, x1: a.x, y1: a.y, x2: b.x, y2: b.y }
    return
  }
  node.rotation += angle
}

/** Nodes whose paper bounds touch (or sit fully inside) a marquee rectangle. */
export function nodesInRect(doc: Doc, rect: Rect, fullyInside: boolean, layerId?: string): string[] {
  const ids: string[] = []
  const r = { x: Math.min(rect.x, rect.x + rect.w), y: Math.min(rect.y, rect.y + rect.h), w: Math.abs(rect.w), h: Math.abs(rect.h) }
  for (const layer of doc.layers) {
    if (!layer.visible || layer.locked) continue
    if (layerId && layer.id !== layerId) continue
    for (const node of layer.children) {
      if (!node.visible || node.locked) continue
      const b = paperBounds(node)
      const inside = b.x >= r.x && b.y >= r.y && b.x + b.w <= r.x + r.w && b.y + b.h <= r.y + r.h
      const touches = b.x < r.x + r.w && b.x + b.w > r.x && b.y < r.y + r.h && b.y + b.h > r.y
      if (fullyInside ? inside : touches) ids.push(node.id)
    }
  }
  return ids
}

export function paperCommands(node: SceneNode): Cmd[] {
  return node.commands.map((command) => {
    if (command.c === 'Z') return command
    const point = localToPaper(node, { x: command.x, y: command.y })
    const c1 = localToPaper(node, { x: command.x1, y: command.y1 })
    const c2 = localToPaper(node, { x: command.x2, y: command.y2 })
    return { ...command, x: point.x, y: point.y, x1: c1.x, y1: c1.y, x2: c2.x, y2: c2.y }
  })
}

/** Merge several paths into one node with multiple subpaths, like Graphic's Make Compound Path. */
export function compoundCommands(nodes: SceneNode[]): Cmd[] {
  if (nodes.length < 2) throw new InputError('Select two or more paths to make a compound path')
  return nodes.flatMap((node) => paperCommands(node))
}

interface Segment {
  index: number
  t: number
  point: Pt
  distance: number
}

/** The command segment closest to a local point, with the parameter along it. */
export function nearestSegment(commands: Cmd[], local: Pt): Segment | null {
  let best: Segment | null = null
  let cx = 0
  let cy = 0
  let sx = 0
  let sy = 0
  commands.forEach((c, index) => {
    if (c.c === 'M') {
      cx = sx = c.x
      cy = sy = c.y
      return
    }
    if (c.c === 'Z') {
      cx = sx
      cy = sy
      return
    }
    const steps = c.c === 'C' ? 24 : 1
    let prev = { x: cx, y: cy }
    for (let i = 1; i <= steps; i++) {
      const t = i / steps
      const next = c.c === 'C' ? bezierAt({ x: cx, y: cy }, { x: c.x1, y: c.y1 }, { x: c.x2, y: c.y2 }, { x: c.x, y: c.y }, t) : { x: c.x, y: c.y }
      const distance = distToSegment(local, prev, next)
      if (!best || distance < best.distance) {
        const segLen = Math.hypot(next.x - prev.x, next.y - prev.y) || 1
        const proj = Math.max(0, Math.min(1, ((local.x - prev.x) * (next.x - prev.x) + (local.y - prev.y) * (next.y - prev.y)) / (segLen * segLen)))
        const tt = (i - 1 + proj) / steps
        best = { index, t: tt, point: c.c === 'C' ? bezierAt({ x: cx, y: cy }, { x: c.x1, y: c.y1 }, { x: c.x2, y: c.y2 }, { x: c.x, y: c.y }, tt) : { x: prev.x + (next.x - prev.x) * proj, y: prev.y + (next.y - prev.y) * proj }, distance }
      }
      prev = next
    }
    cx = c.x
    cy = c.y
  })
  return best
}

function bezierAt(p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): Pt {
  const mt = 1 - t
  return {
    x: mt ** 3 * p0.x + 3 * mt ** 2 * t * p1.x + 3 * mt * t ** 2 * p2.x + t ** 3 * p3.x,
    y: mt ** 3 * p0.y + 3 * mt ** 2 * t * p1.y + 3 * mt * t ** 2 * p2.y + t ** 3 * p3.y,
  }
}

function splitCommand(start: Pt, c: Cmd, t: number): [Cmd, Cmd] {
  if (c.c !== 'C') {
    const mid = { x: start.x + (c.x - start.x) * t, y: start.y + (c.y - start.y) * t }
    return [cmd('L', mid.x, mid.y), cmd('L', c.x, c.y)]
  }
  const lerp = (a: Pt, b: Pt) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
  const p0 = start
  const p1 = { x: c.x1, y: c.y1 }
  const p2 = { x: c.x2, y: c.y2 }
  const p3 = { x: c.x, y: c.y }
  const p01 = lerp(p0, p1)
  const p12 = lerp(p1, p2)
  const p23 = lerp(p2, p3)
  const p012 = lerp(p01, p12)
  const p123 = lerp(p12, p23)
  const mid = lerp(p012, p123)
  return [cmd('C', mid.x, mid.y, p01.x, p01.y, p012.x, p012.y), cmd('C', p3.x, p3.y, p123.x, p123.y, p23.x, p23.y)]
}

function startOf(commands: Cmd[], index: number): Pt {
  let cx = 0
  let cy = 0
  let sx = 0
  let sy = 0
  for (let i = 0; i < index; i++) {
    const c = commands[i]
    if (c.c === 'M') {
      cx = sx = c.x
      cy = sy = c.y
    } else if (c.c === 'Z') {
      cx = sx
      cy = sy
    } else {
      cx = c.x
      cy = c.y
    }
  }
  return { x: cx, y: cy }
}

/** Insert an anchor on the segment nearest `local` without changing the shape. */
export function addAnchor(commands: Cmd[], local: Pt): Cmd[] {
  const seg = nearestSegment(commands, local)
  if (!seg) return commands
  const [a, b] = splitCommand(startOf(commands, seg.index), commands[seg.index], seg.t)
  return [...commands.slice(0, seg.index), a, b, ...commands.slice(seg.index + 1)]
}

/** Cut a path at the point nearest `local`. A closed path opens; an open path becomes two. */
export function splitPath(commands: Cmd[], local: Pt): Cmd[][] {
  const seg = nearestSegment(commands, local)
  if (!seg) return [commands]
  const [a, b] = splitCommand(startOf(commands, seg.index), commands[seg.index], seg.t)
  const closed = commands.some((c) => c.c === 'Z')
  const head = [...commands.slice(0, seg.index), a]
  const tail = [cmd('M', seg.point.x, seg.point.y), b, ...commands.slice(seg.index + 1).filter((c) => c.c !== 'Z')]
  if (closed) {
    // Walk from the cut around to the cut again as one open path.
    const first = head[0]
    const back = first && first.c === 'M' ? cmd('L', first.x, first.y) : null
    return [[...tail, ...(back ? [back] : []), ...head.slice(1)]]
  }
  return [head, tail]
}

/** Anchor positions (command end points) in local space. */
export function anchors(commands: Cmd[]): { index: number; x: number; y: number }[] {
  return commands.map((c, index) => ({ index, x: c.x, y: c.y })).filter((_, index) => commands[index].c !== 'Z')
}

export function nearestAnchor(node: SceneNode, paper: Pt, tolerance: number): number | null {
  const local = paperToLocal(node, paper)
  let best: number | null = null
  let bestDist = tolerance
  for (const anchor of anchors(node.commands)) {
    const d = Math.hypot(anchor.x - local.x, anchor.y - local.y)
    if (d <= bestDist) {
      best = anchor.index
      bestDist = d
    }
  }
  return best
}

/** Move one anchor (and its incoming/outgoing handles) by a local delta. */
export function moveAnchor(commands: Cmd[], index: number, dx: number, dy: number): Cmd[] {
  return commands.map((c, i) => {
    if (i === index && c.c !== 'Z') {
      return { ...c, x: c.x + dx, y: c.y + dy, x2: c.c === 'C' ? c.x2 + dx : c.x2, y2: c.c === 'C' ? c.y2 + dy : c.y2 }
    }
    if (i === index + 1 && c.c === 'C') return { ...c, x1: c.x1 + dx, y1: c.y1 + dy }
    return c
  })
}

/** Break the path at an anchor: the anchor becomes the end of one path and the start of another. */
export function disconnectAt(commands: Cmd[], index: number): Cmd[][] {
  const closed = commands.some((c) => c.c === 'Z')
  const open = commands.filter((c) => c.c !== 'Z')
  if (index <= 0 || index >= open.length - 1) {
    if (closed) {
      const rotated = [...open.slice(index), ...open.slice(1, index + 1)]
      return [[cmd('M', open[index].x, open[index].y), ...rotated.slice(1).map((c) => (c.c === 'M' ? cmd('L', c.x, c.y) : c))]]
    }
    return [open]
  }
  const head = open.slice(0, index + 1)
  const tail = [cmd('M', open[index].x, open[index].y), ...open.slice(index + 1)]
  if (closed) {
    const first = open[0]
    return [[...tail, cmd('L', first.x, first.y), ...head.slice(1)]]
  }
  return [head, tail]
}

/** A closed polygon around a drag stroke, used by the eraser. */
export function corridor(points: Pt[], width: number): Cmd[] {
  if (points.length < 2) {
    const p = points[0] ?? { x: 0, y: 0 }
    return [cmd('M', p.x - width / 2, p.y - width / 2), cmd('L', p.x + width / 2, p.y - width / 2), cmd('L', p.x + width / 2, p.y + width / 2), cmd('L', p.x - width / 2, p.y + width / 2), cmd('Z')]
  }
  const commands = points.map((p, i) => cmd(i === 0 ? 'M' : 'L', p.x, p.y))
  const fake: SceneNode = {
    id: 'eraser',
    name: 'Eraser',
    kind: 'path',
    x: 0,
    y: 0,
    rotation: 0,
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    commands,
    children: [],
    clip: false,
    appearance: [{ id: 'e', kind: 'stroke', enabled: true, color: { space: 'rgb', r: 0, g: 0, b: 0, a: 1 }, opacity: 1, width, align: 'center', dash: [], arrows: 'none' }],
  }
  return outlineStroke(fake)
}

export function pointsAlong(commands: Cmd[]): Pt[] {
  return sampleCommands(commands, 6)
}

function subpathsOf(commands: Cmd[]): Cmd[][] {
  const parts: Cmd[][] = []
  let current: Cmd[] = []
  for (const command of commands) {
    if (command.c === 'M' && current.length) {
      parts.push(current)
      current = []
    }
    current.push(command)
  }
  if (current.length) parts.push(current)
  return parts
}

function ringArea(points: Pt[]): number {
  let area = 0
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) area += points[j].x * points[i].y - points[i].x * points[j].y
  return Math.abs(area) / 2
}

function interiorPoint(points: Pt[]): Pt {
  const center = {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
  }
  if (pointInPolygon(center, points)) return center
  return points[Math.floor(points.length / 2)] ?? center
}

/**
 * Split a path into separate shapes. A hole stays with the shape around it.
 * Two contours that do not touch become two shapes, even when one's box sits inside the other's.
 */
export function separateContours(commands: Cmd[]): Cmd[][] {
  const parts = subpathsOf(commands)
  if (parts.length < 2) return parts.length ? [commands] : []
  const rings = parts.map((part) => sampleCommands(part, 6))
  const areas = rings.map(ringArea)
  const points = rings.map(interiorPoint)
  const parent = parts.map((_, index) => {
    let best = -1
    let bestArea = Infinity
    rings.forEach((ring, other) => {
      if (other === index || !(areas[other] > areas[index] * 1.05)) return
      if (!pointInPolygon(points[index], ring)) return
      if (areas[other] < bestArea) {
        best = other
        bestArea = areas[other]
      }
    })
    return best
  })
  const descendants = (index: number): number[] => {
    const children = parent.flatMap((owner, child) => (owner === index ? [child] : []))
    return [index, ...children.flatMap(descendants)]
  }
  const roots = parent.flatMap((owner, index) => (owner === -1 ? [index] : []))
  if (roots.length < 2) return [commands]
  return roots.map((root) => descendants(root).flatMap((index) => parts[index]))
}

function pathSamples(commands: Cmd[], step: number): Pt[] {
  const rough = sampleCommands(commands, 8)
  const out: Pt[] = []
  for (const point of rough) {
    const prev = out[out.length - 1]
    if (!prev) {
      out.push(point)
      continue
    }
    const length = Math.hypot(point.x - prev.x, point.y - prev.y)
    const count = Math.max(1, Math.ceil(length / step))
    for (let i = 1; i <= count; i++) {
      const t = i / count
      out.push({ x: prev.x + (point.x - prev.x) * t, y: prev.y + (point.y - prev.y) * t })
    }
  }
  return out
}

/**
 * Cut an open path with an eraser stroke. Returns null when the eraser misses,
 * an empty list when the whole path is removed, or one piece per remaining section.
 */
export function trimOpenPath(commands: Cmd[], eraser: Pt[], radius: number): Cmd[][] | null {
  if (commands.some((command) => command.c === 'Z') || eraser.length === 0 || !(radius > 0)) return null
  const samples = pathSamples(commands, Math.max(1, radius / 2))
  if (samples.length < 2) return null
  const hit = (point: Pt) => {
    for (let i = 0; i < eraser.length; i++) {
      if (Math.hypot(point.x - eraser[i].x, point.y - eraser[i].y) <= radius) return true
      if (i > 0 && distToSegment(point, eraser[i - 1], eraser[i]) <= radius) return true
    }
    return false
  }
  const edge = (outside: Pt, inside: Pt): Pt => {
    let near = 0
    let far = 1
    for (let i = 0; i < 14; i++) {
      const t = (near + far) / 2
      const point = { x: outside.x + (inside.x - outside.x) * t, y: outside.y + (inside.y - outside.y) * t }
      if (hit(point)) far = t
      else near = t
    }
    return { x: outside.x + (inside.x - outside.x) * near, y: outside.y + (inside.y - outside.y) * near }
  }
  if (!samples.some(hit)) return null
  const pieces: Pt[][] = []
  let run: Pt[] = []
  const finish = () => {
    if (run.length >= 2) pieces.push(run)
    run = []
  }
  samples.forEach((point, index) => {
    if (!hit(point)) {
      if (!run.length && index > 0 && hit(samples[index - 1])) run.push(edge(point, samples[index - 1]))
      run.push(point)
      return
    }
    if (run.length && index > 0 && !hit(samples[index - 1])) run.push(edge(samples[index - 1], point))
    finish()
  })
  finish()
  return pieces
    .filter((piece) => Math.hypot(piece[piece.length - 1].x - piece[0].x, piece[piece.length - 1].y - piece[0].y) > radius * 0.25)
    .map((piece) => piece.map((point, index) => cmd(index === 0 ? 'M' : 'L', point.x, point.y)))
}
