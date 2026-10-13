/**
 * Small SVG geometry helpers shared by the symbol importer and the in-app SVG import.
 * No DOM dependency, so it runs in node, vitest, and the browser.
 */
import type { Cmd } from './types'
import { cmd } from './geometry'

export interface XmlTag {
  name: string
  attrs: Record<string, string>
  close: boolean
  selfClose: boolean
}

export function* xmlTags(xml: string): Generator<XmlTag> {
  const re = /<(\/?)([a-zA-Z_:][\w:.-]*)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/g
  let match: RegExpExecArray | null
  while ((match = re.exec(xml))) {
    const attrs: Record<string, string> = {}
    const attrRe = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g
    let a: RegExpExecArray | null
    while ((a = attrRe.exec(match[3]))) attrs[a[1]] = a[2] ?? a[3] ?? ''
    yield { name: match[2], attrs, close: match[1] === '/', selfClose: match[4] === '/' }
  }
}

function round(value: number): number {
  const rounded = Math.round(value * 100) / 100
  return Object.is(rounded, -0) ? 0 : rounded
}

/** Collects path commands while tracking the current point and bounds. */
export class PathBuilder {
  commands: Cmd[] = []
  cx = 0
  cy = 0
  sx = 0
  sy = 0
  minX = Infinity
  minY = Infinity
  maxX = -Infinity
  maxY = -Infinity

  private see(x: number, y: number): void {
    this.minX = Math.min(this.minX, x)
    this.minY = Math.min(this.minY, y)
    this.maxX = Math.max(this.maxX, x)
    this.maxY = Math.max(this.maxY, y)
  }

  move(x: number, y: number): void {
    this.commands.push(cmd('M', round(x), round(y)))
    this.cx = this.sx = x
    this.cy = this.sy = y
    this.see(x, y)
  }

  line(x: number, y: number): void {
    this.commands.push(cmd('L', round(x), round(y)))
    this.cx = x
    this.cy = y
    this.see(x, y)
  }

  cubic(x1: number, y1: number, x2: number, y2: number, x: number, y: number): void {
    this.commands.push(cmd('C', round(x), round(y), round(x1), round(y1), round(x2), round(y2)))
    this.cx = x
    this.cy = y
    this.see(x1, y1)
    this.see(x2, y2)
    this.see(x, y)
  }

  quad(x1: number, y1: number, x: number, y: number): void {
    this.cubic(
      this.cx + (2 / 3) * (x1 - this.cx),
      this.cy + (2 / 3) * (y1 - this.cy),
      x + (2 / 3) * (x1 - x),
      y + (2 / 3) * (y1 - y),
      x,
      y,
    )
  }

  arc(rx: number, ry: number, rotation: number, large: boolean, sweep: boolean, x: number, y: number): void {
    for (const seg of arcToCubics(this.cx, this.cy, rx, ry, rotation, large, sweep, x, y)) {
      this.cubic(seg[0], seg[1], seg[2], seg[3], seg[4], seg[5])
    }
    this.cx = x
    this.cy = y
  }

  close(): void {
    this.commands.push(cmd('Z'))
    this.cx = this.sx
    this.cy = this.sy
  }

  rect(x: number, y: number, w: number, h: number, r = 0): void {
    const rr = Math.max(0, Math.min(r, w / 2, h / 2))
    if (rr <= 0) {
      this.move(x, y)
      this.line(x + w, y)
      this.line(x + w, y + h)
      this.line(x, y + h)
      this.close()
      return
    }
    const k = rr * 0.5522847498
    this.move(x + rr, y)
    this.line(x + w - rr, y)
    this.cubic(x + w - rr + k, y, x + w, y + rr - k, x + w, y + rr)
    this.line(x + w, y + h - rr)
    this.cubic(x + w, y + h - rr + k, x + w - k, y + h, x + w - rr, y + h)
    this.line(x + rr, y + h)
    this.cubic(x + rr - k, y + h, x, y + h - rr + k, x, y + h - rr)
    this.line(x, y + rr)
    this.cubic(x, y + rr - k, x + k, y, x + rr, y)
    this.close()
  }

  ellipse(x: number, y: number, w: number, h: number): void {
    const rx = w / 2
    const ry = h / 2
    const cx = x + rx
    const cy = y + ry
    const kx = rx * 0.5522847498
    const ky = ry * 0.5522847498
    this.move(cx, cy - ry)
    this.cubic(cx + kx, cy - ry, cx + rx, cy - ky, cx + rx, cy)
    this.cubic(cx + rx, cy + ky, cx + kx, cy + ry, cx, cy + ry)
    this.cubic(cx - kx, cy + ry, cx - rx, cy + ky, cx - rx, cy)
    this.cubic(cx - rx, cy - ky, cx - kx, cy - ry, cx, cy - ry)
    this.close()
  }

  append(other: PathBuilder): void {
    for (const command of other.commands) {
      this.commands.push({ ...command })
      if (command.c !== 'Z') {
        this.see(command.x, command.y)
        if (command.c === 'C') {
          this.see(command.x1, command.y1)
          this.see(command.x2, command.y2)
        }
      }
    }
  }

  /** Compact string form used by symbols.json. */
  toString(): string {
    return this.commands
      .map((c) => {
        if (c.c === 'M') return `M${c.x} ${c.y}`
        if (c.c === 'L') return `L${c.x} ${c.y}`
        if (c.c === 'C') return `C${c.x1} ${c.y1} ${c.x2} ${c.y2} ${c.x} ${c.y}`
        return 'Z'
      })
      .join(' ')
  }
}

/** Convert an SVG elliptical arc to cubic segments: [x1, y1, x2, y2, x, y][] */
export function arcToCubics(
  x1: number,
  y1: number,
  rx: number,
  ry: number,
  rotation: number,
  large: boolean,
  sweep: boolean,
  x2: number,
  y2: number,
): number[][] {
  if (rx === 0 || ry === 0) return [[x1, y1, x2, y2, x2, y2]]
  const phi = (rotation * Math.PI) / 180
  const cosPhi = Math.cos(phi)
  const sinPhi = Math.sin(phi)
  const dx = (x1 - x2) / 2
  const dy = (y1 - y2) / 2
  const x1p = cosPhi * dx + sinPhi * dy
  const y1p = -sinPhi * dx + cosPhi * dy
  let RX = Math.abs(rx)
  let RY = Math.abs(ry)
  let rxs = RX * RX
  let rys = RY * RY
  const lambda = (x1p * x1p) / rxs + (y1p * y1p) / rys
  if (lambda > 1) {
    RX *= Math.sqrt(lambda)
    RY *= Math.sqrt(lambda)
    rxs = RX * RX
    rys = RY * RY
  }
  const sign = large === sweep ? -1 : 1
  const num = Math.max(0, rxs * rys - rxs * y1p * y1p - rys * x1p * x1p)
  const den = rxs * y1p * y1p + rys * x1p * x1p
  const coef = den === 0 ? 0 : sign * Math.sqrt(num / den)
  const cxp = (coef * (RX * y1p)) / RY
  const cyp = (coef * -(RY * x1p)) / RX
  const cx = cosPhi * cxp - sinPhi * cyp + (x1 + x2) / 2
  const cy = sinPhi * cxp + cosPhi * cyp + (y1 + y2) / 2
  const angle = (ux: number, uy: number, vx: number, vy: number) => {
    const dot = ux * vx + uy * vy
    const len = Math.hypot(ux, uy) * Math.hypot(vx, vy)
    let a = Math.acos(Math.max(-1, Math.min(1, dot / (len || 1))))
    if (ux * vy - uy * vx < 0) a = -a
    return a
  }
  const theta1 = angle(1, 0, (x1p - cxp) / RX, (y1p - cyp) / RY)
  let delta = angle((x1p - cxp) / RX, (y1p - cyp) / RY, (-x1p - cxp) / RX, (-y1p - cyp) / RY)
  if (!sweep && delta > 0) delta -= 2 * Math.PI
  if (sweep && delta < 0) delta += 2 * Math.PI
  const segments = Math.max(1, Math.ceil(Math.abs(delta) / (Math.PI / 2)))
  const step = delta / segments
  const out: number[][] = []
  let t = theta1
  const point = (a: number) => {
    const ex = RX * Math.cos(a)
    const ey = RY * Math.sin(a)
    return [cosPhi * ex - sinPhi * ey + cx, sinPhi * ex + cosPhi * ey + cy]
  }
  const deriv = (a: number) => {
    const ex = -RX * Math.sin(a)
    const ey = RY * Math.cos(a)
    return [cosPhi * ex - sinPhi * ey, sinPhi * ex + cosPhi * ey]
  }
  for (let i = 0; i < segments; i++) {
    const t2 = t + step
    const alpha = (4 / 3) * Math.tan((t2 - t) / 4)
    const p1 = point(t)
    const p2 = point(t2)
    const d1 = deriv(t)
    const d2 = deriv(t2)
    out.push([p1[0] + alpha * d1[0], p1[1] + alpha * d1[1], p2[0] - alpha * d2[0], p2[1] - alpha * d2[1], p2[0], p2[1]])
    t = t2
  }
  if (out.length) {
    out[out.length - 1][4] = x2
    out[out.length - 1][5] = y2
  }
  return out
}

export type Matrix = [number, number, number, number, number, number]
export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0]

export function multiply(a: Matrix, b: Matrix): Matrix {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ]
}

export function parseTransform(text: string | undefined): Matrix {
  let m: Matrix = IDENTITY
  if (!text) return m
  const re = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g
  let match: RegExpExecArray | null
  while ((match = re.exec(text))) {
    const v = match[2].split(/[\s,]+/).filter(Boolean).map(Number)
    let t: Matrix = IDENTITY
    if (match[1] === 'matrix' && v.length === 6) t = [v[0], v[1], v[2], v[3], v[4], v[5]]
    if (match[1] === 'translate') t = [1, 0, 0, 1, v[0] || 0, v[1] || 0]
    if (match[1] === 'scale') t = [v[0] ?? 1, 0, 0, v[1] ?? v[0] ?? 1, 0, 0]
    if (match[1] === 'rotate') {
      const r = ((v[0] || 0) * Math.PI) / 180
      const cos = Math.cos(r)
      const sin = Math.sin(r)
      t = [cos, sin, -sin, cos, 0, 0]
      if (v.length >= 3) t = multiply(multiply([1, 0, 0, 1, v[1], v[2]], t), [1, 0, 0, 1, -v[1], -v[2]])
    }
    if (match[1] === 'skewX') t = [1, 0, Math.tan(((v[0] || 0) * Math.PI) / 180), 1, 0, 0]
    if (match[1] === 'skewY') t = [1, Math.tan(((v[0] || 0) * Math.PI) / 180), 0, 1, 0, 0]
    m = multiply(m, t)
  }
  return m
}

export function applyMatrix(m: Matrix, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]
}

/** Append an SVG path `d` string to a builder, transformed by `m`. */
export function appendSvgPath(d: string, m: Matrix, p: PathBuilder): void {
  const tokens = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) ?? []
  let i = 0
  let command = ''
  let cx = 0
  let cy = 0
  let sx = 0
  let sy = 0
  let lastC: [number, number] | null = null
  let lastQ: [number, number] | null = null
  const read = () => Number(tokens[i++])
  const emitMove = (x: number, y: number) => {
    const [tx, ty] = applyMatrix(m, x, y)
    p.move(tx, ty)
  }
  const emitLine = (x: number, y: number) => {
    const [tx, ty] = applyMatrix(m, x, y)
    p.line(tx, ty)
  }
  const emitCubic = (x1: number, y1: number, x2: number, y2: number, x: number, y: number) => {
    const a = applyMatrix(m, x1, y1)
    const b = applyMatrix(m, x2, y2)
    const c = applyMatrix(m, x, y)
    p.cubic(a[0], a[1], b[0], b[1], c[0], c[1])
  }
  let guard = 0
  while (i < tokens.length && guard++ < 200000) {
    const token = tokens[i]
    if (/[a-zA-Z]/.test(token)) {
      command = token
      i++
      if (command === 'Z' || command === 'z') {
        p.close()
        cx = sx
        cy = sy
        continue
      }
    }
    if (!command) {
      i++
      continue
    }
    const rel = command === command.toLowerCase()
    const up = command.toUpperCase()
    if (up === 'M') {
      const x = read() + (rel ? cx : 0)
      const y = read() + (rel ? cy : 0)
      emitMove(x, y)
      cx = sx = x
      cy = sy = y
      command = rel ? 'l' : 'L'
      lastC = lastQ = null
    } else if (up === 'L') {
      const x = read() + (rel ? cx : 0)
      const y = read() + (rel ? cy : 0)
      emitLine(x, y)
      cx = x
      cy = y
      lastC = lastQ = null
    } else if (up === 'H') {
      const x = read() + (rel ? cx : 0)
      emitLine(x, cy)
      cx = x
      lastC = lastQ = null
    } else if (up === 'V') {
      const y = read() + (rel ? cy : 0)
      emitLine(cx, y)
      cy = y
      lastC = lastQ = null
    } else if (up === 'C') {
      const x1 = read() + (rel ? cx : 0)
      const y1 = read() + (rel ? cy : 0)
      const x2 = read() + (rel ? cx : 0)
      const y2 = read() + (rel ? cy : 0)
      const x = read() + (rel ? cx : 0)
      const y = read() + (rel ? cy : 0)
      emitCubic(x1, y1, x2, y2, x, y)
      lastC = [x2, y2]
      lastQ = null
      cx = x
      cy = y
    } else if (up === 'S') {
      const x2 = read() + (rel ? cx : 0)
      const y2 = read() + (rel ? cy : 0)
      const x = read() + (rel ? cx : 0)
      const y = read() + (rel ? cy : 0)
      const x1 = lastC ? 2 * cx - lastC[0] : cx
      const y1 = lastC ? 2 * cy - lastC[1] : cy
      emitCubic(x1, y1, x2, y2, x, y)
      lastC = [x2, y2]
      lastQ = null
      cx = x
      cy = y
    } else if (up === 'Q') {
      const x1 = read() + (rel ? cx : 0)
      const y1 = read() + (rel ? cy : 0)
      const x = read() + (rel ? cx : 0)
      const y = read() + (rel ? cy : 0)
      emitCubic(cx + (2 / 3) * (x1 - cx), cy + (2 / 3) * (y1 - cy), x + (2 / 3) * (x1 - x), y + (2 / 3) * (y1 - y), x, y)
      lastQ = [x1, y1]
      lastC = null
      cx = x
      cy = y
    } else if (up === 'T') {
      const x = read() + (rel ? cx : 0)
      const y = read() + (rel ? cy : 0)
      const x1: number = lastQ ? 2 * cx - lastQ[0] : cx
      const y1: number = lastQ ? 2 * cy - lastQ[1] : cy
      emitCubic(cx + (2 / 3) * (x1 - cx), cy + (2 / 3) * (y1 - cy), x + (2 / 3) * (x1 - x), y + (2 / 3) * (y1 - y), x, y)
      lastQ = [x1, y1]
      lastC = null
      cx = x
      cy = y
    } else if (up === 'A') {
      const rx = read()
      const ry = read()
      const rot = read()
      const large = read() !== 0
      const sweep = read() !== 0
      const x = read() + (rel ? cx : 0)
      const y = read() + (rel ? cy : 0)
      for (const seg of arcToCubics(cx, cy, rx, ry, rot, large, sweep, x, y)) {
        emitCubic(seg[0], seg[1], seg[2], seg[3], seg[4], seg[5])
      }
      cx = x
      cy = y
      lastC = lastQ = null
    } else {
      i++
    }
  }
}

export interface SvgImport {
  commands: Cmd[]
  width: number
  height: number
  /** Closed regions that should be lightly shaded. */
  shade: Cmd[]
  /** Closed regions painted solid, such as a door jamb. */
  ink: Cmd[]
}

/**
 * Flatten an SVG document into one path in user units with its top-left at 0,0.
 * Handles path, rect, circle, ellipse, line, polyline, polygon, and nested transforms.
 */
function svgFillTone(tag: XmlTag): 'none' | 'ink' | 'shade' {
  const style = tag.attrs.style ?? ''
  const value = (tag.attrs.fill ?? style.match(/fill:\s*([^;]+)/)?.[1] ?? '').trim().toLowerCase()
  if (!value || value === 'none' || value === 'transparent') return 'none'
  if (value === '#000' || value === '#000000' || value === 'black') return 'ink'
  return 'shade'
}

export function svgToCommands(svg: string): SvgImport {
  const stack: Matrix[] = [IDENTITY]
  const hidden: boolean[] = [false]
  const p = new PathBuilder()
  const shade = new PathBuilder()
  const ink = new PathBuilder()
  const plain: PathBuilder[] = []
  let skip = 0
  for (const tag of xmlTags(svg)) {
    if (tag.name === 'defs' || tag.name === 'style' || tag.name === 'metadata' || tag.name === 'clipPath' || tag.name === 'mask') {
      if (tag.close) skip = Math.max(0, skip - 1)
      else if (!tag.selfClose) skip++
      continue
    }
    if (skip > 0) continue
    if (tag.close) {
      if (tag.name === 'g' || tag.name === 'svg' || tag.name === 'a' || tag.name === 'symbol') {
        if (stack.length > 1) {
          stack.pop()
          hidden.pop()
        }
      }
      continue
    }
    const m = multiply(stack[stack.length - 1], parseTransform(tag.attrs.transform))
    const isHidden = hidden[hidden.length - 1] || /display\s*:\s*none/.test(tag.attrs.style ?? '') || tag.attrs.display === 'none'
    if (tag.name === 'g' || tag.name === 'svg' || tag.name === 'a' || tag.name === 'symbol') {
      if (!tag.selfClose) {
        stack.push(m)
        hidden.push(isHidden)
      }
      continue
    }
    if (isHidden) continue
    const num = (key: string) => Number(tag.attrs[key]) || 0
    const local = new PathBuilder()
    if (tag.name === 'path' && tag.attrs.d) appendSvgPath(tag.attrs.d, m, local)
    else if (tag.name === 'rect') local.rect(num('x'), num('y'), num('width'), num('height'), Math.max(num('rx'), num('ry')))
    else if (tag.name === 'circle') local.ellipse(num('cx') - num('r'), num('cy') - num('r'), num('r') * 2, num('r') * 2)
    else if (tag.name === 'ellipse') local.ellipse(num('cx') - num('rx'), num('cy') - num('ry'), num('rx') * 2, num('ry') * 2)
    else if (tag.name === 'line') appendSvgPath(`M${num('x1')} ${num('y1')} L${num('x2')} ${num('y2')}`, m, local)
    else if (tag.name === 'polyline' || tag.name === 'polygon') {
      const pts = (tag.attrs.points ?? '').split(/[\s,]+/).filter(Boolean).map(Number)
      if (pts.length >= 4) {
        let d = `M${pts[0]} ${pts[1]}`
        for (let k = 2; k + 1 < pts.length; k += 2) d += ` L${pts[k]} ${pts[k + 1]}`
        if (tag.name === 'polygon') d += ' Z'
        appendSvgPath(d, m, local)
      }
    } else continue
    if (!local.commands.length) continue
    // rect/circle/ellipse were built in local units; path and line already applied the transform.
    const piece = tag.name === 'path' || tag.name === 'line' || tag.name === 'polyline' || tag.name === 'polygon' ? local : new PathBuilder()
    if (piece !== local) appendSvgPath(local.toString(), m, piece)
    p.append(piece)
    const tone = svgFillTone(tag)
    if (tone === 'ink') ink.append(piece)
    else if (tone === 'shade') shade.append(piece)
    else if (piece.commands.some((command) => command.c === 'Z')) plain.push(piece)
  }
  if (!p.commands.length || !Number.isFinite(p.minX)) return { commands: [], width: 0, height: 0, shade: [], ink: [] }
  const area = Math.max(1, (p.maxX - p.minX) * (p.maxY - p.minY))
  for (const piece of plain) {
    const boxArea = Math.max(0, piece.maxX - piece.minX) * Math.max(0, piece.maxY - piece.minY)
    // A closed outline with real area, like the two bars of a plan-view TV, reads as a shaded panel.
    if (boxArea >= area * 0.12) shade.append(piece)
  }
  const shift = (commands: Cmd[]) =>
    commands.map((c) =>
      c.c === 'Z'
        ? c
        : {
            ...c,
            x: c.x - p.minX,
            y: c.y - p.minY,
            x1: c.c === 'C' ? c.x1 - p.minX : 0,
            y1: c.c === 'C' ? c.y1 - p.minY : 0,
            x2: c.c === 'C' ? c.x2 - p.minX : 0,
            y2: c.c === 'C' ? c.y2 - p.minY : 0,
          },
    )
  return {
    commands: shift(p.commands),
    width: p.maxX - p.minX,
    height: p.maxY - p.minY,
    shade: shift(shade.commands),
    ink: shift(ink.commands),
  }
}
