import polygonClipping from 'polygon-clipping'
import type { Cmd, Pt, SceneNode } from './types'
import { cmd, commandsBounds, sampleCommands } from './geometry'
import { uid } from './types'

type Ring = [number, number][]
type Polygon = Ring[]
type MultiPolygon = Polygon[]

function toMulti(commands: Cmd[]): MultiPolygon {
  const poly = sampleCommands(commands, 6)
  if (poly.length < 3) return []
  const ring: Ring = poly.map((p) => [p.x, p.y])
  const first = ring[0]
  const last = ring[ring.length - 1]
  if (first[0] !== last[0] || first[1] !== last[1]) ring.push([first[0], first[1]])
  return [[ring]]
}

function fromMulti(multi: MultiPolygon): Cmd[] {
  const cmds: Cmd[] = []
  for (const polygon of multi) {
    for (const ring of polygon) {
      if (ring.length < 2) continue
      ring.forEach((pair, index) => {
        cmds.push(cmd(index === 0 ? 'M' : 'L', pair[0], pair[1]))
      })
      cmds.push(cmd('Z'))
    }
  }
  return cmds
}

export type BooleanOp = 'union' | 'subtract' | 'intersect' | 'exclude' | 'divide'

export function booleanCommands(op: BooleanOp, a: Cmd[], b: Cmd[]): Cmd[][] {
  const A = toMulti(a)
  const B = toMulti(b)
  if (!A.length || !B.length) throw new Error('Boolean operations need closed paths')
  if (op === 'union') return [fromMulti(polygonClipping.union(A, B))]
  if (op === 'intersect') return [fromMulti(polygonClipping.intersection(A, B))]
  if (op === 'subtract') return [fromMulti(polygonClipping.difference(A, B))]
  if (op === 'exclude') return [fromMulti(polygonClipping.xor(A, B))]
  return [
    fromMulti(polygonClipping.intersection(A, B)),
    fromMulti(polygonClipping.difference(A, B)),
    fromMulti(polygonClipping.difference(B, A)),
  ].filter((commands) => commandsBounds(commands).w > 0.5 && commandsBounds(commands).h > 0.5)
}

export function outlineStroke(node: SceneNode): Cmd[] {
  const stroke = node.appearance.find((a) => a.kind === 'stroke')
  const width = stroke && stroke.kind === 'stroke' ? stroke.width : 1
  const poly = sampleCommands(node.commands, 4)
  if (poly.length < 2) return node.commands
  const half = width / 2
  const left: Pt[] = []
  const right: Pt[] = []
  for (let i = 0; i < poly.length; i++) {
    const prev = poly[Math.max(0, i - 1)]
    const next = poly[Math.min(poly.length - 1, i + 1)]
    const dx = next.x - prev.x
    const dy = next.y - prev.y
    const len = Math.hypot(dx, dy) || 1
    const nx = -dy / len
    const ny = dx / len
    left.push({ x: poly[i].x + nx * half, y: poly[i].y + ny * half })
    right.push({ x: poly[i].x - nx * half, y: poly[i].y - ny * half })
  }
  const cmds: Cmd[] = []
  left.forEach((p, i) => cmds.push(cmd(i === 0 ? 'M' : 'L', p.x, p.y)))
  for (let i = right.length - 1; i >= 0; i--) cmds.push(cmd('L', right[i].x, right[i].y))
  cmds.push(cmd('Z'))
  return cmds
}

export function newPathFromCommands(source: SceneNode, commands: Cmd[], name: string): SceneNode {
  return {
    ...structuredClone(source),
    id: uid('n'),
    name,
    commands,
    children: [],
    kind: 'path',
  }
}
