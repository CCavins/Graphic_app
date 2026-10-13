import { expect, it } from 'vitest'
import { CATALOG, searchCatalog } from './catalog/catalog'
import { Editor } from './editor/editor'
import { exportSvg, importPsd, looksLikePsd } from './model/export'
import { commandsBounds, paperBounds } from './model/geometry'
import { makeRect } from './model/factory'
import {
  paperPointsToWorldInches,
  parseLength,
  pixelFootScale,
  quarterInchFootScale,
} from './model/units'
import { psdBytes } from './editor/editor'

const pointer = (cx: number, cy: number, extra: Record<string, unknown> = {}) => ({
  cx,
  cy,
  type: 'mouse' as const,
  button: 0,
  shift: false,
  alt: false,
  meta: false,
  pressure: 0.5,
  pointerId: 1,
  ...extra,
})

function editor(): Editor {
  const next = new Editor()
  next.view = { zoom: 1, panX: 0, panY: 0 }
  next.doc.canvas.grid.snap = false
  next.doc.canvas.grid.snapPoints = false
  return next
}

export const cases: Record<string, () => void> = {
  'parse-feet'() {
    expect(parseLength(`12' 6 1/2"`, 1)).toBeCloseTo(150.5)
  },
  'parse-meters'() {
    expect(parseLength('3.5 m', 1)).toBeCloseTo(137.79527559)
  },
  'parse-px-scale'() {
    expect(parseLength('144 px', pixelFootScale())).toBeCloseTo(1728)
  },
  'paper-scale'() {
    expect(paperPointsToWorldInches(144, quarterInchFootScale())).toBeCloseTo(96)
  },
  'bad-fraction'() {
    expect(() => parseLength('1/3 in', 1)).toThrow(/not supported/)
  },
  'empty-number'() {
    expect(() => parseLength('   ', 1)).toThrow(/Enter a length/)
  },
  'canvas-max'() {
    const app = editor()
    expect(() => app.setCanvasSize(16001, 100)).toThrow(/16000/)
  },
  'negative-size'() {
    const app = editor()
    expect(() => app.setCanvasSize(-5, 100)).toThrow(/positive/)
  },
  'zero-scale'() {
    expect(() => editor().setScale(0)).toThrow(/positive/)
  },
  'draw-rect'() {
    const app = editor()
    app.setTool('rect')
    app.pointerDown(pointer(10, 20))
    app.pointerMove(pointer(110, 70))
    expect(app.readout).toContain('×')
    app.pointerUp(pointer(110, 70))
    expect(commandsBounds(app.doc.layers[0].children[0].commands)).toMatchObject({ w: 100, h: 50 })
  },
  'round-rect'() {
    const app = editor()
    app.setTool('roundRect')
    app.pointerDown(pointer(0, 0))
    app.pointerMove(pointer(40, 30))
    app.pointerUp(pointer(40, 30))
    expect(app.doc.layers[0].children[0].name).toContain('Rounded')
  },
  'ellipse'() {
    const app = editor()
    app.setTool('ellipse')
    app.pointerDown(pointer(0, 0))
    app.pointerUp(pointer(40, 20))
    expect(app.doc.layers[0].children[0].name).toBe('Ellipse')
  },
  'polygon'() {
    const app = editor()
    app.setTool('polygon')
    app.pointerDown(pointer(0, 0))
    app.pointerUp(pointer(40, 40))
    expect(app.doc.layers[0].children[0].name).toBe('Polygon')
  },
  'star'() {
    const app = editor()
    app.setTool('star')
    app.pointerDown(pointer(0, 0))
    app.pointerUp(pointer(40, 40))
    expect(app.doc.layers[0].children[0].name).toBe('Star')
  },
  'arc'() {
    const app = editor()
    app.setTool('arc')
    app.pointerDown(pointer(0, 0))
    app.pointerUp(pointer(40, 20))
    expect(app.doc.layers[0].children[0].name).toBe('Arc')
  },
  'line-arrow'() {
    const app = editor()
    app.lineMode = 'arrow'
    app.setTool('line')
    app.pointerDown(pointer(0, 0))
    app.pointerUp(pointer(80, 0))
    const stroke = app.doc.layers[0].children[0].appearance.find((item) => item.kind === 'stroke')
    expect(stroke && stroke.kind === 'stroke' && stroke.arrows).toBe('end')
  },
  'dimension-line'() {
    const app = editor()
    app.lineMode = 'dimension'
    app.setTool('line')
    app.pointerDown(pointer(0, 0))
    app.pointerUp(pointer(72, 0))
    expect(app.doc.layers[0].children[0].kind).toBe('dimension')
    expect(app.formatPoints(72)).toContain('1')
  },
  'shift-constrain'() {
    const app = editor()
    app.setTool('line')
    app.pointerDown(pointer(0, 0, { shift: true }))
    app.pointerMove(pointer(40, 10, { shift: true }))
    app.pointerUp(pointer(40, 10, { shift: true }))
    const bounds = commandsBounds(app.doc.layers[0].children[0].commands)
    expect(bounds.h).toBeLessThan(1)
  },
  'mouse-threshold'() {
    const app = editor()
    app.doc.layers[0].children.push(makeRect(0, 0, 40, 40))
    const node = app.doc.layers[0].children[0]
    app.selection = [node.id]
    app.pointerDown(pointer(10, 10))
    app.pointerMove(pointer(12, 10))
    app.pointerUp(pointer(12, 10))
    expect(node.x).toBe(0)
  },
  'touch-threshold'() {
    const app = editor()
    app.doc.layers[0].children.push(makeRect(0, 0, 80, 80))
    const node = app.doc.layers[0].children[0]
    app.selection = [node.id]
    const touch = { type: 'touch' as const }
    app.pointerDown(pointer(20, 20, touch))
    app.pointerMove(pointer(28, 20, touch))
    app.pointerUp(pointer(28, 20, touch))
    expect(node.x).toBe(0)
  },
  'touch-move'() {
    const app = editor()
    app.doc.layers[0].children.push(makeRect(0, 0, 80, 80))
    const node = app.doc.layers[0].children[0]
    app.selection = [node.id]
    const touch = { type: 'touch' as const }
    app.pointerDown(pointer(20, 20, touch))
    app.pointerMove(pointer(40, 20, touch))
    app.pointerUp(pointer(40, 20, touch))
    expect(node.x).toBeGreaterThan(10)
  },
  'two-finger-cancels'() {
    const app = editor()
    app.setTool('rect')
    app.pointerDown(pointer(10, 10))
    app.pointerDown(pointer(30, 30, { pointerId: 2, type: 'touch' }))
    app.pointerMove(pointer(90, 90))
    app.pointerUp(pointer(90, 90))
    expect(app.doc.layers[0].children).toHaveLength(0)
  },
  'hit-slop'() {
    expect(editor().hitSlop('touch')).toBe(22)
    expect(editor().hitSlop('mouse')).toBe(6)
  },
  'undo-cap'() {
    const app = editor()
    for (let i = 0; i < 220; i++) app.addLayer()
    expect(app.historySize()).toBe(200)
  },
  'undo-ends'() {
    const app = editor()
    app.undo()
    expect(app.banner).toMatch(/Nothing to undo/)
    app.redo()
    expect(app.banner).toMatch(/Nothing to redo/)
  },
  'align'() {
    const app = editor()
    const a = makeRect(0, 0, 10, 10)
    const b = makeRect(30, 5, 10, 10)
    app.doc.layers[0].children.push(a, b)
    app.selection = [a.id, b.id]
    app.align('left')
    expect(a.x).toBeCloseTo(b.x)
  },
  'align-one'() {
    const app = editor()
    const a = makeRect(0, 0, 10, 10)
    app.doc.layers[0].children.push(a)
    app.selection = [a.id]
    expect(() => app.align('left')).toThrow(/two/)
  },
  'distribute'() {
    const app = editor()
    const nodes = [0, 10, 50].map((x) => makeRect(x, 0, 10, 10))
    app.doc.layers[0].children.push(...nodes)
    app.selection = nodes.map((node) => node.id)
    app.distribute('h')
    expect(nodes[1].x).toBeGreaterThan(nodes[0].x)
    expect(nodes[2].x).toBeGreaterThan(nodes[1].x)
  },
  'flip'() {
    const app = editor()
    const a = makeRect(0, 0, 20, 10)
    const b = makeRect(100, 0, 20, 10)
    app.doc.layers[0].children.push(a, b)
    app.selection = [a.id, b.id]
    app.flip('h')
    expect(a.x).toBeGreaterThan(50)
  },
  'boolean-union'() {
    const app = editor()
    const a = makeRect(0, 0, 100, 100)
    const b = makeRect(50, 50, 100, 100)
    app.doc.layers[0].children.push(a, b)
    app.selection = [a.id, b.id]
    app.boolean('union')
    const bounds = commandsBounds(app.doc.layers[0].children.at(-1)!.commands)
    expect(bounds.w).toBeGreaterThan(140)
    expect(bounds.h).toBeGreaterThan(140)
  },
  'boolean-subtract'() {
    const app = editor()
    const a = makeRect(0, 0, 100, 100)
    const b = makeRect(50, 0, 50, 100)
    app.doc.layers[0].children.push(a, b)
    app.selection = [a.id, b.id]
    app.boolean('subtract')
    expect(commandsBounds(app.doc.layers[0].children.at(-1)!.commands).w).toBeLessThan(100)
  },
  'boolean-intersect'() {
    const app = editor()
    const a = makeRect(0, 0, 100, 100)
    const b = makeRect(50, 0, 100, 100)
    app.doc.layers[0].children.push(a, b)
    app.selection = [a.id, b.id]
    app.boolean('intersect')
    expect(commandsBounds(app.doc.layers[0].children.at(-1)!.commands).w).toBeLessThan(80)
  },
  'boolean-exclude'() {
    const app = editor()
    const a = makeRect(0, 0, 100, 100)
    const b = makeRect(50, 0, 100, 100)
    app.doc.layers[0].children.push(a, b)
    app.selection = [a.id, b.id]
    app.boolean('exclude')
    expect(app.doc.layers[0].children.length).toBeGreaterThan(0)
  },
  'boolean-divide'() {
    const app = editor()
    const a = makeRect(0, 0, 100, 100)
    const b = makeRect(50, 0, 100, 100)
    app.doc.layers[0].children.push(a, b)
    app.selection = [a.id, b.id]
    app.boolean('divide')
    expect(app.selection.length).toBeGreaterThan(1)
  },
  'boolean-one-shape'() {
    const app = editor()
    app.doc.layers[0].children.push(makeRect(0, 0, 10, 10))
    app.selection = [app.doc.layers[0].children[0].id]
    expect(() => app.boolean('union')).toThrow(/two closed/)
  },
  'boolean-open-path'() {
    const app = editor()
    app.setTool('line')
    app.pointerDown(pointer(0, 0))
    app.pointerUp(pointer(30, 0))
    app.pointerDown(pointer(0, 10))
    app.pointerUp(pointer(30, 10))
    app.selection = app.doc.layers[0].children.map((node) => node.id)
    expect(() => app.boolean('union')).toThrow(/closed/)
  },
  'delete-locked-layer'() {
    const app = editor()
    const layer = app.doc.layers[0]
    layer.locked = true
    expect(() => app.deleteLayer(layer.id)).toThrow(/Locked/)
  },
  'paste-style-empty'() {
    expect(() => editor().pasteStyle()).toThrow(/Nothing selected/)
  },
  'catalog-count'() {
    expect(CATALOG.length).toBeGreaterThanOrEqual(2000)
    const ids = new Set(CATALOG.map((item) => item.id))
    expect(ids.size).toBe(CATALOG.length)
  },
  'catalog-bounds'() {
    for (const item of CATALOG) {
      const bounds = commandsBounds(item.commands)
      expect(bounds.w).toBeCloseTo(item.worldWidth)
      expect(bounds.h).toBeCloseTo(item.worldHeight)
      expect(item.name.length).toBeGreaterThan(0)
      expect(item.tags.length).toBeGreaterThan(0)
    }
  },
  'catalog-search'() {
    const found = searchCatalog(CATALOG, '65 in TV')
    expect(found.length).toBeGreaterThan(0)
    expect(found[0].name).toMatch(/65/)
  },
  'place-symbol'() {
    const app = editor()
    const item = CATALOG.find((entry) => entry.name.startsWith('65 in'))!
    const id = app.placeSymbol(item.id, 0, 0)
    const node = app.doc.layers[0].children.find((entry) => entry.id === id)!
    expect(paperBounds(node).w).toBeCloseTo(paperPointsToWorldInches(paperBounds(node).w, 1) === 0 ? 1 : paperBounds(node).w)
    expect(paperBounds(node).w).toBeCloseTo((item.worldWidth * 72) / (app.doc.canvas.realInchesPerPoint * 72))
  },
  'file-roundtrip'() {
    const app = editor()
    app.doc.layers[0].children.push(makeRect(5, 5, 15, 15))
    const copy = editor()
    copy.loadText(app.serialize())
    expect(copy.doc.layers[0].children).toHaveLength(1)
  },
  'corrupt-file'() {
    expect(() => editor().loadText('{')).toThrow(/not a Measured/)
    expect(() => editor().loadText('{"version":2}')).toThrow(/not a Measured/)
  },
  'svg-export'() {
    const app = editor()
    app.doc.layers[0].children.push(makeRect(0, 0, 10, 10))
    const svg = app.exportSvg()
    expect(svg).toContain('<svg')
    expect(svg).toContain('<path')
  },
  'scratch-export'() {
    const app = editor()
    const node = makeRect(app.doc.canvas.width + 20, 0, 10, 10)
    app.doc.layers[0].children.push(node)
    const svg = exportSvg(app.doc, { include: 'objects', scale: 1, selection: [] })
    expect(svg).toContain('<path')
  },
  'plugin-run'() {
    const app = editor()
    app.runPlugin('api.createRect(1, 2, 3, 4)')
    expect(app.doc.layers[0].children.length).toBeGreaterThan(0)
  },
  'plugin-throw'() {
    expect(() => editor().runPlugin('throw new Error("plugin broke")')).toThrow(/plugin broke/)
  },
  'psd-reject'() {
    expect(() => importPsd(new Uint8Array([1, 2, 3, 4]))).toThrow(/PSD/)
    expect(looksLikePsd(new Uint8Array([1, 2, 3, 4]))).toBe(false)
  },
  'psd-header'() {
    const bytes = psdBytes()
    expect(looksLikePsd(bytes)).toBe(true)
    expect(importPsd(bytes).width).toBe(2)
  },
  'limitations'() {
    const app = editor()
    for (const topic of ['eps', 'icloud', 'handoff', 'dropbox', 'quicklook', 'core-graphics', 'shortcut', 'cmyk-pdf']) {
      expect(app.limitation(topic).length).toBeGreaterThan(8)
    }
  },
  'zoom-clamp'() {
    const app = editor()
    app.view.zoom = 1
    for (let i = 0; i < 40; i++) app.zoomAt(2, { x: 0, y: 0 })
    expect(app.view.zoom).toBeLessThanOrEqual(64)
    for (let i = 0; i < 40; i++) app.zoomAt(0.5, { x: 0, y: 0 })
    expect(app.view.zoom).toBeGreaterThanOrEqual(0.1)
  },
  'text-field'() {
    const app = editor()
    app.setTool('text')
    app.pointerDown(pointer(0, 0))
    app.pointerUp(pointer(80, 40))
    expect(app.doc.layers[0].children[0].text?.mode).toBe('field')
  },
  'text-on-path'() {
    const app = editor()
    app.setTool('text')
    app.pointerDown(pointer(0, 0))
    app.pointerUp(pointer(4, 4))
    app.setTool('line')
    app.pointerDown(pointer(0, 30))
    app.pointerUp(pointer(80, 30))
    app.selection = app.doc.layers[0].children.map((node) => node.id)
    app.placeTextOnPath()
    expect(app.doc.layers[0].children.some((node) => node.text?.onPath)).toBe(true)
  },
  'effects'() {
    const app = editor()
    app.doc.layers[0].children.push(makeRect(0, 0, 10, 10))
    app.selection = [app.doc.layers[0].children[0].id]
    app.enableEffect('blur')
    app.enableEffect('dropShadow')
    const kinds = app.doc.layers[0].children[0].appearance.filter((item) => item.enabled).map((item) => item.kind)
    expect(kinds).toContain('blur')
    expect(kinds).toContain('dropShadow')
  },
  'blend-modes'() {
    const app = editor()
    app.doc.layers[0].children.push(makeRect(0, 0, 10, 10))
    app.selection = [app.doc.layers[0].children[0].id]
    app.setBlend('multiply')
    expect(app.doc.layers[0].children[0].blendMode).toBe('multiply')
    app.setBlend('linear-burn')
    expect(app.doc.layers[0].children[0].blendMode).toBe('linear-burn')
  },
  'select-similar'() {
    const app = editor()
    const a = makeRect(0, 0, 10, 10)
    const b = makeRect(20, 0, 10, 10)
    app.doc.layers[0].children.push(a, b)
    app.selection = [a.id]
    app.selectSimilar('fill-color', 'all')
    expect(app.selection).toContain(b.id)
  },
  'recolor'() {
    const app = editor()
    const node = makeRect(0, 0, 10, 10)
    app.doc.layers[0].children.push(node)
    app.selection = [node.id]
    const before = JSON.stringify(node.appearance[0])
    app.recolor('hue', 0.2)
    expect(JSON.stringify(node.appearance[0])).not.toBe(before)
  },
  'layers'() {
    const app = editor()
    app.addLayer()
    expect(app.doc.layers).toHaveLength(2)
    app.renameLayer(app.doc.activeLayerId, 'Walls')
    expect(app.doc.layers.some((layer) => layer.name === 'Walls')).toBe(true)
  },
  'active-layer'() {
    const app = editor()
    app.addLayer()
    app.setTool('rect')
    app.pointerDown(pointer(0, 0))
    app.pointerUp(pointer(10, 10))
    const active = app.doc.layers.find((layer) => layer.id === app.doc.activeLayerId)!
    expect(active.children).toHaveLength(1)
  },
  'group'() {
    const app = editor()
    const nodes = [makeRect(0, 0, 10, 10), makeRect(20, 0, 10, 10)]
    app.doc.layers[0].children.push(...nodes)
    app.selection = nodes.map((node) => node.id)
    app.group()
    expect(app.doc.layers[0].children.some((node) => node.kind === 'group')).toBe(true)
  },
  'pen'() {
    const app = editor()
    app.setTool('pen')
    app.pointerDown(pointer(0, 0))
    app.pointerUp(pointer(0, 0))
    app.pointerDown(pointer(30, 10))
    app.pointerUp(pointer(30, 10))
    app.commitPen()
    expect(app.doc.layers[0].children[0].commands.length).toBeGreaterThan(1)
  },
  'join-paths'() {
    const app = editor()
    app.setTool('line')
    app.pointerDown(pointer(0, 0))
    app.pointerUp(pointer(20, 0))
    app.pointerDown(pointer(20, 0))
    app.pointerUp(pointer(20, 20))
    app.selection = app.doc.layers[0].children.map((node) => node.id)
    app.join()
    expect(app.doc.layers[0].children).toHaveLength(1)
  },
  'close-path'() {
    const app = editor()
    app.setTool('line')
    app.pointerDown(pointer(0, 0))
    app.pointerUp(pointer(20, 0))
    app.selection = [app.doc.layers[0].children[0].id]
    app.closeSelected()
    expect(app.doc.layers[0].children[0].commands.some((command) => command.c === 'Z')).toBe(true)
  },
  'reverse-path'() {
    const app = editor()
    app.setTool('line')
    app.pointerDown(pointer(0, 0))
    app.pointerUp(pointer(20, 0))
    app.selection = [app.doc.layers[0].children[0].id]
    const before = app.doc.layers[0].children[0].commands[0].x
    app.reverseSelected()
    expect(app.doc.layers[0].children[0].commands[0].x).not.toBe(before)
  },
  'outline-stroke'() {
    const app = editor()
    app.doc.layers[0].children.push(makeRect(0, 0, 20, 10))
    app.selection = [app.doc.layers[0].children[0].id]
    app.outlineSelected()
    expect(app.doc.layers[0].children.some((node) => node.name === 'Outlined stroke')).toBe(true)
  },
  'clip'() {
    const app = editor()
    const nodes = [makeRect(0, 0, 40, 40), makeRect(10, 10, 10, 10)]
    app.doc.layers[0].children.push(...nodes)
    app.selection = nodes.map((node) => node.id)
    app.clipSelection()
    expect(app.doc.layers[0].children.some((node) => node.clip)).toBe(true)
  },
  'slant'() {
    const app = editor()
    const node = makeRect(0, 0, 20, 20)
    app.doc.layers[0].children.push(node)
    app.selection = [node.id]
    app.slant(0.5)
    expect(node.commands.some((command) => command.x !== 0 && command.y !== 0)).toBe(true)
  },
  'rotate-scale'() {
    const app = editor()
    const node = makeRect(0, 0, 20, 10)
    app.doc.layers[0].children.push(node)
    app.selection = [node.id]
    app.rotateSelection(0.4)
    expect(node.rotation).toBeCloseTo(0.4)
    app.scaleSelection(2)
    expect(commandsBounds(node.commands).w).toBeCloseTo(40)
  },
  'convert-anchor'() {
    const app = editor()
    app.setTool('line')
    app.pointerDown(pointer(0, 0))
    app.pointerUp(pointer(20, 0))
    app.selection = [app.doc.layers[0].children[0].id]
    app.convertAnchor()
    expect(app.doc.layers[0].children[0].commands.some((command) => command.c === 'C')).toBe(true)
  },
  'gradient-pattern'() {
    const app = editor()
    const node = makeRect(0, 0, 20, 20)
    app.doc.layers[0].children.push(node)
    app.selection = [node.id]
    app.setGradient()
    app.setPattern('dots')
    const fill = node.appearance.find((item) => item.kind === 'fill')
    expect(fill && fill.kind === 'fill' && fill.gradient && fill.patternId).toBeTruthy()
  },
  'styles'() {
    const app = editor()
    const node = makeRect(0, 0, 10, 10)
    app.doc.layers[0].children.push(node)
    app.selection = [node.id]
    app.copyStyle()
    app.saveStyle('Blue')
    const other = makeRect(20, 0, 10, 10)
    app.doc.layers[0].children.push(other)
    app.selection = [other.id]
    app.pasteStyle()
    expect(other.appearance[0]).toBeTruthy()
  },
  'artwork-resize'() {
    const app = editor()
    const node = makeRect(10, 10, 20, 20)
    app.doc.layers[0].children.push(node)
    const before = app.doc.canvas.width
    app.resizeArtwork(2, true)
    expect(app.doc.canvas.width).toBe(before * 2)
    expect(node.x).toBe(20)
  },
  'canvas-resize'() {
    const app = editor()
    const before = app.doc.canvas.width
    app.resizeCanvas('right', 10)
    expect(app.doc.canvas.width).toBe(before + 10)
  },
  'label'() {
    const app = editor()
    const node = makeRect(0, 0, 72, 36)
    app.doc.layers[0].children.push(node)
    app.selection = [node.id]
    app.setLabel('width')
    expect(app.labelText(node)).toMatch(/in|px|ft/)
  },
  'cmyk'() {
    const app = editor()
    expect(app.limitation('cmyk-pdf')).toMatch(/CMYK/)
  },
  'wheel-zoom'() {
    const app = editor()
    const before = app.view.zoom
    app.wheel(0, -10, true, 100, 100)
    expect(app.view.zoom).toBeGreaterThan(before)
  },
  'wheel-pan'() {
    const app = editor()
    app.wheel(12, 8, false, 0, 0)
    expect(app.view.panX).toBeLessThan(0)
  },
  'appearance-cap'() {
    const app = editor()
    const node = makeRect(0, 0, 10, 10)
    app.doc.layers[0].children.push(node)
    app.selection = [node.id]
    while (node.appearance.length < 12) {
      app.addAppearance({ ...node.appearance[0], id: `extra-${node.appearance.length}` })
    }
    app.addAppearance({ ...node.appearance[0], id: 'overflow' })
    expect(app.banner).toMatch(/12/)
  },
  'search-punctuation'() {
    expect(() => searchCatalog(CATALOG, '65" tv')).not.toThrow()
  },
  'paint-error'() {
    const app = editor()
    app.seedPaintError()
    expect(app.doc.layers[0].children.some((node) => node.paintError)).toBe(true)
  },
  'custom-library'() {
    const app = editor()
    const node = makeRect(0, 0, 72, 36)
    app.doc.layers[0].children.push(node)
    app.selection = [node.id]
    app.saveCustomLibrary('Desk copy')
    expect(app.customLibrary[0].name).toBe('Desk copy')
    expect(app.search('desk copy').length).toBeGreaterThan(0)
  },
  'presets'() {
    const app = editor()
    app.newDocument('tabloid')
    expect(app.doc.canvas.width).toBeGreaterThan(1000)
  },
  'tabs'() {
    const app = editor()
    app.newDocument('letter')
    expect(app.docs).toHaveLength(2)
    app.closeDocument()
    expect(app.docs).toHaveLength(1)
  },
  'slice-name'() {
    const app = editor()
    const node = makeRect(0, 0, 10, 10)
    node.name = '@slice:hero.png'
    app.doc.layers[0].children.push(node)
    expect(app.slices()[0].name).toBe('hero')
  },
  'numeric-size'() {
    const app = editor()
    const node = makeRect(0, 0, 10, 10)
    app.doc.layers[0].children.push(node)
    app.selection = [node.id]
    app.setNumber('width', '2 in')
    expect(commandsBounds(node.commands).w).toBeCloseTo(144)
  },
  'gap-lines'() {
    const app = editor()
    const left = makeRect(0, 0, 20, 20)
    const right = makeRect(50, 0, 20, 20)
    app.doc.layers[0].children.push(left, right)
    app.selection = [left.id]
    app.pointerDown(pointer(5, 5))
    app.pointerMove(pointer(20, 5))
    expect(app.gaps.length).toBeGreaterThan(0)
  },
  'cursor-sticks'() {
    const app = editor()
    expect(app.doc.canvas.grid.snap).toBe(false)
    app.setTool('rect')
    app.pointerDown(pointer(12, 18))
    app.pointerMove(pointer(113, 67))
    app.pointerUp(pointer(113, 67))
    const node = app.doc.layers[0].children[0]
    const bounds = commandsBounds(node.commands)
    expect(node.x).toBeCloseTo(12)
    expect(node.y).toBeCloseTo(18)
    expect(node.x + bounds.w).toBeCloseTo(113)
    expect(node.y + bounds.h).toBeCloseTo(67)
  },
  'snap-inch'() {
    const app = editor()
    app.setSnap(1)
    app.setTool('rect')
    app.pointerDown(pointer(10, 20))
    app.pointerMove(pointer(100, 90))
    app.pointerUp(pointer(100, 90))
    const node = app.doc.layers[0].children[0]
    const bounds = commandsBounds(node.commands)
    expect(node.x).toBeCloseTo(0)
    expect(node.y).toBeCloseTo(0)
    expect(bounds.w).toBeCloseTo(72)
    expect(bounds.h).toBeCloseTo(72)
  },
  'smooth-pencil'() {
    const app = editor()
    app.setTool('pencil')
    const endY = Math.sin(6) * 24
    app.pointerDown(pointer(0, 0))
    for (let i = 1; i <= 12; i++) app.pointerMove(pointer(i * 8, Math.sin(i / 2) * 24))
    app.pointerUp(pointer(96, endY))
    const node = app.doc.layers[0].children[0]
    expect(node.commands.some((command) => command.c === 'C')).toBe(true)
    const end = node.commands[node.commands.length - 1]
    expect(end.x).toBeCloseTo(96)
    expect(end.y).toBeCloseTo(endY)
  },
  'smooth-pen'() {
    const app = editor()
    app.setTool('pen')
    app.pointerDown(pointer(0, 30))
    for (let i = 1; i <= 10; i++) app.pointerMove(pointer(i * 10, 30 + Math.sin(i) * 16))
    app.pointerUp(pointer(100, 30 + Math.sin(10) * 16))
    const node = app.doc.layers[0].children[0]
    expect(node.name).toBe('Pen')
    expect(node.commands.some((command) => command.c === 'C')).toBe(true)
    expect(node.commands[node.commands.length - 1].x).toBeCloseTo(100)
  },
  'edit-existing-text'() {
    const app = editor()
    app.setTool('text')
    app.pointerDown(pointer(40, 40))
    app.pointerUp(pointer(40, 40))
    expect(app.doc.layers[0].children).toHaveLength(1)
    const id = app.editingTextId
    expect(id).toBe(app.doc.layers[0].children[0].id)
    app.setTextContent('Hello')
    app.pointerDown(pointer(50, 48))
    app.pointerUp(pointer(50, 48))
    expect(app.doc.layers[0].children).toHaveLength(1)
    expect(app.editingTextId).toBe(id)
    expect(app.doc.layers[0].children[0].text?.content).toBe('Hello')
    app.pointerDown(pointer(400, 400))
    app.pointerUp(pointer(400, 400))
    expect(app.doc.layers[0].children).toHaveLength(2)
  },
  'tools-follow-cursor'() {
    for (const tool of ['rect', 'roundRect', 'ellipse', 'line'] as const) {
      const app = editor()
      app.setTool(tool)
      app.pointerDown(pointer(12, 18))
      app.pointerMove(pointer(90, 70))
      app.pointerUp(pointer(90, 70))
      const node = app.doc.layers[0].children[0]
      if (tool === 'line') {
        const end = node.commands[node.commands.length - 1]
        expect(node.x + end.x).toBeCloseTo(90)
        expect(node.y + end.y).toBeCloseTo(70)
      } else {
        const bounds = commandsBounds(node.commands)
        expect(node.x).toBeCloseTo(12)
        expect(node.y).toBeCloseTo(18)
        expect(node.x + bounds.x + bounds.w).toBeCloseTo(90)
        expect(node.y + bounds.y + bounds.h).toBeCloseTo(70)
      }
    }
  },
}

for (const [id, run] of Object.entries(cases)) {
  it(id, run)
}
