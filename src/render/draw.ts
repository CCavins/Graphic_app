import { cssColor } from '../model/color'
import type { Editor } from '../editor/editor'
import { paperBounds, sampleCommands } from '../model/geometry'
import type { BlendMode, SceneNode } from '../model/types'

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

function trace(ctx: CanvasRenderingContext2D, node: SceneNode): void {
  ctx.beginPath()
  for (const command of node.commands) {
    if (command.c === 'M') ctx.moveTo(command.x, command.y)
    else if (command.c === 'L') ctx.lineTo(command.x, command.y)
    else if (command.c === 'C') ctx.bezierCurveTo(command.x1, command.y1, command.x2, command.y2, command.x, command.y)
    else ctx.closePath()
  }
}

function drawNode(ctx: CanvasRenderingContext2D, node: SceneNode, editor: Editor, ox = 0, oy = 0): void {
  if (!node.visible) return
  if (node.paintError) throw new Error(`Paint failed for ${node.name}`)
  const x = ox + node.x
  const y = oy + node.y
  if (node.kind === 'group') {
    ctx.save()
    ctx.translate(x, y)
    if (node.clip) {
      trace(ctx, node)
      ctx.clip()
    }
    for (const child of node.children) drawNode(ctx, child, editor)
    ctx.restore()
    return
  }
  if (node.kind === 'dimension' && node.dimension) {
    drawDimension(ctx, node, editor)
    return
  }
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(node.rotation)
  ctx.globalAlpha = node.opacity
  ctx.globalCompositeOperation = COMPOSITE[node.blendMode] ?? 'source-over'
  if (editor.doc.canvas.viewMode === 'outline') {
    ctx.strokeStyle = editor.doc.canvas.selectionColor
    ctx.lineWidth = 1
    trace(ctx, node)
    ctx.stroke()
    ctx.restore()
    return
  }
  const effects = node.appearance.filter((item) => item.enabled && item.kind !== 'fill' && item.kind !== 'stroke')
  for (const effect of effects) {
    if (effect.kind === 'fill' || effect.kind === 'stroke') continue
    if (effect.kind === 'dropShadow' || effect.kind === 'outerGlow') {
      ctx.save()
      ctx.shadowColor = cssColor(effect.color)
      ctx.shadowBlur = effect.blur
      ctx.shadowOffsetX = effect.dx
      ctx.shadowOffsetY = effect.dy
      ctx.fillStyle = effect.kind === 'outerGlow' ? cssColor(effect.color) : 'rgba(0,0,0,1)'
      trace(ctx, node)
      ctx.fill()
      ctx.restore()
    }
  }
  for (const attr of node.appearance) {
    if (!attr.enabled) continue
    if (attr.kind === 'fill') {
      if (attr.color.a <= 0 && !attr.gradient && !attr.patternId && !attr.imageId) continue
      if (attr.gradient) {
        const gradient =
          attr.gradient.kind === 'radial'
            ? ctx.createRadialGradient(attr.gradient.x1, attr.gradient.y1, 0, attr.gradient.x2, attr.gradient.y2, 80)
            : ctx.createLinearGradient(attr.gradient.x1, attr.gradient.y1, attr.gradient.x2, attr.gradient.y2)
        for (const stop of attr.gradient.stops) gradient.addColorStop(stop.offset, cssColor(stop.color))
        ctx.fillStyle = gradient
      } else if (attr.patternId) {
        ctx.fillStyle = patternStyle(ctx, attr.patternId)
      } else ctx.fillStyle = cssColor(attr.color)
      trace(ctx, node)
      ctx.fill()
    }
    if (attr.kind === 'stroke') {
      ctx.strokeStyle = cssColor(attr.color)
      ctx.lineWidth = attr.width
      ctx.setLineDash(attr.dash)
      trace(ctx, node)
      ctx.stroke()
      ctx.setLineDash([])
      if (attr.arrows !== 'none') drawArrow(ctx, node)
    }
  }
  if (node.kind === 'text' && node.text) drawText(ctx, node, editor)
  if (node.label) {
    ctx.fillStyle = '#1c2430'
    ctx.font = '12px sans-serif'
    ctx.fillText(editor.labelText(node), 0, -node.label.offset)
  }
  ctx.restore()
}

function patternStyle(ctx: CanvasRenderingContext2D, id: string): CanvasPattern | string {
  const tile = document.createElement('canvas')
  tile.width = 12
  tile.height = 12
  const g = tile.getContext('2d')
  if (!g) return '#d7deea'
  g.fillStyle = '#f4f7fb'
  g.fillRect(0, 0, 12, 12)
  g.strokeStyle = '#8aa0bf'
  if (id === 'dots') {
    g.beginPath()
    g.arc(3, 3, 1.5, 0, Math.PI * 2)
    g.fillStyle = '#8aa0bf'
    g.fill()
  } else if (id === 'grid') {
    g.strokeRect(0.5, 0.5, 11, 11)
  } else {
    g.beginPath()
    g.moveTo(0, 12)
    g.lineTo(12, 0)
    g.stroke()
  }
  return ctx.createPattern(tile, 'repeat') ?? '#d7deea'
}

function drawArrow(ctx: CanvasRenderingContext2D, node: SceneNode): void {
  const pts = sampleCommands(node.commands, 1)
  if (pts.length < 2) return
  const a = pts[pts.length - 2]
  const b = pts[pts.length - 1]
  const angle = Math.atan2(b.y - a.y, b.x - a.x)
  ctx.beginPath()
  ctx.moveTo(b.x, b.y)
  ctx.lineTo(b.x - 10 * Math.cos(angle - 0.4), b.y - 10 * Math.sin(angle - 0.4))
  ctx.moveTo(b.x, b.y)
  ctx.lineTo(b.x - 10 * Math.cos(angle + 0.4), b.y - 10 * Math.sin(angle + 0.4))
  ctx.stroke()
}

function drawText(ctx: CanvasRenderingContext2D, node: SceneNode, editor: Editor): void {
  const text = node.text
  if (!text) return
  ctx.fillStyle = '#1c2430'
  ctx.font = `${text.fontStyle} ${text.fontSize}px ${text.fontFamily}`
  if (!text.onPath || text.path.length < 2) {
    const width = text.mode === 'field' ? text.fieldWidth : undefined
    const words = text.content.split(' ')
    let line = ''
    let y = text.fontSize
    const lines: string[] = []
    if (width) {
      for (const word of words) {
        const next = line ? `${line} ${word}` : word
        if (ctx.measureText(next).width > width) {
          lines.push(line)
          line = word
        } else line = next
      }
      if (line) lines.push(line)
    } else lines.push(text.content)
    lines.forEach((item, index) => ctx.fillText(item, 0, y + index * text.fontSize * text.lineSpacing))
    return
  }
  const samples = sampleCommands(text.path, 4)
  let distance = text.pathOffset
  for (const char of text.content) {
    const width = ctx.measureText(char).width + text.charSpacing
    let walked = 0
    for (let i = 1; i < samples.length; i++) {
      const seg = Math.hypot(samples[i].x - samples[i - 1].x, samples[i].y - samples[i - 1].y)
      if (walked + seg >= distance) {
        const t = (distance - walked) / (seg || 1)
        const x = samples[i - 1].x + (samples[i].x - samples[i - 1].x) * t
        const y = samples[i - 1].y + (samples[i].y - samples[i - 1].y) * t
        ctx.fillText(char, x, y)
        break
      }
      walked += seg
    }
    distance += width
  }
  void editor
}

function drawDimension(ctx: CanvasRenderingContext2D, node: SceneNode, editor: Editor): void {
  const dim = node.dimension
  if (!dim) return
  const dx = dim.x2 - dim.x1
  const dy = dim.y2 - dim.y1
  const len = Math.hypot(dx, dy) || 1
  const ox = (-dy / len) * dim.offset
  const oy = (dx / len) * dim.offset
  ctx.save()
  ctx.strokeStyle = editor.doc.canvas.selectionColor
  ctx.fillStyle = editor.doc.canvas.selectionColor
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(dim.x1, dim.y1)
  ctx.lineTo(dim.x1 + ox, dim.y1 + oy)
  ctx.moveTo(dim.x2, dim.y2)
  ctx.lineTo(dim.x2 + ox, dim.y2 + oy)
  ctx.moveTo(dim.x1 + ox, dim.y1 + oy)
  ctx.lineTo(dim.x2 + ox, dim.y2 + oy)
  ctx.stroke()
  ctx.font = '12px sans-serif'
  ctx.fillText(editor.formatPoints(len), (dim.x1 + dim.x2) / 2 + ox, (dim.y1 + dim.y2) / 2 + oy - 4)
  ctx.restore()
}

function drawGrid(ctx: CanvasRenderingContext2D, editor: Editor): void {
  const { canvas } = editor.doc
  if (!canvas.grid.show || canvas.grid.spacingX <= 0) return
  ctx.save()
  ctx.beginPath()
  ctx.rect(0, 0, canvas.width, canvas.height)
  ctx.clip()
  ctx.strokeStyle = 'rgba(90, 110, 140, 0.25)'
  ctx.lineWidth = 1
  const left = canvas.grid.originFromMargin ? canvas.grid.margins.left : 0
  const top = canvas.grid.originFromMargin ? canvas.grid.margins.top : 0
  for (let x = left; x <= canvas.width; x += canvas.grid.spacingX) {
    ctx.beginPath()
    ctx.moveTo(x, canvas.grid.extend ? 0 : canvas.grid.margins.top)
    ctx.lineTo(x, canvas.grid.extend ? canvas.height : canvas.height - canvas.grid.margins.bottom)
    ctx.stroke()
  }
  for (let y = top; y <= canvas.height; y += canvas.grid.spacingY) {
    ctx.beginPath()
    ctx.moveTo(canvas.grid.extend ? 0 : canvas.grid.margins.left, y)
    ctx.lineTo(canvas.grid.extend ? canvas.width : canvas.width - canvas.grid.margins.right, y)
    ctx.stroke()
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
    ctx.fillStyle = cssColor(editor.doc.canvas.background)
    ctx.fillRect(0, 0, editor.doc.canvas.width, editor.doc.canvas.height)
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
    if (editor.preview) drawNode(ctx, editor.preview, editor)
    ctx.restore()
    ctx.strokeStyle = 'rgba(28, 36, 48, 0.35)'
    ctx.strokeRect(0, 0, editor.doc.canvas.width, editor.doc.canvas.height)
    if (editor.selection.length) {
      const boxes = editor.selection
        .map((id) => editor.doc.layers.flatMap((layer) => layer.children).find((node) => node.id === id))
        .filter((node): node is SceneNode => Boolean(node))
        .map((node) => paperBounds(node))
      if (boxes.length) {
        const x = Math.min(...boxes.map((box) => box.x))
        const y = Math.min(...boxes.map((box) => box.y))
        const r = Math.max(...boxes.map((box) => box.x + box.w))
        const b = Math.max(...boxes.map((box) => box.y + box.h))
        ctx.strokeStyle = editor.doc.canvas.selectionColor
        ctx.lineWidth = 1 / editor.view.zoom
        ctx.strokeRect(x, y, r - x, b - y)
      }
    }
    ctx.strokeStyle = editor.doc.canvas.selectionColor
    for (const gap of editor.gaps) {
      ctx.beginPath()
      ctx.moveTo(gap.x1, gap.y1)
      ctx.lineTo(gap.x2, gap.y2)
      ctx.stroke()
      ctx.fillStyle = editor.doc.canvas.selectionColor
      ctx.font = `${12 / editor.view.zoom}px sans-serif`
      ctx.fillText(gap.label, (gap.x1 + gap.x2) / 2, gap.y1 - 4 / editor.view.zoom)
    }
    for (const guide of editor.doc.guides) {
      ctx.beginPath()
      if (guide.axis === 'v') {
        ctx.moveTo(guide.at, -200)
        ctx.lineTo(guide.at, editor.doc.canvas.height + 200)
      } else {
        ctx.moveTo(-200, guide.at)
        ctx.lineTo(editor.doc.canvas.width + 200, guide.at)
      }
      ctx.stroke()
    }
    if (editor.loupe && editor.lastPointer) {
      const paper = editor.toPaper(editor.lastPointer)
      ctx.save()
      ctx.translate(paper.x, paper.y - 36)
      ctx.beginPath()
      ctx.arc(0, 0, 18, 0, Math.PI * 2)
      ctx.stroke()
      ctx.restore()
    }
    ctx.restore()
  },
}
