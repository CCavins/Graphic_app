import { PDFDocument, rgb as pdfRgb } from 'pdf-lib'
import { cssColor, toRgb } from './color'
import { commandsBounds, paperBounds } from './geometry'
import type { Doc, SceneNode } from './types'
import { eachNode } from './factory'
import { InputError } from './units'

export interface ExportOptions {
  include: 'canvas' | 'objects' | 'selection'
  scale: number
  selection: string[]
}

function nodesForExport(doc: Doc, options: ExportOptions): SceneNode[] {
  const all: SceneNode[] = []
  eachNode(doc, (node) => {
    if (!node.visible) return
    if (options.include === 'selection' && !options.selection.includes(node.id)) return
    all.push(node)
  })
  if (options.include === 'selection' && all.length === 0) {
    throw new InputError('Select an object to export')
  }
  return all
}

function pathD(node: SceneNode): string {
  const parts: string[] = []
  for (const c of node.commands) {
    if (c.c === 'M') parts.push(`M ${c.x} ${c.y}`)
    else if (c.c === 'L') parts.push(`L ${c.x} ${c.y}`)
    else if (c.c === 'C') parts.push(`C ${c.x1} ${c.y1} ${c.x2} ${c.y2} ${c.x} ${c.y}`)
    else parts.push('Z')
  }
  return parts.join(' ')
}

export function exportSvg(doc: Doc, options: ExportOptions): string {
  const nodes = nodesForExport(doc, options)
  const box =
    options.include === 'canvas'
      ? { x: 0, y: 0, w: doc.canvas.width, h: doc.canvas.height }
      : nodes.length
        ? nodes.reduce(
            (acc, node) => {
              const b = paperBounds(node)
              return {
                x: Math.min(acc.x, b.x),
                y: Math.min(acc.y, b.y),
                w: 0,
                h: 0,
                maxX: Math.max(acc.maxX, b.x + b.w),
                maxY: Math.max(acc.maxY, b.y + b.h),
              }
            },
            { x: Infinity, y: Infinity, w: 0, h: 0, maxX: -Infinity, maxY: -Infinity },
          )
        : { x: 0, y: 0, w: 1, h: 1, maxX: 1, maxY: 1 }
  const minX = 'maxX' in box ? box.x : 0
  const minY = 'maxY' in box ? box.y : 0
  const width = 'maxX' in box ? Math.max(1, box.maxX - box.x) : doc.canvas.width
  const height = 'maxY' in box ? Math.max(1, box.maxY - box.y) : doc.canvas.height
  const shapes = nodes
    .filter((node) => node.kind !== 'dimension')
    .map((node) => {
      const fill = node.appearance.find((a) => a.kind === 'fill' && a.enabled)
      const stroke = node.appearance.find((a) => a.kind === 'stroke' && a.enabled)
      const fillCss = fill && fill.kind === 'fill' && fill.color.a > 0 ? cssColor(fill.color) : 'none'
      const strokeCss = stroke && stroke.kind === 'stroke' ? cssColor(stroke.color) : 'none'
      const sw = stroke && stroke.kind === 'stroke' ? stroke.width : 0
      return `<g transform="translate(${node.x} ${node.y}) rotate(${(node.rotation * 180) / Math.PI})"><path d="${pathD(node)}" fill="${fillCss}" stroke="${strokeCss}" stroke-width="${sw}"/></g>`
    })
    .join('')
  const background =
    options.include === 'canvas'
      ? `<rect width="${doc.canvas.width}" height="${doc.canvas.height}" fill="${cssColor(doc.canvas.background)}"/>`
      : ''
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${width} ${height}">${background}${shapes}</svg>`
}

export function sliceNodes(doc: Doc): { name: string; ext: string; node: SceneNode }[] {
  const slices: { name: string; ext: string; node: SceneNode }[] = []
  eachNode(doc, (node) => {
    const match = node.name.match(/^@slice:(.+)\.(png|svg|pdf|gif|jpe?g|tiff?|psd)$/i)
    if (match) slices.push({ name: match[1], ext: match[2].toLowerCase(), node })
  })
  return slices
}

export async function exportPdf(doc: Doc, options: ExportOptions): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  const page = pdf.addPage([doc.canvas.width, doc.canvas.height])
  const bg = toRgb(doc.canvas.background)
  if (options.include === 'canvas') {
    page.drawRectangle({
      x: 0,
      y: 0,
      width: doc.canvas.width,
      height: doc.canvas.height,
      color: pdfRgb(bg.r / 255, bg.g / 255, bg.b / 255),
    })
  }
  const nodes = nodesForExport(doc, options)
  for (const node of nodes) {
    const fill = node.appearance.find((a) => a.kind === 'fill' && a.enabled)
    if (!fill || fill.kind !== 'fill' || fill.color.a <= 0) continue
    const color = toRgb(fill.color)
    const bounds = commandsBounds(node.commands)
    page.drawRectangle({
      x: node.x,
      y: doc.canvas.height - node.y - bounds.h,
      width: Math.max(1, bounds.w),
      height: Math.max(1, bounds.h),
      color: pdfRgb(color.r / 255, color.g / 255, color.b / 255),
    })
  }
  return pdf.save()
}

export function exportTiff(width: number, height: number, rgba: Uint8ClampedArray): Uint8Array {
  const header = 8
  const ifdCount = 8
  const ifdSize = 2 + ifdCount * 12 + 4
  const bitsOffset = header + ifdSize
  const pixels = width * height
  const rgb = new Uint8Array(pixels * 3)
  for (let i = 0; i < pixels; i++) {
    rgb[i] = rgba[i * 4]
    rgb[pixels + i] = rgba[i * 4 + 1]
    rgb[pixels * 2 + i] = rgba[i * 4 + 2]
  }
  const bytes = new Uint8Array(bitsOffset + 6 + rgb.length)
  const view = new DataView(bytes.buffer)
  bytes.set([0x49, 0x49, 0x2a, 0x00], 0)
  view.setUint32(4, header, true)
  view.setUint16(header, ifdCount, true)
  const tags: [number, number, number, number][] = [
    [256, 3, 1, width],
    [257, 3, 1, height],
    [258, 3, 3, bitsOffset],
    [259, 3, 1, 1],
    [262, 3, 1, 2],
    [273, 4, 1, bitsOffset + 6],
    [277, 3, 1, 3],
    [279, 4, 1, rgb.length],
  ]
  tags.forEach((tag, index) => {
    const offset = header + 2 + index * 12
    view.setUint16(offset, tag[0], true)
    view.setUint16(offset + 2, tag[1], true)
    view.setUint32(offset + 4, tag[2], true)
    view.setUint32(offset + 8, tag[3], true)
  })
  view.setUint16(bitsOffset, 8, true)
  view.setUint16(bitsOffset + 2, 8, true)
  view.setUint16(bitsOffset + 4, 8, true)
  bytes.set(rgb, bitsOffset + 6)
  return bytes
}

export function looksLikePsd(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x38 && bytes[1] === 0x42 && bytes[2] === 0x50 && bytes[3] === 0x53
}

export function exportPsd(width: number, height: number, rgba: Uint8ClampedArray): Uint8Array {
  const pixels = width * height
  const channels = 3
  const data = new Uint8Array(pixels * channels)
  for (let i = 0; i < pixels; i++) {
    data[i] = rgba[i * 4]
    data[pixels + i] = rgba[i * 4 + 1]
    data[pixels * 2 + i] = rgba[i * 4 + 2]
  }
  const bytes = new Uint8Array(26 + 4 + 4 + 4 + 2 + data.length)
  const view = new DataView(bytes.buffer)
  bytes.set([0x38, 0x42, 0x50, 0x53], 0)
  view.setUint16(4, 1, false)
  view.setUint16(12, channels, false)
  view.setUint32(14, height, false)
  view.setUint32(18, width, false)
  view.setUint16(22, 8, false)
  view.setUint16(24, 3, false)
  let offset = 26
  view.setUint32(offset, 0, false)
  offset += 4
  view.setUint32(offset, 0, false)
  offset += 4
  view.setUint32(offset, 0, false)
  offset += 4
  view.setUint16(offset, 0, false)
  offset += 2
  bytes.set(data, offset)
  return bytes
}

export function importPsd(bytes: Uint8Array): { width: number; height: number } {
  if (!looksLikePsd(bytes) || bytes.length < 26) throw new InputError('This file is not a PSD')
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const version = view.getUint16(4, false)
  if (version !== 1) throw new InputError('This file is not a PSD')
  const height = view.getUint32(14, false)
  const width = view.getUint32(18, false)
  if (!(width > 0) || !(height > 0)) throw new InputError('This file is not a PSD')
  return { width, height }
}

export function outsideCanvas(doc: Doc, node: SceneNode): boolean {
  const box = paperBounds(node)
  return box.x >= doc.canvas.width || box.y >= doc.canvas.height || box.x + box.w <= 0 || box.y + box.h <= 0
}
