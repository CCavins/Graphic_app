import { commandsBounds } from './geometry'
import type { Cmd, Rect } from './types'

function contains(outer: Rect, inner: Rect): boolean {
  return (
    inner.w * inner.h > 0 &&
    outer.w * outer.h > inner.w * inner.h * 1.2 &&
    inner.x >= outer.x - 0.5 &&
    inner.y >= outer.y - 0.5 &&
    inner.x + inner.w <= outer.x + outer.w + 0.5 &&
    inner.y + inner.h <= outer.y + outer.h + 0.5
  )
}

/** Split a shaded path into the outer body and the regions that sit inside it. */
export function splitShade(commands: Cmd[]): { body: Cmd[]; inset: Cmd[] } {
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
  const boxes = parts.map((part) => commandsBounds(part))
  const body: Cmd[] = []
  const inset: Cmd[] = []
  parts.forEach((part, index) => {
    const nested = boxes.some((other, otherIndex) => otherIndex !== index && contains(other, boxes[index]))
    ;(nested ? inset : body).push(...part)
  })
  return { body, inset }
}
