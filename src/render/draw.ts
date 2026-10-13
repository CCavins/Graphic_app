import { cssColor } from '../model/color'
import { RULER_SIZE, type Editor } from '../editor/editor'
import { commandsBounds, pivotOf, sampleCommands } from '../model/geometry'
import { labelAnchor, labelText, placedLabels } from '../model/labels'
import { anchors } from '../model/transform'
import type { BlendMode, EffectAttr, FillAttr, PatternDef, SceneNode, StrokeAttr } from '../model/types'
import { fromInches } from '../model/units'

const COMPOSITE: Record<BlendMode, GlobalCompositeOperation> = {
  normal: 'source-over',
  multiply: 'multiply',
  screen: 'screen',
  overlay: 'overlay',
  darken: 'darken',
  lighten: 'lighten',
  'color-dodge': 'color-dodge',
  'color-burn': 'color-burn',
  'hard-light': 'hard-light',
  'soft-light': 'soft-light',
  difference: 'difference',
  exclusion: 'exclusion',
  hue: 'hue',
  saturation: 'saturation',
  color: 'color',
  luminosity: 'luminosity',
  'linear-burn': 'color-burn',
  'linear-dodge': 'screen',
  'vivid-light': 'hard-light',
  'linear-light': 'overlay',
  'pin-light': 'hard-light',
  'darker-color': 'darken',
  'lighter-color': 'lighten',
}

export interface Renderer {
  render(ctx: CanvasRenderingContext2D, width: number, height: number, dpr: number, editor: Editor): void
}

const imageCache = new Map<string, HTMLImageElement>()
const patternCache = new Map<string, CanvasPattern | string>()

function imageFor(id: string, href: string, onLoad: () => void): HTMLImageElement | null {
  const cached = imageCache.get(id)
  if (cached) return cached.complete && cached.naturalWidth > 0 ? cached : null
  if (typeof Image === 'undefined') return null
  const img = new Image()
  img.onload = onLoad
  img.src = href
  imageCache.set(id, img)
  return null
}

function trace(ctx: CanvasRenderingContext2D, node: Pick<SceneNode, 'commands'>): void {
  ctx.beginPath()
  for (const command of node.commands) {
    if (command.c === 'M') ctx.moveTo(command.x, command.y)
    else if (command.c === 'L') ctx.lineTo(command.x, command.y)
    else if (command.c === 'C') ctx.bezierCurveTo(command.x1, command.y1, command.x2, command.y2, command.x, command.y)
    else ctx.closePath()
  }
}

function fillStyleFor(ctx: CanvasRenderingContext2D, attr: FillAttr, node: SceneNode, editor: Editor): string | CanvasGradient | CanvasPattern {
  if (attr.gradient) {
    const g = attr.gradient
    let gradient: CanvasGradient
    if (g.kind === 'radial') {
      const radius = Math.hypot(g.x2 - g.x1, g.y2 - g.y1) || 1
      gradient = ctx.createRadialGradient(g.x1, g.y1, 0, g.x1, g.y1, radius)
    } else if (g.kind === 'angle' && typeof ctx.createConicGradient === 'function') {
      gradient = ctx.createConicGradient(Math.atan2(g.y2 - g.y1, g.x2 - g.x1), g.x1, g.y1)
    } else gradient = ctx.createLinearGradient(g.x1, g.y1, g.x2, g.y2)
    for (const stop of g.stops) gradient.addColorStop(Math.max(0, Math.min(1, stop.offset)), cssColor(stop.color))
    return gradient
  }
  if (attr.imageId) {
    const href = editor.doc.images[attr.imageId]
    const img = href ? imageFor(attr.imageId, href, () => editor.emit()) : null
    if (img) return ctx.createPattern(img, 'repeat') ?? cssColor(attr.color)
    return cssColor(attr.color)
  }
  if (attr.patternId) {
    const def = editor.doc.patterns.find((pattern) => pattern.id === attr.patternId)
    return patternStyle(ctx, attr.patternId, def)
  }
  void node
  return cssColor(attr.color)
}

function drawNode(ctx: CanvasRenderingContext2D, node: SceneNode, editor: Editor, ox = 0, oy = 0): void {
  if (!node.visible) return
  if (node.paintError) throw new Error(`Paint failed for ${node.name}`)
  const x = ox + node.x
  const y = oy + node.y
  if (node.kind === 'group') {
    ctx.save()
    ctx.translate(x, y)
    ctx.globalAlpha *= node.opacity
    if (node.clip) {
      trace(ctx, node)
      ctx.clip()
    }
    for (const child of node.children) drawNode(ctx, child, editor)
    ctx.restore()
    return
  }
  if (node.kind === 'dimension' && node.dimension) {
    ctx.save()
    ctx.translate(x, y)
    drawDimension(ctx, node, editor)
    ctx.restore()
    return
  }
  ctx.save()
  applyNodeTransform(ctx, { ...node, x, y })
  ctx.globalAlpha *= node.opacity
  ctx.globalCompositeOperation = COMPOSITE[node.blendMode] ?? 'source-over'
  if (editor.doc.canvas.viewMode === 'outline') {
    ctx.strokeStyle = editor.doc.canvas.selectionColor
    ctx.lineWidth = 1 / editor.view.zoom
    trace(ctx, node)
    ctx.stroke()
    if (node.kind === 'text' && node.text) drawText(ctx, node)
    drawLabels(ctx, node, editor)
    ctx.restore()
    return
  }
  const effects = node.appearance.filter((item): item is EffectAttr => item.enabled && item.kind !== 'fill' && item.kind !== 'stroke')
  const blur = effects.find((effect) => effect.kind === 'blur')
  if (blur && 'filter' in ctx) {
    try {
      ctx.filter = `blur(${blur.blur}px)`
    } catch {
      /* older canvas without filter support */
    }
  }
  for (const effect of effects) {
    if (effect.kind === 'dropShadow' || effect.kind === 'outerGlow') {
      ctx.save()
      ctx.shadowColor = cssColor({ ...effect.color, a: effect.color.a * effect.opacity })
      ctx.shadowBlur = effect.blur
      ctx.shadowOffsetX = effect.kind === 'outerGlow' ? 0 : effect.dx
      ctx.shadowOffsetY = effect.kind === 'outerGlow' ? 0 : effect.dy
      ctx.fillStyle = 'rgba(0,0,0,1)'
      trace(ctx, node)
      if (node.kind === 'text' && node.text) {
        ctx.fillStyle = cssColor(node.text.color ?? { space: 'rgb', r: 28, g: 36, b: 48, a: 1 })
        drawText(ctx, node)
      } else ctx.fill()
      ctx.restore()
    }
  }
  for (const attr of node.appearance) {
    if (!attr.enabled) continue
    if (attr.kind === 'fill') {
      if (attr.color.a <= 0 && !attr.gradient && !attr.patternId && !attr.imageId) continue
      ctx.save()
      ctx.globalAlpha *= attr.opacity
      ctx.fillStyle = fillStyleFor(ctx, attr, node, editor)
      trace(ctx, node)
      ctx.fill()
      ctx.restore()
    }
    if (attr.kind === 'stroke') drawStroke(ctx, node, attr)
  }
  if (node.kind === 'image' && node.imageId) {
    const href = editor.doc.images[node.imageId]
    const img = href ? imageFor(node.imageId, href, () => editor.emit()) : null
    const bounds = commandsBounds(node.commands)
    ctx.save()
    trace(ctx, node)
    ctx.clip()
    if (img) ctx.drawImage(img, bounds.x, bounds.y, bounds.w, bounds.h)
    else {
      ctx.fillStyle = '#dde3ea'
      ctx.fillRect(bounds.x, bounds.y, bounds.w, bounds.h)
    }
    ctx.restore()
  }
  for (const effect of effects) {
    if (effect.kind === 'innerShadow' || effect.kind === 'innerGlow') drawInnerEffect(ctx, node, effect)
  }
  if (blur && 'filter' in ctx) ctx.filter = 'none'
  if (node.kind === 'text' && node.text) {
    ctx.fillStyle = cssColor(node.text.color ?? { space: 'rgb', r: 28, g: 36, b: 48, a: 1 })
    drawText(ctx, node)
  }
  drawLabels(ctx, node, editor)
  ctx.restore()
}

function drawStroke(ctx: CanvasRenderingContext2D, node: SceneNode, attr: StrokeAttr): void {
  if (attr.width <= 0) return
  ctx.save()
  ctx.globalAlpha *= attr.opacity
  ctx.strokeStyle = cssColor(attr.color)
  ctx.lineWidth = attr.width
  ctx.lineCap = attr.dash.length && attr.dash[0] <= 2 ? 'round' : 'butt'
  ctx.lineJoin = 'round'
  ctx.setLineDash(attr.dash)
  if (attr.align !== 'center' && node.commands.some((c) => c.c === 'Z')) {
    // Inner and outer alignment: clip to the shape (inner) or its inverse (outer) and stroke at double width.
    trace(ctx, node)
    if (attr.align === 'inner') ctx.clip()
    else {
      const bounds = commandsBounds(node.commands)
      const pad = attr.width * 2
      ctx.rect(bounds.x - pad, bounds.y - pad, bounds.w + pad * 2, bounds.h + pad * 2)
      ctx.clip('evenodd')
    }
    ctx.lineWidth = attr.width * 2
  }
  if (attr.brush && node.pressures?.length) {
    drawBrush(ctx, node, attr)
  } else {
    trace(ctx, node)
    ctx.stroke()
  }
  ctx.setLineDash([])
  if (attr.arrows !== 'none') drawArrows(ctx, node, attr)
  ctx.restore()
}

/** Calligraphic brush: a ribbon whose width follows pressure, angle, and roundness. */
function drawBrush(ctx: CanvasRenderingContext2D, node: SceneNode, attr: StrokeAttr): void {
  const brush = attr.brush!
  const pts = sampleCommands(node.commands, 4)
  const pressures = node.pressures ?? []
  if (pts.length < 2) return
  const angle = (brush.angle * Math.PI) / 180
  const left: { x: number; y: number }[] = []
  const right: { x: number; y: number }[] = []
  for (let i = 0; i < pts.length; i++) {
    const t = i / (pts.length - 1)
    const pressure = pressures[Math.min(pressures.length - 1, Math.floor(t * pressures.length))] ?? 0.5
    const prev = pts[Math.max(0, i - 1)]
    const next = pts[Math.min(pts.length - 1, i + 1)]
    const dir = Math.atan2(next.y - prev.y, next.x - prev.x)
    // Thin when the stroke runs along the nib angle, thick when across it.
    const across = Math.abs(Math.sin(dir - angle))
    const width = Math.max(brush.minWidth * brush.diameter, brush.diameter * (brush.roundness + (1 - brush.roundness) * across) * (0.35 + pressure * 0.65))
    const nx = -Math.sin(angle) * (width / 2)
    const ny = Math.cos(angle) * (width / 2)
    left.push({ x: pts[i].x + nx, y: pts[i].y + ny })
    right.push({ x: pts[i].x - nx, y: pts[i].y - ny })
  }
  ctx.beginPath()
  left.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)))
  for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i].x, right[i].y)
  ctx.closePath()
  ctx.fillStyle = cssColor(attr.color)
  ctx.fill()
}

function drawInnerEffect(ctx: CanvasRenderingContext2D, node: SceneNode, effect: EffectAttr): void {
  if (!node.commands.some((c) => c.c === 'Z')) return
  const bounds = commandsBounds(node.commands)
  const pad = effect.blur * 3 + Math.abs(effect.dx) + Math.abs(effect.dy) + 20
  ctx.save()
  trace(ctx, node)
  ctx.clip()
  // Paint the inverse of the shape with a shadow, so only the shadow that falls inside is visible.
  trace(ctx, node)
  ctx.rect(bounds.x - pad, bounds.y - pad, bounds.w + pad * 2, bounds.h + pad * 2)
  ctx.shadowColor = cssColor({ ...effect.color, a: effect.color.a * effect.opacity })
  ctx.shadowBlur = effect.blur
  ctx.shadowOffsetX = effect.kind === 'innerGlow' ? 0 : effect.dx
  ctx.shadowOffsetY = effect.kind === 'innerGlow' ? 0 : effect.dy
  ctx.fillStyle = 'rgba(0,0,0,1)'
  ctx.fill('evenodd')
  ctx.restore()
}

function patternStyle(ctx: CanvasRenderingContext2D, id: string, def?: PatternDef): CanvasPattern | string {
  const key = def?.commands ? `${id}:${def.commands.length}` : id
  const cached = patternCache.get(key)
  if (cached) return cached
  if (typeof document === 'undefined') return '#d7deea'
  const tile = document.createElement('canvas')
  const size = def?.commands && def.size ? Math.ceil(def.size) + 2 : 12
  tile.width = size
  tile.height = size
  const g = tile.getContext('2d')
  if (!g) return '#d7deea'
  g.fillStyle = '#f4f7fb'
  g.fillRect(0, 0, size, size)
  g.strokeStyle = '#8aa0bf'
  g.fillStyle = '#8aa0bf'
  if (def?.commands) {
    g.translate(1, 1)
    trace(g, { commands: def.commands })
    g.fill()
  } else if (id === 'dots') {
    g.beginPath()
    g.arc(3, 3, 1.5, 0, Math.PI * 2)
    g.fill()
  } else if (id === 'grid') {
    g.strokeRect(0.5, 0.5, 11, 11)
  } else if (id === 'crosshatch') {
    g.beginPath()
    g.moveTo(0, 12)
    g.lineTo(12, 0)
    g.moveTo(0, 0)
    g.lineTo(12, 12)
    g.stroke()
  } else {
    g.beginPath()
    g.moveTo(0, 12)
    g.lineTo(12, 0)
    g.stroke()
  }
  const pattern = ctx.createPattern(tile, 'repeat') ?? '#d7deea'
  patternCache.set(key, pattern)
  return pattern
}

function drawArrows(ctx: CanvasRenderingContext2D, node: SceneNode, attr: StrokeAttr): void {
  const pts = sampleCommands(node.commands, 1)
  if (pts.length < 2) return
  const size = Math.max(8, attr.width * 4)
  const head = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    const angle = Math.atan2(b.y - a.y, b.x - a.x)
    ctx.beginPath()
    ctx.moveTo(b.x, b.y)
    ctx.lineTo(b.x - size * Math.cos(angle - 0.4), b.y - size * Math.sin(angle - 0.4))
    ctx.lineTo(b.x - size * Math.cos(angle + 0.4), b.y - size * Math.sin(angle + 0.4))
    ctx.closePath()
    ctx.fillStyle = cssColor(attr.color)
    ctx.fill()
  }
  if (attr.arrows === 'end' || attr.arrows === 'both') head(pts[pts.length - 2], pts[pts.length - 1])
  if (attr.arrows === 'start' || attr.arrows === 'both') head(pts[1], pts[0])
}

function fontFor(node: SceneNode, bold?: boolean, italic?: boolean): string {
  const text = node.text!
  const style = text.fontStyle
  const weight = bold || style.includes('bold') ? 'bold' : 'normal'
  const slant = italic || style.includes('italic') ? 'italic' : 'normal'
  return `${slant} ${weight} ${text.fontSize}px ${text.fontFamily}`
}

function drawText(ctx: CanvasRenderingContext2D, node: SceneNode): void {
  const text = node.text
  if (!text) return
  const baseFill = ctx.fillStyle
  ctx.font = fontFor(node)
  ctx.textBaseline = 'alphabetic'
  if (!text.onPath || text.path.length < 2) {
    const width = text.mode === 'field' ? text.fieldWidth : undefined
    const paragraphs = text.content.split('\n')
    const lines: { text: string; start: number }[] = []
    let index = 0
    for (const paragraph of paragraphs) {
      if (width) {
        const words = paragraph.split(' ')
        let line = ''
        let lineStart = index
        for (const word of words) {
          const next = line ? `${line} ${word}` : word
          if (line && ctx.measureText(next).width > width) {
            lines.push({ text: line, start: lineStart })
            lineStart = index + line.length + 1
            line = word
          } else line = next
        }
        lines.push({ text: line, start: lineStart })
      } else lines.push({ text: paragraph, start: index })
      index += paragraph.length + 1
    }
    const lineHeight = text.fontSize * text.lineSpacing
    lines.forEach((line, row) => {
      const y = text.fontSize + row * lineHeight
      const lineWidth = ctx.measureText(line.text).width + Math.max(0, line.text.length - 1) * text.charSpacing
      let x = 0
      if (text.align === 'center') x = ((width ?? lineWidth) - lineWidth) / 2
      if (text.align === 'right') x = (width ?? lineWidth) - lineWidth
      if (!text.spans?.length && text.charSpacing === 0) {
        ctx.fillText(line.text, x, y)
        return
      }
      let cursor = x
      for (let i = 0; i < line.text.length; i++) {
        const charIndex = line.start + i
        const span = text.spans?.find((s) => charIndex >= s.start && charIndex < s.end)
        ctx.font = fontFor(node, span?.bold, span?.italic)
        ctx.fillStyle = span?.color ? cssColor(span.color) : baseFill
        const char = line.text[i]
        ctx.fillText(char, cursor, y)
        const w = ctx.measureText(char).width
        if (span?.underline) {
          ctx.fillRect(cursor, y + 2, w, Math.max(1, text.fontSize / 14))
        }
        cursor += w + text.charSpacing
      }
      ctx.font = fontFor(node)
      ctx.fillStyle = baseFill
    })
    return
  }
  const samples = sampleCommands(text.path, 6)
  let distance = text.pathOffset
  const chars = [...text.content]
  for (let c = 0; c < chars.length; c++) {
    const char = chars[c]
    const span = text.spans?.find((s) => c >= s.start && c < s.end)
    ctx.font = fontFor(node, span?.bold, span?.italic)
    ctx.fillStyle = span?.color ? cssColor(span.color) : baseFill
    const width = ctx.measureText(char).width + text.charSpacing
    let walked = 0
    for (let i = 1; i < samples.length; i++) {
      const seg = Math.hypot(samples[i].x - samples[i - 1].x, samples[i].y - samples[i - 1].y)
      if (walked + seg >= distance) {
        const t = (distance - walked) / (seg || 1)
        const px = samples[i - 1].x + (samples[i].x - samples[i - 1].x) * t
        const py = samples[i - 1].y + (samples[i].y - samples[i - 1].y) * t
        const angle = Math.atan2(samples[i].y - samples[i - 1].y, samples[i].x - samples[i - 1].x)
        ctx.save()
        ctx.translate(px, py)
        ctx.rotate(angle)
        ctx.fillText(char, 0, 0)
        ctx.restore()
        break
      }
      walked += seg
    }
    distance += width
  }
  ctx.fillStyle = baseFill
}

function drawLabels(ctx: CanvasRenderingContext2D, node: SceneNode, editor: Editor): void {
  const placed = placedLabels(node)
  if (!placed.length) return
  ctx.save()
  ctx.fillStyle = '#1c2430'
  ctx.font = '12px sans-serif'
  for (const { label, stackIndex } of placed) {
    const anchor = labelAnchor(node, label, stackIndex)
    const text = labelText(node, label, editor.doc.canvas)
    ctx.save()
    ctx.translate(anchor.x, anchor.y)
    ctx.rotate(anchor.angle)
    ctx.textAlign = anchor.textAlign
    ctx.textBaseline = anchor.baseline
    if (label.location === 'center') {
      const w = ctx.measureText(text).width + 8
      ctx.fillStyle = 'rgba(255,255,255,0.85)'
      ctx.fillRect(-w / 2, -9, w, 18)
      ctx.fillStyle = '#1c2430'
    }
    ctx.fillText(text, 0, 0)
    ctx.restore()
  }
  ctx.restore()
}

function drawDimension(ctx: CanvasRenderingContext2D, node: SceneNode, editor: Editor): void {
  const dim = node.dimension
  if (!dim) return
  const dx = dim.x2 - dim.x1
  const dy = dim.y2 - dim.y1
  const len = Math.hypot(dx, dy) || 1
  const ox = (-dy / len) * dim.offset
  const oy = (dx / len) * dim.offset
  const stroke = node.appearance.find((item): item is StrokeAttr => item.kind === 'stroke' && item.enabled)
  const color = stroke ? cssColor(stroke.color) : editor.doc.canvas.selectionColor
  ctx.save()
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineWidth = stroke?.width ?? 1
  ctx.setLineDash(stroke?.dash ?? [])
  ctx.beginPath()
  ctx.moveTo(dim.x1, dim.y1)
  ctx.lineTo(dim.x1 + ox, dim.y1 + oy)
  ctx.moveTo(dim.x2, dim.y2)
  ctx.lineTo(dim.x2 + ox, dim.y2 + oy)
  ctx.moveTo(dim.x1 + ox, dim.y1 + oy)
  ctx.lineTo(dim.x2 + ox, dim.y2 + oy)
  ctx.stroke()
  ctx.setLineDash([])
  // End ticks.
  const tick = 4
  const ux = dx / len
  const uy = dy / len
  ctx.beginPath()
  for (const [px, py] of [
    [dim.x1 + ox, dim.y1 + oy],
    [dim.x2 + ox, dim.y2 + oy],
  ]) {
    ctx.moveTo(px - (ux - uy) * tick, py - (uy + ux) * tick)
    ctx.lineTo(px + (ux - uy) * tick, py + (uy + ux) * tick)
  }
  ctx.stroke()
  ctx.font = '12px sans-serif'
  ctx.textAlign = 'center'
  ctx.save()
  ctx.translate((dim.x1 + dim.x2) / 2 + ox, (dim.y1 + dim.y2) / 2 + oy)
  let angle = Math.atan2(dy, dx)
  if (angle > Math.PI / 2 || angle < -Math.PI / 2) angle += Math.PI
  ctx.rotate(angle)
  ctx.fillText(editor.formatPoints(len), 0, -4)
  ctx.restore()
  drawLabels(ctx, node, editor)
  ctx.restore()
}

function drawGrid(ctx: CanvasRenderingContext2D, editor: Editor): void {
  const { canvas } = editor.doc
  if (!canvas.grid.show) return
  ctx.save()
  ctx.beginPath()
  ctx.rect(0, 0, canvas.width, canvas.height)
  ctx.clip()
  const blueprint = canvas.style === 'blueprint'
  ctx.strokeStyle = blueprint ? 'rgba(255,255,255,0.28)' : canvas.style === 'notebook' ? 'rgba(120, 160, 220, 0.45)' : 'rgba(90, 110, 140, 0.25)'
  ctx.lineWidth = 1 / editor.view.zoom
  const left = canvas.grid.originFromMargin ? canvas.grid.margins.left : 0
  const top = canvas.grid.originFromMargin ? canvas.grid.margins.top : 0
  const minStep = 4 / editor.view.zoom
  if (canvas.grid.spacingX >= minStep) {
    for (let x = left; x <= canvas.width; x += canvas.grid.spacingX) {
      ctx.beginPath()
      ctx.moveTo(x, canvas.grid.extend ? 0 : canvas.grid.margins.top)
      ctx.lineTo(x, canvas.grid.extend ? canvas.height : canvas.height - canvas.grid.margins.bottom)
      ctx.stroke()
    }
  }
  if (canvas.grid.spacingY >= minStep) {
    for (let y = top; y <= canvas.height; y += canvas.grid.spacingY) {
      ctx.beginPath()
      ctx.moveTo(canvas.grid.extend ? 0 : canvas.grid.margins.left, y)
      ctx.lineTo(canvas.grid.extend ? canvas.width : canvas.width - canvas.grid.margins.right, y)
      ctx.stroke()
    }
  }
  if (canvas.style === 'notebook') {
    ctx.strokeStyle = 'rgba(220, 120, 120, 0.6)'
    ctx.beginPath()
    ctx.moveTo(canvas.grid.margins.left, 0)
    ctx.lineTo(canvas.grid.margins.left, canvas.height)
    ctx.stroke()
  }
  ctx.restore()
}

/** Pick a ruler step in paper points that lands on round numbers of the base unit. */
function rulerStep(editor: Editor): { step: number; unit: string; perUnit: number } {
  const unit = editor.doc.canvas.baseUnit
  const perUnit = unit === 'px' ? 1 : unit === 'in' ? 72 : unit === 'cm' ? 72 / 2.54 : 72 / 25.4
  const minPixels = 60
  const candidates = unit === 'in' ? [0.125, 0.25, 0.5, 1, 2, 4, 8, 16, 32] : unit === 'px' ? [10, 20, 50, 100, 200, 500, 1000, 2000] : unit === 'cm' ? [0.5, 1, 2, 5, 10, 20, 50, 100] : [5, 10, 20, 50, 100, 200, 500, 1000]
  for (const candidate of candidates) {
    if (candidate * perUnit * editor.view.zoom >= minPixels) return { step: candidate * perUnit, unit, perUnit }
  }
  const last = candidates[candidates.length - 1]
  return { step: last * perUnit, unit, perUnit }
}

function drawRulers(ctx: CanvasRenderingContext2D, width: number, height: number, editor: Editor): void {
  const size = RULER_SIZE
  const { step, unit, perUnit } = rulerStep(editor)
  ctx.save()
  ctx.fillStyle = '#f7f8fa'
  ctx.fillRect(0, 0, width, size)
  ctx.fillRect(0, 0, size, height)
  const selection = editor.selectionRect()
  if (selection) {
    const a = editor.toClient({ x: selection.x, y: selection.y })
    const b = editor.toClient({ x: selection.x + selection.w, y: selection.y + selection.h })
    ctx.fillStyle = 'rgba(29, 78, 137, 0.22)'
    ctx.fillRect(a.x, 0, b.x - a.x, size)
    ctx.fillRect(0, a.y, size, b.y - a.y)
  }
  ctx.strokeStyle = '#9aa6b5'
  ctx.fillStyle = '#4a5563'
  ctx.lineWidth = 1
  ctx.font = '9px sans-serif'
  ctx.textBaseline = 'top'
  const label = (points: number) => {
    const value = points / perUnit
    const text = Math.abs(value) >= 100 ? value.toFixed(0) : Number(value.toFixed(2)).toString()
    return text
  }
  const startX = Math.floor((-editor.view.panX / editor.view.zoom) / step) * step
  for (let p = startX; editor.toClient({ x: p, y: 0 }).x < width; p += step) {
    const cx = editor.toClient({ x: p, y: 0 }).x
    if (cx < size) continue
    ctx.beginPath()
    ctx.moveTo(Math.round(cx) + 0.5, size)
    ctx.lineTo(Math.round(cx) + 0.5, size * 0.45)
    ctx.stroke()
    for (let s = 1; s < 4; s++) {
      const mx = editor.toClient({ x: p + (step * s) / 4, y: 0 }).x
      ctx.beginPath()
      ctx.moveTo(Math.round(mx) + 0.5, size)
      ctx.lineTo(Math.round(mx) + 0.5, size * (s === 2 ? 0.65 : 0.8))
      ctx.stroke()
    }
    ctx.textAlign = 'left'
    ctx.fillText(label(p), cx + 3, 2)
  }
  const startY = Math.floor((-editor.view.panY / editor.view.zoom) / step) * step
  for (let p = startY; editor.toClient({ x: 0, y: p }).y < height; p += step) {
    const cy = editor.toClient({ x: 0, y: p }).y
    if (cy < size) continue
    ctx.beginPath()
    ctx.moveTo(size, Math.round(cy) + 0.5)
    ctx.lineTo(size * 0.45, Math.round(cy) + 0.5)
    ctx.stroke()
    for (let s = 1; s < 4; s++) {
      const my = editor.toClient({ x: 0, y: p + (step * s) / 4 }).y
      ctx.beginPath()
      ctx.moveTo(size, Math.round(my) + 0.5)
      ctx.lineTo(size * (s === 2 ? 0.65 : 0.8), Math.round(my) + 0.5)
      ctx.stroke()
    }
    ctx.save()
    ctx.translate(2, cy + 3)
    ctx.rotate(-Math.PI / 2)
    ctx.textAlign = 'right'
    ctx.fillText(label(p), 0, 0)
    ctx.restore()
  }
  ctx.fillStyle = '#e7ebf0'
  ctx.fillRect(0, 0, size, size)
  ctx.fillStyle = '#4a5563'
  ctx.textAlign = 'center'
  ctx.fillText(unit, size / 2, 5)
  ctx.strokeStyle = '#d5dbe3'
  ctx.beginPath()
  ctx.moveTo(0, size + 0.5)
  ctx.lineTo(width, size + 0.5)
  ctx.moveTo(size + 0.5, 0)
  ctx.lineTo(size + 0.5, height)
  ctx.stroke()
  ctx.restore()
  void fromInches
}

/** Position and turn the context for a node: rotation happens about the node's pivot, like hit-testing and bounds. */
function applyNodeTransform(ctx: CanvasRenderingContext2D, node: SceneNode): void {
  ctx.translate(node.x, node.y)
  if (node.rotation) {
    const pivot = pivotOf(node)
    ctx.translate(pivot.x, pivot.y)
    ctx.rotate(node.rotation)
    ctx.translate(-pivot.x, -pivot.y)
  }
}

function drawSelection(ctx: CanvasRenderingContext2D, editor: Editor): void {
  const frame = editor.selectionFrame()
  if (!frame) return
  const zoom = editor.view.zoom
  ctx.save()
  ctx.strokeStyle = editor.doc.canvas.selectionColor
  ctx.lineWidth = 1 / zoom
  // The frame turns with a rotated object instead of staying an upright box around it.
  ctx.beginPath()
  frame.corners.forEach((corner, index) => (index === 0 ? ctx.moveTo(corner.x, corner.y) : ctx.lineTo(corner.x, corner.y)))
  ctx.closePath()
  ctx.stroke()
  const handleSize = 7 / zoom
  const handles = editor.handlePositions()
  const top = handles.find((handle) => handle.name === 'n')!
  const rotate = handles.find((handle) => handle.name === 'rotate')!
  ctx.fillStyle = 'white'
  for (const handle of handles) {
    if (handle.name === 'rotate') continue
    ctx.save()
    ctx.translate(handle.x, handle.y)
    ctx.rotate(frame.angle)
    ctx.fillRect(-handleSize / 2, -handleSize / 2, handleSize, handleSize)
    ctx.strokeRect(-handleSize / 2, -handleSize / 2, handleSize, handleSize)
    ctx.restore()
  }
  ctx.beginPath()
  ctx.moveTo(top.x, top.y)
  ctx.lineTo(rotate.x, rotate.y)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(rotate.x, rotate.y, handleSize / 2, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
  const node = editor.one()
  if (node && editor.tool === 'pathSelect' && node.kind === 'path') {
    ctx.save()
    applyNodeTransform(ctx, node)
    for (const anchor of anchors(node.commands)) {
      const active = editor.anchor?.id === node.id && editor.anchor.index === anchor.index
      ctx.fillStyle = active ? editor.doc.canvas.selectionColor : 'white'
      ctx.fillRect(anchor.x - handleSize / 2, anchor.y - handleSize / 2, handleSize, handleSize)
      ctx.strokeRect(anchor.x - handleSize / 2, anchor.y - handleSize / 2, handleSize, handleSize)
    }
    ctx.restore()
  }
  if (node && editor.tool === 'gradient') {
    const fill = editor.fillOf(node)
    if (fill?.gradient) {
      ctx.save()
      applyNodeTransform(ctx, node)
      ctx.beginPath()
      ctx.moveTo(fill.gradient.x1, fill.gradient.y1)
      ctx.lineTo(fill.gradient.x2, fill.gradient.y2)
      ctx.stroke()
      for (const [gx, gy] of [
        [fill.gradient.x1, fill.gradient.y1],
        [fill.gradient.x2, fill.gradient.y2],
      ]) {
        ctx.beginPath()
        ctx.arc(gx, gy, handleSize / 2 + 1 / zoom, 0, Math.PI * 2)
        ctx.fillStyle = 'white'
        ctx.fill()
        ctx.stroke()
      }
      ctx.restore()
    }
  }
  if (node && node.text?.onPath && node.text.path.length) {
    const start = sampleCommands(node.text.path, 6)
    const walked = { d: 0 }
    let handle = start[0]
    for (let i = 1; i < start.length; i++) {
      const seg = Math.hypot(start[i].x - start[i - 1].x, start[i].y - start[i - 1].y)
      if (walked.d + seg >= node.text.pathOffset) {
        const t = (node.text.pathOffset - walked.d) / (seg || 1)
        handle = { x: start[i - 1].x + (start[i].x - start[i - 1].x) * t, y: start[i - 1].y + (start[i].y - start[i - 1].y) * t }
        break
      }
      walked.d += seg
    }
    if (handle) {
      ctx.save()
      ctx.translate(node.x, node.y)
      ctx.beginPath()
      ctx.arc(handle.x, handle.y, handleSize / 2 + 1 / zoom, 0, Math.PI * 2)
      ctx.fillStyle = editor.doc.canvas.selectionColor
      ctx.fill()
      ctx.restore()
    }
  }
  ctx.restore()
}

export const canvasRenderer: Renderer = {
  render(ctx, width, height, dpr, editor) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, width, height)
    ctx.fillStyle = '#e7ebf0'
    ctx.fillRect(0, 0, width, height)
    ctx.save()
    ctx.translate(editor.view.panX, editor.view.panY)
    ctx.scale(editor.view.zoom, editor.view.zoom)
    ctx.shadowColor = 'rgba(0,0,0,0.18)'
    ctx.shadowBlur = 12
    ctx.shadowOffsetY = 2
    ctx.fillStyle = cssColor(editor.doc.canvas.background)
    ctx.fillRect(0, 0, editor.doc.canvas.width, editor.doc.canvas.height)
    ctx.shadowColor = 'transparent'
    ctx.shadowBlur = 0
    ctx.shadowOffsetY = 0
    ctx.save()
    ctx.beginPath()
    ctx.rect(0, 0, editor.doc.canvas.width, editor.doc.canvas.height)
    if (editor.doc.canvas.viewMode !== 'vector') ctx.clip()
    drawGrid(ctx, editor)
    ctx.imageSmoothingEnabled = editor.doc.canvas.viewMode !== 'pixels'
    for (const layer of editor.doc.layers) {
      if (!layer.visible) continue
      ctx.save()
      ctx.globalAlpha = layer.opacity
      ctx.globalCompositeOperation = COMPOSITE[layer.blendMode] ?? 'source-over'
      for (const node of layer.children) {
        try {
          drawNode(ctx, node, editor)
        } catch {
          /* one bad object does not clear the canvas */
        }
      }
      ctx.restore()
    }
    if (editor.preview) {
      try {
        drawNode(ctx, editor.preview, editor)
      } catch {
        /* preview paint errors are ignored */
      }
    }
    ctx.restore()
    ctx.strokeStyle = 'rgba(28, 36, 48, 0.35)'
    ctx.lineWidth = 1 / editor.view.zoom
    ctx.strokeRect(0, 0, editor.doc.canvas.width, editor.doc.canvas.height)
    if (editor.selection.length && !editor.editingTextId) drawSelection(ctx, editor)
    ctx.lineWidth = 1 / editor.view.zoom
    ctx.strokeStyle = editor.doc.canvas.selectionColor
    for (const gap of editor.gaps) {
      ctx.beginPath()
      ctx.moveTo(gap.x1, gap.y1)
      ctx.lineTo(gap.x2, gap.y2)
      ctx.stroke()
      ctx.fillStyle = editor.doc.canvas.selectionColor
      ctx.font = `${12 / editor.view.zoom}px sans-serif`
      ctx.textAlign = 'center'
      ctx.fillText(gap.label, (gap.x1 + gap.x2) / 2, gap.y1 - 4 / editor.view.zoom)
    }
    ctx.strokeStyle = '#e0457b'
    for (const line of editor.smartLines) {
      ctx.beginPath()
      ctx.moveTo(line.x1, line.y1)
      ctx.lineTo(line.x2, line.y2)
      ctx.stroke()
    }
    ctx.strokeStyle = '#2bb3c0'
    for (const guide of editor.doc.guides) {
      ctx.beginPath()
      if (guide.axis === 'v') {
        ctx.moveTo(guide.at, -1e5)
        ctx.lineTo(guide.at, 1e5)
      } else {
        ctx.moveTo(-1e5, guide.at)
        ctx.lineTo(1e5, guide.at)
      }
      ctx.stroke()
    }
    if (editor.marquee) {
      const m = editor.marquee
      ctx.save()
      ctx.strokeStyle = editor.doc.canvas.selectionColor
      ctx.fillStyle = 'rgba(29, 78, 137, 0.08)'
      ctx.setLineDash([4 / editor.view.zoom, 3 / editor.view.zoom])
      ctx.beginPath()
      ctx.rect(m.x, m.y, m.w, m.h)
      if (m.w !== 0 && m.h !== 0) ctx.fill()
      ctx.stroke()
      ctx.restore()
    }
    if (editor.loupe && editor.lastPointer) {
      const paper = editor.toPaper(editor.lastPointer)
      ctx.save()
      ctx.translate(paper.x, paper.y - 36 / editor.view.zoom)
      ctx.beginPath()
      ctx.arc(0, 0, 18 / editor.view.zoom, 0, Math.PI * 2)
      ctx.stroke()
      ctx.restore()
    }
    ctx.restore()
    if (editor.doc.canvas.showRulers) drawRulers(ctx, width, height, editor)
  },
}
