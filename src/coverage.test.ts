import { expect, it } from 'vitest'
import { CATALOG, LIBRARIES, loadCatalog, searchCatalog } from './catalog/catalog'
import { Editor } from './editor/editor'
import { exportSvg, importPsd, looksLikePsd } from './model/export'
import { cmd, commandsBounds, localBounds, paperBounds } from './model/geometry'
import { splitShade } from './model/shading'
import { separateContours } from './model/transform'
import { makeRect } from './model/factory'
import {
  paperPointsToWorldInches,
  parseLength,
  pixelFootScale,
  quarterInchFootScale,
} from './model/units'
import { dashPresetOf, psdBytes } from './editor/editor'
import type { FillAttr } from './model/types'
import { labelAnchor, makeLabel, nodeLabels, placedLabels } from './model/labels'
import { anchors } from './model/transform'
import { fromHex, hsbToRgb, rgb, rgbToCmyk, rgbToHsb, toHex } from './model/color'
import { PRESETS } from './model/factory'
import { SHORTCUTS } from './input/shortcuts'

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
  // Tests press at client (0, 0); keep the ruler strip out of the way.
  next.doc.canvas.showRulers = false
  next.doc.canvas.smartGuides = false
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
    for (const library of LIBRARIES) expect(CATALOG.some((item) => item.library === library)).toBe(true)
  },
  'catalog-bounds'() {
    let exact = 0
    for (const item of CATALOG) {
      const bounds = commandsBounds(item.commands)
      // The declared real-world box always contains the artwork, and the artwork fills most of it.
      expect(bounds.x).toBeGreaterThanOrEqual(-0.01)
      expect(bounds.y).toBeGreaterThanOrEqual(-0.01)
      expect(bounds.w).toBeLessThanOrEqual(item.worldWidth * 1.02 + 0.02)
      expect(bounds.h).toBeLessThanOrEqual(item.worldHeight * 1.02 + 0.02)
      expect(bounds.w >= item.worldWidth * 0.4 || bounds.h >= item.worldHeight * 0.4).toBe(true)
      if (Math.abs(bounds.w - item.worldWidth) < 0.02 + item.worldWidth * 0.02 && Math.abs(bounds.h - item.worldHeight) < 0.02 + item.worldHeight * 0.02) exact++
      expect(item.name.length).toBeGreaterThan(0)
      expect(item.tags.length).toBeGreaterThan(0)
    }
    expect(exact / CATALOG.length).toBeGreaterThan(0.97)
  },
  'catalog-search'() {
    const found = searchCatalog(CATALOG, 'single door')
    expect(found.length).toBeGreaterThan(0)
    expect(found[0].name).toMatch(/door/i)
    expect(searchCatalog(CATALOG, 'sofa').length).toBeGreaterThan(0)
    expect(searchCatalog(CATALOG, 'door', 'Floor Plans').every((item) => item.library === 'Floor Plans')).toBe(true)
  },
  'catalog-real-symbols'() {
    // Imported symbols are real artwork, not placeholder rectangles: curves or more than four corners.
    const imported = CATALOG.filter((item) => item.source === 'drawio' || item.source === 'floorplansvg')
    expect(imported.length).toBeGreaterThan(1800)
    const door = CATALOG.find((item) => item.id === 'floor-plan-svg-singledoor')!
    expect(door.commands.some((command) => command.c === 'C')).toBe(true)
    const nonRect = imported.filter((item) => item.commands.some((command) => command.c === 'C') || item.commands.filter((command) => command.c !== 'Z').length > 4)
    expect(nonRect.length / imported.length).toBeGreaterThan(0.9)
    const sources = new Set(imported.map((item) => item.source))
    expect(sources.has('drawio') && sources.has('floorplansvg')).toBe(true)
    const shaded = imported.filter((item) => item.fillCommands.length || item.inkCommands.length)
    expect(shaded.length).toBeGreaterThan(400)
    const tub = CATALOG.find((item) => item.id === 'floor-plan-bathtub')!
    expect(tub.fillCommands.length).toBeGreaterThan(0)
    expect(tub.inkCommands.length).toBeGreaterThan(0)
    expect(door.fillCommands).toHaveLength(0)
  },
  'place-symbol'() {
    const app = editor()
    const item = CATALOG.find((entry) => /door/i.test(entry.name) && entry.source === 'floorplansvg')!
    const id = app.placeSymbol(item.id, 0, 0)
    const node = app.doc.layers[0].children.find((entry) => entry.id === id)!
    expect(paperBounds(node).w).toBeCloseTo((item.worldWidth * 72) / (app.doc.canvas.realInchesPerPoint * 72), 0)
    expect(node.symbolId).toBe(item.id)
    // The MIT floor-plan set is line art. draw.io furniture keeps its shading.
    expect(app.fillOf(node)?.enabled).toBe(false)
    expect(node.ink?.length ?? 0).toBeGreaterThan(0)
    expect(app.strokeOf(node)!.width).toBeGreaterThan(1)
    expect(app.hit({ x: paperBounds(node).w / 2, y: paperBounds(node).h / 2 }, pointer(0, 0))?.id).toBe(id)
    const tv = app.placeSymbol('floor-plan-svg-tv', 800, 0)
    const tvNode = app.doc.layers[0].children.find((entry) => entry.id === tv)!
    expect(app.fillOf(tvNode)?.enabled).toBe(true)
    expect(tvNode.shade?.length).toBeGreaterThan(0)
    const crt = CATALOG.find((entry) => entry.id === 'floor-plan-crt-tv')!
    expect(splitShade(crt.fillCommands).inset.length).toBeGreaterThan(0)
    const tub = app.placeSymbol('floor-plan-bathtub', 400, 0)
    const tubNode = app.doc.layers[0].children.find((entry) => entry.id === tub)!
    expect(app.fillOf(tubNode)?.enabled).toBe(true)
    expect(tubNode.shade?.length).toBeGreaterThan(0)
    expect(tubNode.ink?.length).toBeGreaterThan(0)
    expect(app.exportSvg()).toContain('fill="rgba(214, 224, 236, 1)"')
    // Numbers badges carry their number as a centered text label.
    const badge = app.placeSymbol('numbers-circle-7', 100, 100)
    const badgeNode = app.doc.layers[0].children.find((entry) => entry.id === badge)!
    expect(app.labelText(badgeNode)).toBe('7')
    expect(app.labelsOf(badgeNode)[0].location).toBe('center')
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
    expect(app.one()?.kind).toBe('group')
    app.ungroup()
    expect(app.selection).toHaveLength(2)
    expect(app.doc.layers[0].children.every((node) => node.kind === 'path')).toBe(true)
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
    const fill = () => node.appearance.find((item): item is FillAttr => item.kind === 'fill')!
    expect(fill().gradient?.kind).toBe('linear')
    expect(fill().gradient?.stops.length).toBeGreaterThanOrEqual(2)
    app.setGradient('radial')
    expect(fill().gradient?.kind).toBe('radial')
    app.setPattern('dots')
    expect(fill().patternId).toBe('dots')
    expect(fill().gradient).toBeUndefined()
    const saved = app.savePattern('Tile')
    expect(saved).toBeTruthy()
    expect(app.doc.patterns.some((pattern) => pattern.id === saved)).toBe(true)
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

// ---------- selection bar, appearance, labels, adjusting objects ----------

Object.assign(cases, {
  'typed-size'() {
    const app = editor()
    const node = makeRect(10, 20, 30, 40)
    app.doc.layers[0].children.push(node)
    app.selection = [node.id]
    app.setNumber('width', '5 in')
    app.setNumber('height', '20 in')
    const rect = app.selectionRect()!
    expect(rect.w).toBeCloseTo(360)
    expect(rect.h).toBeCloseTo(1440)
    // Scaling keeps the top-left corner where it was.
    expect(rect.x).toBeCloseTo(10)
    expect(rect.y).toBeCloseTo(20)
    app.setNumber('x', '1 in')
    app.setNumber('y', '2 in')
    expect(app.selectionRect()!.x).toBeCloseTo(72)
    expect(app.selectionRect()!.y).toBeCloseTo(144)
    app.setNumber('rotation', '45')
    expect(node.rotation).toBeCloseTo(Math.PI / 4)
    expect(() => app.setNumber('width', '0 in')).toThrow(/positive/)
    expect(() => app.setNumber('width', 'abc')).toThrow()
  },
  'typed-size-scaled'() {
    const app = editor()
    app.setScale(quarterInchFootScale())
    const node = makeRect(0, 0, 10, 10)
    app.doc.layers[0].children.push(node)
    app.selection = [node.id]
    app.setNumber('width', "20'")
    expect(paperPointsToWorldInches(app.selectionRect()!.w, app.doc.canvas.realInchesPerPoint)).toBeCloseTo(240)
  },
  'dash-presets'() {
    const app = editor()
    const node = makeRect(0, 0, 10, 10)
    app.doc.layers[0].children.push(node)
    app.selection = [node.id]
    app.setDash('dotted')
    expect(app.strokeOf(node)!.dash).toEqual([1, 4])
    expect(dashPresetOf(app.strokeOf(node)!.dash)).toBe('dotted')
    app.setDash('dashed')
    expect(dashPresetOf(app.strokeOf(node)!.dash)).toBe('dashed')
    app.setDash('solid')
    expect(app.strokeOf(node)!.dash).toEqual([])
    // The preset also becomes the default for the next shape.
    app.setDash('dotted')
    app.selection = []
    app.setTool('rect')
    app.pointerDown(pointer(100, 100))
    app.pointerMove(pointer(150, 140))
    app.pointerUp(pointer(150, 140))
    const fresh = app.doc.layers[0].children[1]
    expect(dashPresetOf(app.strokeOf(fresh)!.dash)).toBe('dotted')
  },
  'line-mode-switch'() {
    const app = editor()
    app.setTool('line')
    app.pointerDown(pointer(0, 0))
    app.pointerMove(pointer(100, 0))
    app.pointerUp(pointer(100, 0))
    const line = app.doc.layers[0].children[0]
    app.selection = [line.id]
    app.setLineMode('arrow')
    expect(app.strokeOf(app.one()!)!.arrows).toBe('end')
    app.setLineMode('dimension')
    expect(app.one()!.kind).toBe('dimension')
    expect(app.one()!.dimension!.x2 - app.one()!.dimension!.x1).toBeCloseTo(100)
    app.setLineMode('plain')
    expect(app.one()!.kind).toBe('path')
    expect(app.strokeOf(app.one()!)!.arrows).toBe('none')
  },
  'label-strings'() {
    const app = editor()
    const node = makeRect(0, 0, 360, 1440)
    app.doc.layers[0].children.push(node)
    app.selection = [node.id]
    app.addLabel('width')
    app.addLabel('height')
    app.addLabel('size')
    app.addLabel('area')
    const labels = app.labelsOf(node)
    const texts = labels.map((label) => app.labelText(node, label))
    expect(texts).toEqual(['5 in', '20 in', '5 in × 20 in', '100 sq in'])
    app.setLabelUnit('ft-in')
    expect(app.labelText(node, labels[2])).toBe('5 in × 1 ft 8 in')
    app.updateLabel(0, { showUnits: false })
    app.setLabelUnit('in')
    expect(app.labelText(node, app.labelsOf(node)[0])).toBe('5')
    app.updateLabel(0, { precision: { mode: 'decimal', decimals: 2, trimZeros: false } })
    expect(app.labelText(node, app.labelsOf(node)[0])).toBe('5.00')
    app.removeLabel(3)
    expect(app.labelsOf(node)).toHaveLength(3)
    app.clearLabels()
    expect(app.labelsOf(node)).toHaveLength(0)
  },
  'label-anchors'() {
    const app = editor()
    const node = makeRect(0, 0, 200, 100)
    app.doc.layers[0].children.push(node)
    app.selection = [node.id]
    app.addLabel('width')
    app.addLabel('height')
    app.addLabel('size')
    const placed = placedLabels(node)
    const width = placed.find((entry) => entry.label.kind === 'width')!
    const height = placed.find((entry) => entry.label.kind === 'height')!
    const size = placed.find((entry) => entry.label.kind === 'size')!
    const w = labelAnchor(node, width.label, width.stackIndex)
    const h = labelAnchor(node, height.label, height.stackIndex)
    const s = labelAnchor(node, size.label, size.stackIndex)
    // Width above the shape, centered.
    expect(w.x).toBeCloseTo(100)
    expect(w.y).toBeLessThan(0)
    // Height on the left, rotated to read upward.
    expect(h.x).toBeLessThan(0)
    expect(h.y).toBeCloseTo(50)
    expect(Math.abs(h.angle)).toBeCloseTo(Math.PI / 2)
    // Size shares the top edge and stacks above the width label.
    expect(s.x).toBeCloseTo(100)
    expect(s.y).toBeLessThan(w.y)
    const legacy = makeRect(0, 0, 10, 10)
    legacy.label = makeLabel('area', app.doc.canvas)
    expect(nodeLabels(legacy)).toHaveLength(1)
  },
  'appearance-paints'() {
    const app = editor()
    const node = makeRect(0, 0, 10, 10)
    app.doc.layers[0].children.push(node)
    app.selection = [node.id]
    app.setFillHex('#ff0000')
    expect(app.hexOf(app.fillOf(node)!.color)).toBe('#ff0000')
    app.setStrokeHex('#00ff00')
    app.setStroke({ width: 3 })
    expect(app.hexOf(app.strokeOf(node)!.color)).toBe('#00ff00')
    expect(app.strokeOf(node)!.width).toBe(3)
    app.setFill({ enabled: false })
    expect(app.fillOf(node)!.enabled).toBe(false)
    app.setFill({ opacity: 0.5 })
    expect(app.fillOf(node)!.opacity).toBe(0.5)
    app.setOpacity(0.25)
    expect(node.opacity).toBe(0.25)
    for (const kind of ['dropShadow', 'innerShadow', 'outerGlow', 'innerGlow', 'blur'] as const) {
      app.toggleEffect(kind, true)
      expect(app.effectOf(node, kind)!.enabled).toBe(true)
      app.setEffect(kind, { blur: 9 })
      expect(app.effectOf(node, kind)!.blur).toBe(9)
      app.toggleEffect(kind, false)
      expect(app.effectOf(node, kind)!.enabled).toBe(false)
    }
    expect(() => app.setStroke({ width: -1 })).toThrow(/zero or more/)
    expect(() => app.setOpacity(2)).toThrow(/between 0 and 1/)
    // The toolbar paint follows the last color chosen.
    app.selection = []
    app.setFillHex('#123456')
    expect(app.hexOf(app.paint.fill)).toBe('#123456')
    expect(app.copyAsCss.bind(app)).toThrow(/Nothing selected/)
    app.selection = [node.id]
    expect(app.copyAsCss()).toMatch(/stroke: rgba\(0, 255, 0, 1\)/)
    expect(app.copyAsSvg()).toContain('<svg')
  },
  'inner-effects-clipped'() {
    const app = editor()
    const node = makeRect(0, 0, 10, 10)
    app.doc.layers[0].children.push(node)
    app.selection = [node.id]
    app.toggleEffect('innerShadow', true)
    const effect = app.effectOf(node, 'innerShadow')!
    expect(effect.enabled).toBe(true)
    // Inner effects live in the appearance list after fill and stroke so they paint on top of them.
    const order = node.appearance.map((item) => item.kind)
    expect(order.indexOf('innerShadow')).toBeGreaterThan(order.indexOf('fill'))
  },
  'transform-panel'() {
    const app = editor()
    const node = makeRect(0, 0, 100, 50)
    app.doc.layers[0].children.push(node)
    app.selection = [node.id]
    app.transform({ dx: 10, dy: 20 })
    expect(app.selectionRect()).toMatchObject({ x: 10, y: 20 })
    app.transform({ scaleX: 2, scaleY: 2, origin: 'c' })
    const rect = app.selectionRect()!
    expect(rect.w).toBeCloseTo(200)
    expect(rect.x + rect.w / 2).toBeCloseTo(60)
    app.transform({ shearX: Math.PI / 6 })
    expect(app.selectionRect()!.w).toBeGreaterThan(200)
    app.transform({ shearX: -Math.PI / 6 })
    expect(app.selectionRect()!.w).toBeCloseTo(200)
    app.transform({ rotate: Math.PI / 2, origin: 'c' })
    const turned = paperBounds(node)
    expect(turned.w).toBeCloseTo(100)
    expect(turned.h).toBeCloseTo(200)
    // The W/H fields keep reporting the object's own size while it is turned.
    expect(app.selectionRect()!.w).toBeCloseTo(200)
    expect(app.selectionRect()!.h).toBeCloseTo(100)
    // Copy makes a duplicate and remembers the step for Smart Duplicate.
    const count = app.doc.layers[0].children.length
    app.transform({ dx: 30 }, { copy: true })
    expect(app.doc.layers[0].children).toHaveLength(count + 1)
    const before = app.selectionRect()!.x
    app.smartDuplicate()
    expect(app.doc.layers[0].children).toHaveLength(count + 2)
    expect(app.selectionRect()!.x).toBeCloseTo(before + 30)
    // Scale styles doubles the stroke width.
    const styled = makeRect(0, 0, 10, 10)
    app.doc.layers[0].children.push(styled)
    app.selection = [styled.id]
    app.transform({ scaleX: 2, scaleY: 2 }, { scaleStyles: true })
    expect(app.strokeOf(styled)!.width).toBeCloseTo(2)
  },
  'copy-paste'() {
    const app = editor()
    const node = makeRect(0, 0, 10, 10)
    app.doc.layers[0].children.push(node)
    app.selection = [node.id]
    app.copy()
    app.pasteInPlace()
    expect(app.doc.layers[0].children).toHaveLength(2)
    expect(app.one()!.x).toBe(0)
    app.paste({ width: 800, height: 600 })
    expect(app.doc.layers[0].children).toHaveLength(3)
    expect(app.one()!.x).toBeCloseTo(395)
    app.cut()
    expect(app.doc.layers[0].children).toHaveLength(2)
    expect(() => editor().paste()).toThrow(/Nothing to paste/)
    app.key('z', { meta: true })
    expect(app.doc.layers[0].children).toHaveLength(3)
    app.selection = [node.id]
    app.key('d', { meta: true })
    expect(app.doc.layers[0].children).toHaveLength(4)
    app.key('a', { meta: true })
    expect(app.selection).toHaveLength(4)
  },
  'option-drag-duplicate'() {
    const app = editor()
    const node = makeRect(0, 0, 20, 20)
    app.doc.layers[0].children.push(node)
    app.selection = [node.id]
    app.pointerDown(pointer(10, 10, { alt: true }))
    app.pointerMove(pointer(60, 10, { alt: true }))
    app.pointerUp(pointer(60, 10, { alt: true }))
    expect(app.doc.layers[0].children).toHaveLength(2)
    expect(node.x).toBe(0)
    expect(app.one()!.x).toBeCloseTo(50)
    app.smartDuplicate()
    expect(app.one()!.x).toBeCloseTo(100)
  },
  'marquee-select'() {
    const app = editor()
    const a = makeRect(0, 0, 20, 20)
    const b = makeRect(100, 0, 20, 20)
    const c = makeRect(40, 40, 60, 60)
    app.doc.layers[0].children.push(a, b, c)
    app.pointerDown(pointer(200, 200))
    app.pointerMove(pointer(-10, -10))
    expect(app.marquee).toBeTruthy()
    expect(app.readout).toContain('×')
    app.pointerUp(pointer(-10, -10))
    expect(app.marquee).toBeNull()
    expect(app.selection.sort()).toEqual([a.id, b.id, c.id].sort())
    // A partial marquee touches c only.
    app.pointerDown(pointer(60, 200))
    app.pointerMove(pointer(70, 60))
    app.pointerUp(pointer(70, 60))
    expect(app.selection).toEqual([c.id])
    // Option requires objects to be fully inside.
    app.pointerDown(pointer(200, 200, { alt: true }))
    app.pointerMove(pointer(30, 30, { alt: true }))
    app.pointerUp(pointer(30, 30, { alt: true }))
    expect(app.selection).toEqual([c.id])
    // Shift adds to the selection.
    app.pointerDown(pointer(-5, -5, { shift: true }))
    app.pointerMove(pointer(25, 25, { shift: true }))
    app.pointerUp(pointer(25, 25, { shift: true }))
    expect(app.selection.sort()).toEqual([a.id, c.id].sort())
  },
  'eraser'() {
    const app = editor()
    const node = makeRect(0, 0, 100, 100)
    app.doc.layers[0].children.push(node)
    app.setTool('eraser')
    app.eraserWidth = 20
    app.pointerDown(pointer(50, -20))
    app.pointerMove(pointer(50, 120))
    app.pointerUp(pointer(50, 120))
    const after = app.doc.layers[0].children
    // A cut through the middle leaves two objects, not one path with two outlines.
    expect(after).toHaveLength(2)
    expect(after.every((item) => item.kind === 'path')).toBe(true)
    expect(app.hit({ x: 50, y: 50 }, pointer(50, 50))).toBeFalsy()
    expect(after.map((item) => item.id)).toContain(app.hit({ x: 20, y: 50 }, pointer(20, 50))?.id)
    app.undo()
    expect(app.doc.layers[0].children[0].commands.filter((command) => command.c === 'M')).toHaveLength(1)
    // A piece whose box sits inside another box is still separate when it is not inside that outline.
    const elbow = [
      cmd('M', 0, 0), cmd('L', 100, 0), cmd('L', 100, 40), cmd('L', 40, 40), cmd('L', 40, 100), cmd('L', 0, 100), cmd('Z'),
      cmd('M', 50, 50), cmd('L', 90, 50), cmd('L', 90, 90), cmd('L', 50, 90), cmd('Z'),
    ]
    expect(separateContours(elbow)).toHaveLength(2)
    const hole = [
      cmd('M', 0, 0), cmd('L', 100, 0), cmd('L', 100, 100), cmd('L', 0, 100), cmd('Z'),
      cmd('M', 25, 25), cmd('L', 75, 25), cmd('L', 75, 75), cmd('L', 25, 75), cmd('Z'),
    ]
    expect(separateContours(hole)).toHaveLength(1)
    // An open line can be shortened, or split, instead of being ignored.
    const line = editor()
    line.setTool('line')
    line.pointerDown(pointer(0, 40))
    line.pointerMove(pointer(200, 40))
    line.pointerUp(pointer(200, 40))
    line.setTool('eraser')
    line.eraserWidth = 16
    line.pointerDown(pointer(100, 10))
    line.pointerMove(pointer(100, 70))
    line.pointerUp(pointer(100, 70))
    const parts = line.doc.layers[0].children
    expect(parts).toHaveLength(2)
    expect(parts.every((item) => item.kind === 'path')).toBe(true)
    const span = (node: (typeof parts)[number]) => {
      const xs = node.commands.filter((command) => command.c !== 'Z').map((command) => command.x)
      return { min: Math.min(...xs), max: Math.max(...xs) }
    }
    const ranges = parts.map(span).sort((a, b) => a.min - b.min)
    expect(ranges[0].min).toBeLessThan(2)
    expect(ranges[0].max).toBeLessThan(100)
    expect(ranges[1].min).toBeGreaterThan(100)
    expect(ranges[1].max).toBeGreaterThan(198)
    line.undo()
    line.setTool('eraser')
    line.pointerDown(pointer(190, 10))
    line.pointerMove(pointer(190, 70))
    line.pointerUp(pointer(190, 70))
    expect(line.doc.layers[0].children).toHaveLength(1)
    const shortened = span(line.doc.layers[0].children[0])
    expect(shortened.min).toBeLessThan(2)
    expect(shortened.max).toBeLessThan(190)
    expect(shortened.max).toBeGreaterThan(160)
  },
  'scissors-add-anchor'() {
    const app = editor()
    const node = makeRect(0, 0, 100, 100)
    app.doc.layers[0].children.push(node)
    app.selection = [node.id]
    const anchorsBefore = anchors(node.commands).length
    app.addAnchorAt(node.id, { x: 50, y: 0 })
    expect(anchors(app.one()!.commands).length).toBe(anchorsBefore + 1)
    app.scissorsAt(node.id, { x: 100, y: 50 })
    expect(app.one()!.commands.some((command) => command.c === 'Z')).toBe(false)
    app.setTool('pathSelect')
    app.anchor = { id: app.one()!.id, index: 1 }
    app.disconnectAnchor()
    expect(app.doc.layers[0].children.length).toBe(2)
  },
  'anchor-drag'() {
    const app = editor()
    const node = makeRect(0, 0, 100, 100)
    app.doc.layers[0].children.push(node)
    app.selection = [node.id]
    app.setTool('pathSelect')
    app.pointerDown(pointer(100, 100))
    app.pointerMove(pointer(130, 140))
    app.pointerUp(pointer(130, 140))
    const moved = anchors(node.commands).find((anchor) => Math.abs(anchor.x - 130) < 1 && Math.abs(anchor.y - 140) < 1)
    expect(moved).toBeTruthy()
    app.deleteAnchor()
    expect(anchors(node.commands).length).toBe(3)
  },
  'compound-path'() {
    const app = editor()
    const outer = makeRect(0, 0, 100, 100)
    const inner = makeRect(25, 25, 50, 50)
    app.doc.layers[0].children.push(outer, inner)
    app.selection = [outer.id, inner.id]
    app.compound()
    expect(app.doc.layers[0].children).toHaveLength(1)
    expect(app.one()!.commands.filter((command) => command.c === 'M')).toHaveLength(2)
    app.releaseCompound()
    expect(app.doc.layers[0].children).toHaveLength(2)
  },
  'arrange-order'() {
    const app = editor()
    const a = makeRect(0, 0, 10, 10)
    const b = makeRect(0, 0, 10, 10)
    const c = makeRect(0, 0, 10, 10)
    app.doc.layers[0].children.push(a, b, c)
    app.selection = [a.id]
    app.arrange('front')
    expect(app.doc.layers[0].children[2].id).toBe(a.id)
    app.arrange('backward')
    expect(app.doc.layers[0].children[1].id).toBe(a.id)
    app.arrange('back')
    expect(app.doc.layers[0].children[0].id).toBe(a.id)
    app.key(']', { meta: true })
    expect(app.doc.layers[0].children[1].id).toBe(a.id)
  },
  'star-arc-options'() {
    const app = editor()
    app.starPoints = 6
    app.starInnerRadius = 0.7
    app.setTool('star')
    app.pointerDown(pointer(0, 0))
    app.pointerMove(pointer(100, 100))
    app.pointerUp(pointer(100, 100))
    const star = app.doc.layers[0].children[0]
    expect(star.commands.filter((command) => command.c !== 'Z')).toHaveLength(12)
    const inner = star.commands[1]
    expect(Math.hypot(inner.x - 50, inner.y - 50) / 50).toBeCloseTo(0.7, 1)
    app.arcMode = 'pie'
    app.setTool('arc')
    app.pointerDown(pointer(200, 0))
    app.pointerMove(pointer(300, 100))
    app.pointerUp(pointer(300, 100))
    const arc = app.doc.layers[0].children[1]
    expect(arc.commands.some((command) => command.c === 'Z')).toBe(true)
    expect(app.fillOf(arc)!.enabled).toBe(true)
    app.cornerRadius = 20
    app.setTool('roundRect')
    app.pointerDown(pointer(0, 200))
    app.pointerMove(pointer(100, 300))
    app.pointerUp(pointer(100, 300))
    expect(app.doc.layers[0].children[2].commands.some((command) => command.c === 'C')).toBe(true)
  },
  'new-document-styles'() {
    const app = editor()
    app.newDocument({ preset: 'a4', orientation: 'portrait', style: 'graph', colorMode: 'cmyk', name: 'Plan' })
    expect(app.doc.name).toBe('Plan')
    expect(app.doc.canvas.width).toBeLessThan(app.doc.canvas.height)
    expect(app.doc.canvas.grid.show).toBe(true)
    expect(app.doc.canvas.colorMode).toBe('cmyk')
    expect(app.doc.canvas.style).toBe('graph')
    app.newDocument({ preset: 'letter', orientation: 'landscape', style: 'blueprint' })
    expect(app.doc.canvas.width).toBeGreaterThan(app.doc.canvas.height)
    expect(app.doc.canvas.background).not.toMatchObject({ r: 255, g: 255, b: 255 })
    app.newDocument({ preset: 'custom', width: 500, height: 400, baseUnit: 'px', style: 'notebook' })
    expect(app.doc.canvas.width).toBe(500)
    expect(app.doc.canvas.grid.spacingX).toBe(0)
    expect(app.doc.canvas.grid.spacingY).toBeGreaterThan(0)
    expect(PRESETS.some((preset) => preset.id === 'iphone')).toBe(true)
    app.renameDocument('Kitchen')
    expect(app.doc.name).toBe('Kitchen')
  },
  'text-spans'() {
    const app = editor()
    app.setTool('text')
    app.pointerDown(pointer(40, 40))
    app.pointerUp(pointer(40, 40))
    app.setTextContent('Hello world')
    app.styleTextRange(0, 5, { bold: true })
    const node = app.doc.layers[0].children[0]
    expect(node.text!.spans).toEqual([{ start: 0, end: 5, bold: true }])
    app.styleTextRange(6, 11, { color: { space: 'rgb', r: 255, g: 0, b: 0, a: 1 } })
    expect(node.text!.spans).toHaveLength(2)
    // Typing before a span shifts it.
    app.setTextContent('Oh Hello world')
    expect(node.text!.spans![0].start).toBe(3)
    app.setTextProp({ fontSize: 24, align: 'center', lineSpacing: 1.5, charSpacing: 2 })
    expect(node.text).toMatchObject({ fontSize: 24, align: 'center', lineSpacing: 1.5, charSpacing: 2 })
    app.textDefaults.fontSize = 30
    app.stopTextEdit()
    app.setTool('text')
    app.pointerDown(pointer(300, 300))
    app.pointerUp(pointer(300, 300))
    expect(app.doc.layers[0].children[1].text!.fontSize).toBe(30)
  },
  'recolor-preview'() {
    const app = editor()
    const node = makeRect(0, 0, 10, 10)
    app.doc.layers[0].children.push(node)
    app.selection = [node.id]
    const before = JSON.stringify(node.appearance)
    app.beginRecolor()
    app.previewRecolor({ hue: 0.3, brightness: 0.2 })
    expect(JSON.stringify(node.appearance)).not.toBe(before)
    app.resetRecolor()
    expect(JSON.stringify(node.appearance)).toBe(before)
    app.beginRecolor()
    app.previewRecolor({ saturation: -1 })
    app.commitRecolor()
    expect(JSON.stringify(node.appearance)).not.toBe(before)
    app.undo()
    expect(JSON.stringify(app.doc.layers[0].children[0].appearance)).toBe(before)
  },
  'color-conversions'() {
    expect(toHex(fromHex('#1d4e89')!)).toBe('#1d4e89')
    const hsb = rgbToHsb(rgb(255, 0, 0))
    expect(hsb.h).toBeCloseTo(0)
    expect(hsb.s).toBeCloseTo(1)
    expect(toHex(hsbToRgb(120, 1, 1))).toBe('#00ff00')
    const cmykColor = rgbToCmyk(rgb(0, 0, 0))
    expect(cmykColor.space === 'cmyk' && cmykColor.k).toBeCloseTo(1)
    expect(fromHex('nope')).toBeNull()
  },
  'libraries-manage'() {
    const app = editor()
    const node = makeRect(0, 0, 72, 36)
    app.doc.layers[0].children.push(node)
    app.selection = [node.id]
    const id = app.createLibrary('Kitchen', '#ffcc00')
    app.addToLibrary(id, 'Island')
    expect(app.customLibraries[0].items).toHaveLength(1)
    app.renameLibrary(id, 'Kitchen plans', '#00ccff')
    expect(app.customLibraries[0]).toMatchObject({ name: 'Kitchen plans', color: '#00ccff' })
    const json = app.exportLibrary(id)
    const other = editor()
    other.importLibrary(json)
    expect(other.customLibraries[0].items[0].name).toBe('Island')
    expect(other.search('island').length).toBe(1)
    expect(other.search('island', 'Kitchen plans').length).toBe(1)
    expect(other.search('island', 'Numbers').length).toBe(0)
    expect(() => other.importLibrary('{"nope":1}')).toThrow(/not a Measured library/)
    app.deleteLibrary(id)
    expect(app.customLibraries).toHaveLength(0)
    expect(() => app.addToLibrary('missing', 'X')).not.toThrow()
    expect(app.customLibraries).toHaveLength(1)
  },
  'svg-import'() {
    const app = editor()
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g transform="translate(10 10)"><rect x="0" y="0" width="40" height="20"/><circle cx="70" cy="30" r="10"/></g><path d="M0 80 L50 90 Q60 95 70 80 Z"/></svg>'
    const id = app.importSvg(svg, 'Icon')
    const node = app.doc.layers[0].children.find((item) => item.id === id)!
    expect(node.name).toBe('Icon')
    expect(node.commands.filter((command) => command.c === 'M').length).toBe(3)
    expect(node.commands.some((command) => command.c === 'C')).toBe(true)
    const bounds = commandsBounds(node.commands)
    expect(bounds.x).toBeCloseTo(0)
    expect(bounds.w).toBeCloseTo(90)
    expect(() => app.importSvg('<svg></svg>')).toThrow(/No paths/)
  },
  'image-pdf-import'() {
    const app = editor()
    const id = app.importImage('data:image/png;base64,iVBORw0KGgo=', 120, 80, 'Photo')
    const node = app.doc.layers[0].children.find((item) => item.id === id)!
    expect(node.kind).toBe('image')
    expect(app.doc.images[node.imageId!]).toContain('data:image/png')
    app.selection = [id]
    app.setImageFill(node.imageId!)
    const pdf = app.importPdfPage(612, 792, 'brief.pdf')
    expect(app.doc.layers[0].children.find((item) => item.id === pdf)!.name).toMatch(/placeholder/)
    expect(app.banner).toMatch(/PDF import/)
    expect(app.limitation('pdf-import')).toMatch(/page-sized frame/)
  },
  'guides-rulers'() {
    const app = editor()
    app.doc.canvas.showRulers = true
    app.view = { zoom: 1, panX: 40, panY: 40 }
    // Press in the top ruler and drag down onto the canvas: a horizontal guide appears.
    app.pointerDown(pointer(200, 5))
    app.pointerMove(pointer(200, 140))
    expect(app.readout.length).toBeGreaterThan(0)
    app.pointerUp(pointer(200, 140))
    expect(app.doc.guides).toHaveLength(1)
    expect(app.doc.guides[0].axis).toBe('h')
    expect(app.doc.guides[0].at).toBeCloseTo(100)
    // Right-click on the ruler opens the ruler menu.
    app.pointerDown(pointer(5, 200, { button: 2 }))
    expect(app.context?.kind).toBe('ruler')
    app.clearGuides()
    expect(app.doc.guides).toHaveLength(0)
    app.setCanvas({ baseUnit: 'cm' })
    expect(app.doc.canvas.baseUnit).toBe('cm')
  },
  'smart-guides'() {
    const app = editor()
    app.doc.canvas.smartGuides = true
    const anchorRect = makeRect(100, 0, 20, 20)
    const moving = makeRect(0, 100, 20, 20)
    app.doc.layers[0].children.push(anchorRect, moving)
    app.selection = [moving.id]
    app.pointerDown(pointer(10, 110))
    app.pointerMove(pointer(108, 110))
    expect(app.smartLines.length).toBeGreaterThan(0)
    app.pointerUp(pointer(108, 110))
    expect(moving.x).toBeCloseTo(100)
  },
  'hit-any-layer'() {
    const app = editor()
    const node = makeRect(0, 0, 50, 50)
    app.doc.layers[0].children.push(node)
    app.addLayer()
    expect(app.doc.activeLayerId).not.toBe(app.doc.layers[0].id)
    app.pointerDown(pointer(25, 25))
    app.pointerUp(pointer(25, 25))
    expect(app.selection).toEqual([node.id])
    expect(app.doc.activeLayerId).toBe(app.doc.layers[0].id)
  },
  'symbol-hit-bbox'() {
    const app = editor()
    const door = app.placeSymbol('floor-plan-svg-singledoor', 0, 0)
    const node = app.doc.layers[0].children.find((item) => item.id === door)!
    const bounds = paperBounds(node)
    // Line-art symbols select from anywhere inside their box, not only on a stroke.
    app.pointerDown(pointer(bounds.x + bounds.w / 2, bounds.y + bounds.h / 2))
    app.pointerUp(pointer(bounds.x + bounds.w / 2, bounds.y + bounds.h / 2))
    expect(app.selection).toEqual([door])
  },
  'gradient-tool'() {
    const app = editor()
    const node = makeRect(0, 0, 100, 100)
    app.doc.layers[0].children.push(node)
    app.selection = [node.id]
    app.setTool('gradient')
    app.pointerDown(pointer(10, 50))
    app.pointerMove(pointer(90, 50))
    app.pointerUp(pointer(90, 50))
    const fill = app.fillOf(node)!
    expect(fill.gradient).toBeTruthy()
    expect(fill.gradient!.x1).toBeCloseTo(10)
    expect(fill.gradient!.x2).toBeCloseTo(90)
    app.setGradientStop(1, { offset: 0.8 })
    expect(fill.gradient!.stops[1].offset).toBe(0.8)
  },
  'export-variants'() {
    const app = editor()
    const node = makeRect(0, 0, 100, 50)
    node.name = '@slice:icon.svg'
    app.doc.layers[0].children.push(node)
    app.selection = [node.id]
    app.addLabel('size')
    const svg = app.exportSvg({ include: 'canvas' })
    expect(svg).toContain('<text')
    expect(svg).toContain('1.39 in × 0.69 in')
    expect(app.exportSvg({ scale: 2 })).toContain('<svg')
    expect(app.sliceExports()).toHaveLength(1)
    expect(app.sliceExports()[0].filename).toBe('icon.svg')
    expect(app.layerExports()).toHaveLength(1)
    app.setLineMode('dimension')
    app.setTool('line')
    app.lineMode = 'dimension'
    app.pointerDown(pointer(0, 200))
    app.pointerMove(pointer(144, 200))
    app.pointerUp(pointer(144, 200))
    expect(app.exportSvg()).toContain('2 in')
  },
  'shortcuts-tools'() {
    const app = editor()
    for (const [key, tool] of Object.entries({ e: 'eraser', c: 'scissors', g: 'gradient', '+': 'addAnchor', v: 'select', a: 'pathSelect' })) {
      app.key(key, {})
      expect(app.tool).toBe(tool)
    }
    const node = makeRect(0, 0, 10, 10)
    app.doc.layers[0].children.push(node)
    app.selection = [node.id]
    app.key('ArrowRight', { shift: true })
    expect(node.x).toBe(10)
    app.key('ArrowDown', {})
    expect(node.y).toBe(1)
    const other = makeRect(30, 0, 10, 10)
    app.doc.layers[0].children.push(other)
    app.selection = [node.id, other.id]
    app.key('g', { meta: true })
    expect(app.one()!.kind).toBe('group')
    app.key('g', { meta: true, shift: true })
    expect(app.selection).toHaveLength(2)
    expect(app.doc.layers[0].children.every((item) => item.kind === 'path')).toBe(true)
    expect(SHORTCUTS.some((item) => item.reserved)).toBe(true)
  },
  'handle-resize-anchored'() {
    const app = editor()
    // A curved library symbol: control points reach outside the drawn shape, which used to skew the math.
    const id = app.placeSymbol('floor-plan-svg-singledoor', 100, 100)
    const node = app.doc.layers[0].children.find((item) => item.id === id)!
    app.selection = [id]
    const before = paperBounds(node)
    // Drag the south-east handle 40 right and 30 down: the north-west corner must not move.
    app.pointerDown(pointer(before.x + before.w, before.y + before.h))
    app.pointerMove(pointer(before.x + before.w + 40, before.y + before.h + 30))
    app.pointerUp(pointer(before.x + before.w + 40, before.y + before.h + 30))
    const after = paperBounds(node)
    expect(after.x).toBeCloseTo(before.x, 1)
    expect(after.y).toBeCloseTo(before.y, 1)
    expect(after.w).toBeCloseTo(before.w + 40, 1)
    expect(after.h).toBeCloseTo(before.h + 30, 1)
    // The west edge handle pins the east edge.
    app.pointerDown(pointer(after.x, after.y + after.h / 2))
    app.pointerMove(pointer(after.x - 20, after.y + after.h / 2))
    app.pointerUp(pointer(after.x - 20, after.y + after.h / 2))
    const widened = paperBounds(node)
    expect(widened.x + widened.w).toBeCloseTo(after.x + after.w, 1)
    expect(widened.w).toBeCloseTo(after.w + 20, 1)
    expect(widened.h).toBeCloseTo(after.h, 1)
    // Shift keeps the proportions on a corner handle.
    app.pointerDown(pointer(widened.x + widened.w, widened.y + widened.h, { shift: true }))
    app.pointerMove(pointer(widened.x + widened.w + 50, widened.y + widened.h, { shift: true }))
    app.pointerUp(pointer(widened.x + widened.w + 50, widened.y + widened.h, { shift: true }))
    const proportional = paperBounds(node)
    expect(proportional.w / proportional.h).toBeCloseTo(widened.w / widened.h, 2)
  },
  'rotate-handle-centered'() {
    const app = editor()
    const node = makeRect(100, 100, 200, 100)
    app.doc.layers[0].children.push(node)
    app.selection = [node.id]
    const center = { x: 200, y: 150 }
    const knob = app.handlePositions().find((handle) => handle.name === 'rotate')!
    expect(knob.x).toBeCloseTo(200)
    expect(knob.y).toBeCloseTo(100 - 28)
    // Drag the knob a quarter turn clockwise around the center: the shape turns 90° in place.
    app.pointerDown(pointer(knob.x, knob.y))
    app.pointerMove(pointer(center.x + 100, center.y))
    expect(app.readout).toMatch(/90°/)
    app.pointerUp(pointer(center.x + 100, center.y))
    expect(node.rotation).toBeCloseTo(Math.PI / 2)
    const turned = paperBounds(node)
    expect(turned.x + turned.w / 2).toBeCloseTo(center.x)
    expect(turned.y + turned.h / 2).toBeCloseTo(center.y)
    expect(turned.w).toBeCloseTo(100)
    expect(turned.h).toBeCloseTo(200)
    // The frame turns with the shape instead of staying an upright box.
    const frame = app.selectionFrame()!
    expect(frame.angle).toBeCloseTo(Math.PI / 2)
    const [nw, ne] = frame.corners
    expect(Math.hypot(ne.x - nw.x, ne.y - nw.y)).toBeCloseTo(200)
    expect(Math.abs(ne.x - nw.x)).toBeLessThan(1e-6)
    // Hit-testing agrees with what is drawn: the far corner of the turned shape is inside it.
    expect(app.hit({ x: 245, y: 245 }, pointer(245, 245))?.id).toBe(node.id)
    expect(app.hit({ x: 295, y: 145 }, pointer(295, 145))).toBeFalsy()
    // Shift snaps the knob to 15° steps.
    app.pointerDown(pointer(app.handlePositions().find((handle) => handle.name === 'rotate')!.x, app.handlePositions().find((handle) => handle.name === 'rotate')!.y, { shift: true }))
    app.pointerMove(pointer(center.x + 100, center.y + 20, { shift: true }))
    app.pointerUp(pointer(center.x + 100, center.y + 20, { shift: true }))
    const degrees = (node.rotation * 180) / Math.PI
    expect(Math.abs(degrees / 15 - Math.round(degrees / 15))).toBeLessThan(1e-6)
  },
  'rotated-resize-stays-put'() {
    const app = editor()
    const node = makeRect(100, 100, 200, 100)
    node.rotation = Math.PI / 6
    app.doc.layers[0].children.push(node)
    app.selection = [node.id]
    const handles = app.handlePositions()
    const se = handles.find((handle) => handle.name === 'se')!
    const nw = handles.find((handle) => handle.name === 'nw')!
    // Pull the south-east corner outward along the shape's own x axis.
    const dx = Math.cos(Math.PI / 6) * 60
    const dy = Math.sin(Math.PI / 6) * 60
    app.pointerDown(pointer(se.x, se.y))
    app.pointerMove(pointer(se.x + dx, se.y + dy))
    app.pointerUp(pointer(se.x + dx, se.y + dy))
    const local = localBounds(node)
    expect(local.w).toBeCloseTo(260, 1)
    expect(local.h).toBeCloseTo(100, 1)
    expect(node.rotation).toBeCloseTo(Math.PI / 6)
    const nwAfter = app.handlePositions().find((handle) => handle.name === 'nw')!
    expect(nwAfter.x).toBeCloseTo(nw.x, 1)
    expect(nwAfter.y).toBeCloseTo(nw.y, 1)
    // Typing a width edits the object's own width, and the field shows it.
    app.setNumber('width', '2 in')
    expect(localBounds(node).w).toBeCloseTo(144)
    expect(app.selectionRect()!.w).toBeCloseTo(144)
    // SVG export turns about the same pivot the canvas uses.
    expect(app.exportSvg()).toMatch(/rotate\((29\.9\d*|30(\.0\d*)?) [\d.]+ [\d.]+\)/)
  },
  'group-bounds-resize'() {
    const app = editor()
    const a = makeRect(0, 0, 50, 50)
    const b = makeRect(150, 50, 50, 50)
    app.doc.layers[0].children.push(a, b)
    app.selection = [a.id, b.id]
    app.group()
    const group = app.one()!
    expect(group.kind).toBe('group')
    expect(paperBounds(group)).toMatchObject({ x: 0, y: 0, w: 200, h: 100 })
    expect(app.hit({ x: 175, y: 75 }, pointer(175, 75))?.id).toBe(group.id)
    // Scale the whole group from its south-east handle: children keep their layout.
    app.pointerDown(pointer(200, 100))
    app.pointerMove(pointer(400, 200))
    app.pointerUp(pointer(400, 200))
    expect(paperBounds(group)).toMatchObject({ x: 0, y: 0, w: 400, h: 200 })
    const [left, right] = group.children
    expect(paperBounds({ ...right, x: right.x + group.x, y: right.y + group.y })).toMatchObject({ x: 300, y: 100, w: 100, h: 100 })
    expect(commandsBounds(left.commands).w).toBeCloseTo(100)
    // Rotating a group turns its children about the group center.
    app.setNumber('rotation', '90')
    const turned = paperBounds(group)
    expect(turned.x + turned.w / 2).toBeCloseTo(200)
    expect(turned.y + turned.h / 2).toBeCloseTo(100)
    expect(turned.w).toBeCloseTo(200)
    expect(turned.h).toBeCloseTo(400)
    expect(group.children[0].rotation).toBeCloseTo(Math.PI / 2)
  },
  'multi-resize-layout'() {
    const app = editor()
    const a = makeRect(0, 0, 50, 50)
    const b = makeRect(150, 50, 50, 50)
    app.doc.layers[0].children.push(a, b)
    app.selection = [a.id, b.id]
    app.pointerDown(pointer(200, 100))
    app.pointerMove(pointer(300, 100))
    app.pointerUp(pointer(300, 100))
    expect(paperBounds(a)).toMatchObject({ x: 0, y: 0, w: 75, h: 50 })
    expect(paperBounds(b)).toMatchObject({ x: 225, y: 50, w: 75, h: 50 })
  },
  'dimension-move'() {
    const app = editor()
    app.setTool('line')
    app.lineMode = 'dimension'
    app.pointerDown(pointer(0, 100))
    app.pointerMove(pointer(100, 100))
    app.pointerUp(pointer(100, 100))
    const dim = app.doc.layers[0].children[0]
    expect(dim.kind).toBe('dimension')
    const before = paperBounds(dim)
    expect(before.w).toBeCloseTo(100)
    app.setTool('select')
    app.pointerDown(pointer(50, 128))
    app.pointerMove(pointer(50, 178))
    app.pointerUp(pointer(50, 178))
    expect(paperBounds(dim).y).toBeCloseTo(before.y + 50)
  },
})

// The 2000+ imported symbols load lazily in the app; load them once before the cases run.
await loadCatalog()

for (const [id, run] of Object.entries(cases)) {
  it(id, run)
}
