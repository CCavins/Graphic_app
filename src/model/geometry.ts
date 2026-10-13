import type { Cmd, Pt, Rect, SceneNode } from './types'

export function pt(x: number, y: number): Pt {
  return { x, y }
}

export function cmd(c: Cmd['c'], x = 0, y = 0, x1 = 0, y1 = 0, x2 = 0, y2 = 0): Cmd {
  return { c, x, y, x1, y1, x2, y2 }
}

export function rectCommands(w: number, h: number, radius = 0): Cmd[] {
  const r = Math.max(0, Math.min(radius, w / 2, h / 2))
  if (r <= 0) {
    return [cmd('M', 0, 0), cmd('L', w, 0), cmd('L', w, h), cmd('L', 0, h), cmd('Z')]
  }
  const k = r * 0.5522847498
  return [
    cmd('M', r, 0),
    cmd('L', w - r, 0),
    cmd('C', w, r, w - r + k, 0, w, r - k),
    cmd('L', w, h - r),
    cmd('C', w - r, h, w, h - r + k, w - k, h),
    cmd('L', r, h),
    cmd('C', 0, h - r, r - k, h, 0, h - k),
    cmd('L', 0, r),
    cmd('C', r, 0, 0, r - k, k, 0),
    cmd('Z'),
  ]
}

export function ellipseCommands(w: number, h: number): Cmd[] {
  const rx = w / 2
  const ry = h / 2
  const cx = rx
  const cy = ry
  const kx = rx * 0.5522847498
  const ky = ry * 0.5522847498
  return [
    cmd('M', cx, cy - ry),
    cmd('C', cx + rx, cy, cx + kx, cy - ry, cx + rx, cy - ky),
    cmd('C', cx, cy + ry, cx + rx, cy + ky, cx + kx, cy + ry),
    cmd('C', cx - rx, cy, cx - kx, cy + ry, cx - rx, cy + ky),
    cmd('C', cx, cy - ry, cx - rx, cy - ky, cx - kx, cy - ry),
    cmd('Z'),
  ]
}

export function polygonCommands(w: number, h: number, sides: number): Cmd[] {
  const n = Math.max(3, Math.round(sides))
  const cx = w / 2
  const cy = h / 2
  const cmds: Cmd[] = []
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n
    const x = cx + Math.cos(a) * cx
    const y = cy + Math.sin(a) * cy
    cmds.push(cmd(i === 0 ? 'M' : 'L', x, y))
  }
  cmds.push(cmd('Z'))
  return cmds
}

export function starCommands(w: number, h: number, points: number, innerRadius = 0.4): Cmd[] {
  const n = Math.max(3, Math.round(points))
  const inner = Math.max(0.05, Math.min(0.95, innerRadius))
  const cx = w / 2
  const cy = h / 2
  const cmds: Cmd[] = []
  for (let i = 0; i < n * 2; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / n
    const rad = i % 2 === 0 ? 1 : inner
    const x = cx + Math.cos(a) * cx * rad
    const y = cy + Math.sin(a) * cy * rad
    cmds.push(cmd(i === 0 ? 'M' : 'L', x, y))
  }
  cmds.push(cmd('Z'))
  return cmds
}

/** A quarter-ellipse arc. Pie closes through the corner, chord closes straight across. */
export function arcCommands(w: number, h: number, mode: 'open' | 'pie' | 'chord' = 'open'): Cmd[] {
  const rx = Math.abs(w)
  const ry = Math.abs(h)
  const kx = rx * 0.5522847498
  const ky = ry * 0.5522847498
  const arc = [cmd('M', 0, ry), cmd('C', rx, 0, 0, ry - ky, rx - kx, 0)]
  if (mode === 'pie') return [...arc, cmd('L', rx, ry), cmd('Z')]
  if (mode === 'chord') return [...arc, cmd('Z')]
  return arc
}

export function commandsBounds(commands: Cmd[]): Rect {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  const add = (x: number, y: number) => {
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
  }
  for (const c of commands) {
    if (c.c === 'Z') continue
    add(c.x, c.y)
    if (c.c === 'C') {
      add(c.x1, c.y1)
      add(c.x2, c.y2)
    }
  }
  if (!Number.isFinite(minX)) return { x: 0, y: 0, w: 0, h: 0 }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

export function sampleCommands(commands: Cmd[], steps = 8): Pt[] {
  const pts: Pt[] = []
  let cx = 0
  let cy = 0
  let sx = 0
  let sy = 0
  for (const c of commands) {
    if (c.c === 'M') {
      cx = c.x
      cy = c.y
      sx = c.x
      sy = c.y
      pts.push(pt(cx, cy))
    } else if (c.c === 'L') {
      cx = c.x
      cy = c.y
      pts.push(pt(cx, cy))
    } else if (c.c === 'C') {
      for (let i = 1; i <= steps; i++) {
        const t = i / steps
        const mt = 1 - t
        const x = mt ** 3 * cx + 3 * mt ** 2 * t * c.x1 + 3 * mt * t ** 2 * c.x2 + t ** 3 * c.x
        const y = mt ** 3 * cy + 3 * mt ** 2 * t * c.y1 + 3 * mt * t ** 2 * c.y2 + t ** 3 * c.y
        pts.push(pt(x, y))
      }
      cx = c.x
      cy = c.y
    } else if (c.c === 'Z') {
      cx = sx
      cy = sy
      pts.push(pt(sx, sy))
    }
  }
  return pts
}

export function pointInPolygon(p: Pt, poly: Pt[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x
    const yi = poly[i].y
    const xj = poly[j].x
    const yj = poly[j].y
    const intersect = yi > p.y !== yj > p.y && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi + 0) + xi
    if (intersect) inside = !inside
  }
  return inside
}

export function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = dx * dx + dy * dy
  const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len))
  const x = a.x + t * dx
  const y = a.y + t * dy
  return Math.hypot(p.x - x, p.y - y)
}

export function localToPaper(node: Pick<SceneNode, 'x' | 'y' | 'rotation' | 'commands'>, local: Pt): Pt {
  const b = commandsBounds(node.commands)
  const cx = b.x + b.w / 2
  const cy = b.y + b.h / 2
  const dx = local.x - cx
  const dy = local.y - cy
  const cos = Math.cos(node.rotation)
  const sin = Math.sin(node.rotation)
  return {
    x: node.x + (cx + dx * cos - dy * sin),
    y: node.y + (cy + dx * sin + dy * cos),
  }
}

export function paperToLocal(node: Pick<SceneNode, 'x' | 'y' | 'rotation' | 'commands'>, paper: Pt): Pt {
  const b = commandsBounds(node.commands)
  const cx = b.x + b.w / 2
  const cy = b.y + b.h / 2
  const cos = Math.cos(node.rotation)
  const sin = Math.sin(node.rotation)
  const dx = paper.x - node.x - cx
  const dy = paper.y - node.y - cy
  return { x: cx + dx * cos + dy * sin, y: cy + -dx * sin + dy * cos }
}

export function paperBounds(node: SceneNode): Rect {
  if (node.dimension) {
    const d = node.dimension
    const len = Math.hypot(d.x2 - d.x1, d.y2 - d.y1) || 1
    const ox = (-(d.y2 - d.y1) / len) * d.offset
    const oy = ((d.x2 - d.x1) / len) * d.offset
    const xs = [d.x1, d.x2, d.x1 + ox, d.x2 + ox].map((v) => v + node.x)
    const ys = [d.y1, d.y2, d.y1 + oy, d.y2 + oy].map((v) => v + node.y)
    return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }
  }
  const samples = sampleCommands(node.commands.length ? node.commands : [cmd('M', 0, 0), cmd('L', 1, 0), cmd('L', 1, 1), cmd('L', 0, 1)])
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of samples) {
    const q = localToPaper(node, p)
    minX = Math.min(minX, q.x)
    minY = Math.min(minY, q.y)
    maxX = Math.max(maxX, q.x)
    maxY = Math.max(maxY, q.y)
  }
  if (node.kind === 'text' && node.text) {
    const w = node.text.mode === 'field' ? node.text.fieldWidth : Math.max(20, node.text.content.length * node.text.fontSize * 0.5)
    const h = node.text.fontSize * 1.4
    const corners = [pt(0, 0), pt(w, 0), pt(w, h), pt(0, h)]
    for (const c of corners) {
      const q = localToPaper({ ...node, commands: [cmd('M', 0, 0), cmd('L', w, 0), cmd('L', w, h)] }, c)
      minX = Math.min(minX, q.x)
      minY = Math.min(minY, q.y)
      maxX = Math.max(maxX, q.x)
      maxY = Math.max(maxY, q.y)
    }
  }
  if (!Number.isFinite(minX)) return { x: node.x, y: node.y, w: 0, h: 0 }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

export function textFrame(node: SceneNode): { w: number; h: number } | null {
  if (node.kind !== 'text' || !node.text) return null
  const text = node.text
  const width = text.mode === 'field' ? Math.max(40, text.fieldWidth) : Math.max(28, text.content.length * text.fontSize * 0.56)
  const explicitLines = Math.max(1, text.content.split('\n').length)
  const wrapped = text.mode === 'field' ? Math.max(explicitLines, Math.ceil(text.content.length / Math.max(8, width / (text.fontSize * 0.5)))) : explicitLines
  const height = Math.max(text.fontSize * 1.6, text.fontSize * text.lineSpacing * wrapped + 6)
  return { w: width, h: height }
}

export function hitNode(node: SceneNode, paper: Pt, tolerance: number): boolean {
  if (!node.visible) return false
  if (node.dimension) {
    const d = node.dimension
    const len = Math.hypot(d.x2 - d.x1, d.y2 - d.y1) || 1
    const ox = (-(d.y2 - d.y1) / len) * d.offset
    const oy = ((d.x2 - d.x1) / len) * d.offset
    const a = pt(d.x1 + node.x, d.y1 + node.y)
    const b = pt(d.x2 + node.x, d.y2 + node.y)
    const a2 = pt(a.x + ox, a.y + oy)
    const b2 = pt(b.x + ox, b.y + oy)
    return distToSegment(paper, a2, b2) <= tolerance + 2 || distToSegment(paper, a, a2) <= tolerance || distToSegment(paper, b, b2) <= tolerance
  }
  const local = paperToLocal(node, paper)
  const frame = textFrame(node)
  if (frame) {
    return local.x >= -tolerance && local.y >= -tolerance && local.x <= frame.w + tolerance && local.y <= frame.h + tolerance
  }
  if (node.kind === 'image' || node.symbolId) {
    const b = commandsBounds(node.commands)
    if (local.x >= b.x - tolerance && local.y >= b.y - tolerance && local.x <= b.x + b.w + tolerance && local.y <= b.y + b.h + tolerance) return true
  }
  const poly = sampleCommands(node.commands)
  const filled = node.appearance.some((a) => a.kind === 'fill' && a.enabled && a.color.a > 0 && !isNoneColor(a))
  if (filled && poly.length >= 3 && pointInPolygon(local, poly)) return true
  for (let i = 1; i < poly.length; i++) {
    if (distToSegment(local, poly[i - 1], poly[i]) <= tolerance) return true
  }
  return false
}

function isNoneColor(attr: { color: { a: number } }): boolean {
  return attr.color.a <= 0
}

export function unionBounds(rects: Rect[]): Rect {
  if (!rects.length) return { x: 0, y: 0, w: 0, h: 0 }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const r of rects) {
    minX = Math.min(minX, r.x)
    minY = Math.min(minY, r.y)
    maxX = Math.max(maxX, r.x + r.w)
    maxY = Math.max(maxY, r.y + r.h)
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

export function translateCommands(commands: Cmd[], dx: number, dy: number): Cmd[] {
  return commands.map((c) => ({
    ...c,
    x: c.c === 'Z' ? c.x : c.x + dx,
    y: c.c === 'Z' ? c.y : c.y + dy,
    x1: c.c === 'C' ? c.x1 + dx : c.x1,
    y1: c.c === 'C' ? c.y1 + dy : c.y1,
    x2: c.c === 'C' ? c.x2 + dx : c.x2,
    y2: c.c === 'C' ? c.y2 + dy : c.y2,
  }))
}

export function scaleCommands(commands: Cmd[], sx: number, sy: number): Cmd[] {
  const s = (v: number, k: number) => v * k
  return commands.map((c) => ({
    ...c,
    x: s(c.x, sx),
    y: s(c.y, sy),
    x1: s(c.x1, sx),
    y1: s(c.y1, sy),
    x2: s(c.x2, sx),
    y2: s(c.y2, sy),
  }))
}

/** Pass a smooth cubic through every sample so a stroke follows the pointer. */
export function smoothCommands(points: Pt[]): Cmd[] {
  if (!points.length) return []
  if (points.length === 1) return [cmd('M', points[0].x, points[0].y)]
  if (points.length === 2) return [cmd('M', points[0].x, points[0].y), cmd('L', points[1].x, points[1].y)]
  const commands: Cmd[] = [cmd('M', points[0].x, points[0].y)]
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[Math.min(points.length - 1, i + 2)]
    commands.push(
      cmd(
        'C',
        p2.x,
        p2.y,
        p1.x + (p2.x - p0.x) / 6,
        p1.y + (p2.y - p0.y) / 6,
        p2.x - (p3.x - p1.x) / 6,
        p2.y - (p3.y - p1.y) / 6,
      ),
    )
  }
  return commands
}

export function reverseCommands(commands: Cmd[]): Cmd[] {
  const pts = sampleCommands(commands, 1)
  if (pts.length < 2) return commands
  const out: Cmd[] = [cmd('M', pts[pts.length - 1].x, pts[pts.length - 1].y)]
  for (let i = pts.length - 2; i >= 0; i--) out.push(cmd('L', pts[i].x, pts[i].y))
  if (commands.some((c) => c.c === 'Z')) out.push(cmd('Z'))
  return out
}
