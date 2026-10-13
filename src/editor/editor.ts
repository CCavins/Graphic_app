import { CATALOG, searchCatalog, type CatalogItem } from '../catalog/catalog'
import { booleanCommands, newPathFromCommands, outlineStroke, type BooleanOp } from '../model/boolean'
import { rgb } from '../model/color'
import {
  activeLayer,
  eachNode,
  findNode,
  makeArc,
  makeDimension,
  makeDocument,
  makeEllipse,
  makeLayer,
  makeLine,
  makePath,
  makePolygon,
  makeRect,
  makeStar,
  parentList,
  selectedNodes,
} from '../model/factory'
import {
  cmd,
  commandsBounds,
  hitNode,
  localToPaper,
  paperBounds,
  reverseCommands,
  scaleCommands,
} from '../model/geometry'
import {
  alignNodes,
  applyStyle,
  bringForward,
  cloneNode,
  closePath,
  cssOf,
  distributeNodes,
  flipNodes,
  joinOpenPaths,
  nodeLength,
  openPath,
  recolorNode,
  removeNode,
  requireNode,
  resizeArtwork,
  resizeCanvasSide,
  selectSimilar,
  selectionBounds,
  sendBackward,
  type AlignMode,
  type SimilarKey,
} from '../model/ops'
import type { AppearanceItem, Doc, MeasuredFile, Pt, SceneNode } from '../model/types'
import { APPEARANCE_CAP, HISTORY_CAP, MAX_ZOOM, MIN_ZOOM, uid } from '../model/types'
import {
  assertCanvasPixels,
  assertScale,
  formatWorldLength,
  paperPointsToWorldInches,
  parseLength,
  worldInchesToPaperPoints,
} from '../model/units'
import { exportPdf, exportPsd, exportSvg, exportTiff, importPsd, looksLikePsd, outsideCanvas, sliceNodes, type ExportOptions } from '../model/export'

export type Tool =
  | 'select'
  | 'pathSelect'
  | 'convert'
  | 'pen'
  | 'pencil'
  | 'brush'
  | 'line'
  | 'arc'
  | 'rect'
  | 'roundRect'
  | 'ellipse'
  | 'polygon'
  | 'star'
  | 'text'
  | 'hand'
  | 'zoom'
  | 'scale'
  | 'rotate'
  | 'slant'
  | 'gradient'
  | 'pattern'
  | 'image'

export interface ViewState {
  zoom: number
  panX: number
  panY: number
}

export interface PointerInput {
  cx: number
  cy: number
  type: 'mouse' | 'touch' | 'pen'
  button: number
  shift: boolean
  alt: boolean
  meta: boolean
  pressure: number
  pointerId: number
}

export interface GapLine {
  x1: number
  y1: number
  x2: number
  y2: number
  label: string
}

interface Drag {
  kind: 'create' | 'move' | 'handle' | 'pan' | 'pen' | 'pencil' | 'pinch' | 'zoom'
  start: Pt
  origin: Pt
  ids: string[]
  origins: { id: string; x: number; y: number; rotation: number; commands: SceneNode['commands'] }[]
  handle?: string
  moved: boolean
  pointerId: number
}

export const LIMITATIONS: Record<string, string> = {
  eps: 'EPS import is not available in the browser.',
  icloud: 'iCloud is not available on this site. Download the .measured file instead.',
  handoff: 'Handoff is not available on this site. Open this page on the other device and load the file.',
  dropbox: 'Dropbox is not available on this site. Download or upload a .measured file.',
  quicklook: 'Quick Look is a macOS Finder feature and is not available in the browser.',
  'cmyk-pdf': 'PDF export is RGB. CMYK values are stored and shown as RGB on screen.',
  'core-graphics': 'Copy as SVG or CSS. Core Graphics source is not available in the browser.',
  psd: 'PSD export is a flattened RGB composite.',
  shortcut: 'Command-W and Command-T are reserved by the browser. Use Alt-N for a new document and Alt-W to close one.',
}

export class Editor {
  docs: Doc[]
  active = 0
  selection: string[] = []
  tool: Tool = 'select'
  lineMode: 'plain' | 'arrow' | 'dimension' = 'plain'
  view: ViewState = { zoom: 1, panX: 48, panY: 48 }
  readout = ''
  banner: string | null = null
  preview: SceneNode | null = null
  gaps: GapLine[] = []
  pen: SceneNode['commands'] = []
  polygonSides = 5
  starPoints = 5
  cornerRadius = 12
  touchMods = { constrain: false, fromCenter: false, duplicate: false }
  spaceDown = false
  context: { x: number; y: number } | null = null
  loupe = false
  lastPointer: PointerInput | null = null
  customLibrary: CatalogItem[] = []
  plugins: { id: string; name: string; code: string }[] = []
  clipboard: AppearanceItem[] | null = null
  private past: Doc[][] = []
  private future: Doc[][] = []
  private drag: Drag | null = null
  private pointers = new Map<number, PointerInput>()
  private listeners = new Set<() => void>()

  constructor(doc = makeDocument()) {
    this.docs = [doc]
    this.past = [[]]
    this.future = [[]]
  }

  get doc(): Doc {
    return this.docs[this.active]
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  emit(): void {
    for (const listener of this.listeners) listener()
  }

  toPaper(pointer: Pick<PointerInput, 'cx' | 'cy'>): Pt {
    return {
      x: (pointer.cx - this.view.panX) / this.view.zoom,
      y: (pointer.cy - this.view.panY) / this.view.zoom,
    }
  }

  toClient(paper: Pt): Pt {
    return {
      x: this.view.panX + paper.x * this.view.zoom,
      y: this.view.panY + paper.y * this.view.zoom,
    }
  }

  hitSlop(type: PointerInput['type']): number {
    return type === 'touch' ? 22 : 6
  }

  private fail(error: unknown): never {
    const message = error instanceof Error ? error.message : 'Something went wrong'
    this.banner = message
    this.emit()
    throw error instanceof Error ? error : new Error(message)
  }

  private guard(action: () => void): void {
    try {
      action()
      this.banner = null
    } catch (error) {
      this.fail(error)
    }
  }

  snapshot(): void {
    const past = this.past[this.active]
    past.push(structuredClone(this.doc))
    if (past.length > HISTORY_CAP) past.shift()
    this.future[this.active] = []
  }

  undo(): void {
    const past = this.past[this.active]
    if (!past.length) {
      this.banner = 'Nothing to undo'
      this.emit()
      return
    }
    this.future[this.active].push(structuredClone(this.doc))
    this.docs[this.active] = past.pop()!
    this.selection = []
    this.emit()
  }

  redo(): void {
    const future = this.future[this.active]
    if (!future.length) {
      this.banner = 'Nothing to redo'
      this.emit()
      return
    }
    this.past[this.active].push(structuredClone(this.doc))
    this.docs[this.active] = future.pop()!
    this.emit()
  }

  historySize(): number {
    return this.past[this.active].length
  }

  private addNode(node: SceneNode): void {
    const layer = activeLayer(this.doc)
    if (layer.locked) {
      throw new Error('The active layer is locked')
    }
    layer.children.push(node)
    this.selection = [node.id]
  }

  setTool(tool: Tool): void {
    this.tool = tool
    this.preview = null
    this.pen = []
    this.emit()
  }

  formatPoints(points: number): string {
    const inches = paperPointsToWorldInches(points, this.doc.canvas.realInchesPerPoint)
    return formatWorldLength(inches, this.doc.canvas.labelUnit, this.doc.canvas.precision, this.doc.canvas.showUnits)
  }

  private constrain(pointer: PointerInput): boolean {
    return pointer.shift || this.touchMods.constrain
  }

  private fromCenter(pointer: PointerInput): boolean {
    return pointer.alt || this.touchMods.fromCenter
  }

  private snapped(paper: Pt, pointer: PointerInput): Pt {
    let next = { ...paper }
    const grid = this.doc.canvas.grid
    if (grid.snap && grid.spacingX > 0 && grid.spacingY > 0) {
      next = {
        x: Math.round(next.x / grid.spacingX) * grid.spacingX,
        y: Math.round(next.y / grid.spacingY) * grid.spacingY,
      }
    }
    if (grid.snapPoints) {
      const tol = 8 / this.view.zoom
      eachNode(this.doc, (node) => {
        if (this.selection.includes(node.id)) return
        const box = paperBounds(node)
        for (const corner of [
          { x: box.x, y: box.y },
          { x: box.x + box.w, y: box.y },
          { x: box.x, y: box.y + box.h },
          { x: box.x + box.w, y: box.y + box.h },
        ]) {
          if (Math.hypot(corner.x - next.x, corner.y - next.y) <= tol) next = corner
        }
      })
    }
    if (this.constrain(pointer) && this.drag?.kind === 'create' && this.tool === 'line') {
      const angle = Math.atan2(next.y - this.drag.start.y, next.x - this.drag.start.x)
      const step = Math.PI / 4
      const locked = Math.round(angle / step) * step
      const dist = Math.hypot(next.x - this.drag.start.x, next.y - this.drag.start.y)
      next = { x: this.drag.start.x + Math.cos(locked) * dist, y: this.drag.start.y + Math.sin(locked) * dist }
    }
    return next
  }

  pointerDown(pointer: PointerInput): void {
    this.lastPointer = pointer
    this.pointers.set(pointer.pointerId, pointer)
    this.context = null
    if (pointer.button === 2) {
      this.context = { x: pointer.cx, y: pointer.cy }
      this.emit()
      return
    }
    if (this.pointers.size >= 2) {
      this.preview = null
      this.drag = { kind: 'pinch', start: this.toPaper(pointer), origin: { ...this.toPaper(pointer) }, ids: [], origins: [], moved: false, pointerId: pointer.pointerId }
      this.readout = ''
      this.emit()
      return
    }
    if (pointer.button === 1 || this.spaceDown || this.tool === 'hand') {
      this.drag = { kind: 'pan', start: { x: pointer.cx, y: pointer.cy }, origin: { x: this.view.panX, y: this.view.panY }, ids: [], origins: [], moved: false, pointerId: pointer.pointerId }
      return
    }
    const paper = this.snapped(this.toPaper(pointer), pointer)
    if (this.tool === 'select' || this.tool === 'pathSelect') {
      const handle = this.hitHandle(paper, pointer.type)
      if (handle && this.selection.length) {
        if (pointer.alt || this.touchMods.duplicate) this.duplicateSelection()
        this.drag = {
          kind: 'handle',
          handle,
          start: paper,
          origin: paper,
          ids: [...this.selection],
          origins: this.captureOrigins(),
          moved: false,
          pointerId: pointer.pointerId,
        }
        this.loupe = pointer.type === 'touch'
        return
      }
      const hit = this.hit(paper, pointer)
      if (hit) {
        if (pointer.shift) {
          this.selection = this.selection.includes(hit.id) ? this.selection.filter((id) => id !== hit.id) : [...this.selection, hit.id]
        } else if (!this.selection.includes(hit.id)) this.selection = [hit.id]
        if (pointer.alt || this.touchMods.duplicate) this.duplicateSelection()
        this.drag = { kind: 'move', start: paper, origin: paper, ids: [...this.selection], origins: this.captureOrigins(), moved: false, pointerId: pointer.pointerId }
      } else if (!pointer.shift) this.selection = []
      this.emit()
      return
    }
    if (this.tool === 'pen') {
      this.pen.push(cmd(this.pen.length ? 'L' : 'M', paper.x, paper.y))
      this.preview = makePath('Pen', 0, 0, this.pen)
      this.emit()
      return
    }
    if (this.tool === 'zoom') {
      this.zoomAt(pointer.alt ? 1 / 1.25 : 1.25, paper)
      return
    }
    this.drag = { kind: this.tool === 'pencil' || this.tool === 'brush' ? 'pencil' : 'create', start: paper, origin: paper, ids: [], origins: [], moved: false, pointerId: pointer.pointerId }
    if (this.tool === 'pencil' || this.tool === 'brush') this.pen = [cmd('M', paper.x, paper.y)]
  }

  pointerMove(pointer: PointerInput): void {
    this.lastPointer = pointer
    this.pointers.set(pointer.pointerId, pointer)
    if (!this.drag || this.drag.pointerId !== pointer.pointerId && this.drag.kind !== 'pinch') return
    const paper = this.snapped(this.toPaper(pointer), pointer)
    const threshold = pointer.type === 'touch' ? 10 : 3
    const clientDelta = Math.hypot(pointer.cx - this.toClient(this.drag.start).x, pointer.cy - this.toClient(this.drag.start).y)
    if (this.drag.kind === 'pan') {
      this.view.panX = this.drag.origin.x + (pointer.cx - this.drag.start.x)
      this.view.panY = this.drag.origin.y + (pointer.cy - this.drag.start.y)
      this.emit()
      return
    }
    if (this.drag.kind === 'pinch') {
      const pts = [...this.pointers.values()]
      if (pts.length >= 2) {
        const mid = { x: (pts[0].cx + pts[1].cx) / 2, y: (pts[0].cy + pts[1].cy) / 2 }
        this.view.panX += mid.x - this.toClient(this.drag.origin).x
        this.view.panY += mid.y - this.toClient(this.drag.origin).y
        this.drag.origin = this.toPaper({ cx: mid.x, cy: mid.y })
      }
      this.emit()
      return
    }
    if (!this.drag.moved && clientDelta < threshold) return
    this.drag.moved = true
    if (this.drag.kind === 'move' || this.drag.kind === 'handle') {
      this.applyMove(paper)
      return
    }
    if (this.drag.kind === 'pencil') {
      const last = this.pen[this.pen.length - 1]
      if (!last || Math.hypot(paper.x - last.x, paper.y - last.y) > 1) {
        this.pen.push(cmd('L', paper.x, paper.y))
        if (this.tool === 'brush') {
          const pressures = this.preview?.pressures ?? []
          pressures.push(pointer.pressure || 0.5)
          this.preview = makePath('Brush', 0, 0, this.pen)
          this.preview.pressures = pressures
        } else this.preview = makePath('Pencil', 0, 0, this.pen)
      }
      this.emit()
      return
    }
    this.preview = this.shapeFromDrag(this.drag.start, paper, pointer)
    const bounds = this.preview.dimension
      ? { w: Math.abs(this.preview.dimension.x2 - this.preview.dimension.x1), h: Math.abs(this.preview.dimension.y2 - this.preview.dimension.y1) }
      : commandsBounds(this.preview.commands)
    this.readout = `${this.formatPoints(bounds.w)} × ${this.formatPoints(bounds.h)}`
    this.gaps = this.measureGaps(this.preview)
    this.loupe = pointer.type === 'touch'
    this.emit()
  }

  pointerUp(pointer: PointerInput): void {
    this.pointers.delete(pointer.pointerId)
    if (this.drag?.kind === 'pinch') {
      if (this.pointers.size < 2) this.drag = null
      this.emit()
      return
    }
    if (!this.drag || this.drag.pointerId !== pointer.pointerId) return
    const drag = this.drag
    this.drag = null
    this.loupe = false
    if ((drag.kind === 'create' || drag.kind === 'pencil') && !drag.moved) {
      const paper = this.toPaper(pointer)
      const distance = Math.hypot(paper.x - drag.start.x, paper.y - drag.start.y)
      const threshold = pointer.type === 'touch' ? 10 : 3
      if (distance >= threshold) {
        drag.moved = true
        this.preview = this.shapeFromDrag(drag.start, paper, pointer)
      }
    }
    if (drag.kind === 'create' || drag.kind === 'pencil') {
      if (!drag.moved || !this.preview) {
        this.preview = null
        this.readout = ''
        this.emit()
        return
      }
      this.snapshot()
      if (this.tool === 'brush' && this.preview.pressures) {
        const stroke = this.preview.appearance.find((item) => item.kind === 'stroke')
        if (stroke && stroke.kind === 'stroke') {
          stroke.brush = { diameter: 12, angle: 0, roundness: 0.4, minWidth: 0.25 }
        }
      }
      this.addNode(this.preview)
      this.preview = null
      this.pen = []
    }
    if (drag.kind === 'move' || drag.kind === 'handle') {
      if (drag.moved) this.snapshotAfter(drag)
    }
    this.gaps = []
    this.emit()
  }

  cancel(): void {
    this.preview = null
    this.drag = null
    this.pen = []
    this.readout = ''
    this.gaps = []
    this.context = null
    this.emit()
  }

  private snapshotAfter(drag: Drag): void {
    const current = structuredClone(this.doc)
    drag.origins.forEach((origin) => {
      const node = findNode(current, origin.id)
      if (!node) return
      node.x = origin.x
      node.y = origin.y
      node.rotation = origin.rotation
      node.commands = structuredClone(origin.commands)
    })
    const past = this.past[this.active]
    past.push(current)
    if (past.length > HISTORY_CAP) past.shift()
    this.future[this.active] = []
  }

  private captureOrigins(): Drag['origins'] {
    return this.selection.flatMap((id) => {
      const node = findNode(this.doc, id)
      return node ? [{ id, x: node.x, y: node.y, rotation: node.rotation, commands: structuredClone(node.commands) }] : []
    })
  }

  private applyMove(paper: Pt): void {
    if (!this.drag) return
    const dx = paper.x - this.drag.start.x
    const dy = paper.y - this.drag.start.y
    for (const origin of this.drag.origins) {
      const node = findNode(this.doc, origin.id)
      if (!node || node.locked) continue
      if (this.drag.kind === 'handle' && this.drag.handle) this.resizeHandle(node, origin, this.drag.handle, dx, dy)
      else {
        node.x = origin.x + dx
        node.y = origin.y + dy
      }
    }
    const box = selectionBounds(this.doc, this.selection)
    this.readout = `${this.formatPoints(box.w)} × ${this.formatPoints(box.h)}`
    this.gaps = []
    const nodes = selectedNodes(this.doc, this.selection)
    if (nodes[0]) this.gaps = this.measureGaps(nodes[0])
    this.emit()
  }

  private resizeHandle(
    node: SceneNode,
    origin: { x: number; y: number; commands: SceneNode['commands'] },
    handle: string,
    dx: number,
    dy: number,
  ): void {
    const bounds = commandsBounds(origin.commands)
    let x = 0
    let y = 0
    let w = bounds.w
    let h = bounds.h
    if (handle.includes('e')) w = Math.max(1, bounds.w + dx)
    if (handle.includes('s')) h = Math.max(1, bounds.h + dy)
    if (handle.includes('w')) {
      w = Math.max(1, bounds.w - dx)
      x = dx
    }
    if (handle.includes('n')) {
      h = Math.max(1, bounds.h - dy)
      y = dy
    }
    if (handle === 'rotate') {
      node.rotation = Math.atan2(dy, dx)
      return
    }
    const sx = bounds.w ? w / bounds.w : 1
    const sy = bounds.h ? h / bounds.h : 1
    node.commands = scaleCommands(origin.commands, sx, sy)
    node.x = origin.x + x
    node.y = origin.y + y
  }

  private shapeFromDrag(start: Pt, end: Pt, pointer: PointerInput): SceneNode {
    let x1 = start.x
    let y1 = start.y
    let x2 = end.x
    let y2 = end.y
    if (this.constrain(pointer)) {
      const size = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1))
      x2 = x1 + Math.sign(x2 - x1 || 1) * size
      y2 = y1 + Math.sign(y2 - y1 || 1) * size
    }
    if (this.fromCenter(pointer)) {
      x1 = start.x - (x2 - start.x)
      y1 = start.y - (y2 - start.y)
    }
    const x = Math.min(x1, x2)
    const y = Math.min(y1, y2)
    const w = Math.max(1, Math.abs(x2 - x1))
    const h = Math.max(1, Math.abs(y2 - y1))
    if (this.tool === 'line' && this.lineMode === 'dimension') return makeDimension(start.x, start.y, end.x, end.y, 28)
    if (this.tool === 'line') return makeLine(start.x, start.y, end.x, end.y, this.lineMode === 'arrow' ? 'end' : 'none')
    if (this.tool === 'ellipse') return makeEllipse(x, y, w, h)
    if (this.tool === 'polygon') return makePolygon(x, y, w, h, this.polygonSides)
    if (this.tool === 'star') return makeStar(x, y, w, h, this.starPoints)
    if (this.tool === 'arc') return makeArc(x, y, w, h)
    if (this.tool === 'roundRect') return makeRect(x, y, w, h, this.cornerRadius)
    if (this.tool === 'text') {
      const node = makePath('Text', x, y, [])
      node.kind = 'text'
      node.text = {
        content: 'Text',
        fontFamily: 'Georgia, serif',
        fontStyle: 'normal',
        fontSize: 18,
        align: 'left',
        lineSpacing: 1.2,
        charSpacing: 0,
        mode: w > 8 ? 'field' : 'box',
        fieldWidth: Math.max(40, w),
        onPath: false,
        path: [],
        pathOffset: 0,
      }
      return node
    }
    return makeRect(x, y, w, h)
  }

  private hit(paper: Pt, pointer: PointerInput): SceneNode | undefined {
    const tol = this.hitSlop(pointer.type) / this.view.zoom
    const visit = (nodes: SceneNode[], ox: number, oy: number): SceneNode | undefined => {
      for (let i = nodes.length - 1; i >= 0; i--) {
        const node = nodes[i]
        if (!node.visible || node.locked) continue
        if (node.kind === 'group') {
          const found = visit(node.children, ox + node.x, oy + node.y)
          if (found) return found
          continue
        }
        if (hitNode({ ...node, x: node.x + ox, y: node.y + oy }, paper, tol)) return node
      }
      return undefined
    }
    for (let i = this.doc.layers.length - 1; i >= 0; i--) {
      const layer = this.doc.layers[i]
      if (!layer.visible || layer.locked) continue
      if (!pointer.meta && layer.id !== this.doc.activeLayerId) continue
      const found = visit(layer.children, 0, 0)
      if (found) return found
    }
    return undefined
  }

  private hitHandle(paper: Pt, type: PointerInput['type']): string | undefined {
    if (!this.selection.length) return undefined
    const box = selectionBounds(this.doc, this.selection)
    const tol = this.hitSlop(type) / this.view.zoom
    const handles: [string, number, number][] = [
      ['nw', box.x, box.y],
      ['n', box.x + box.w / 2, box.y],
      ['ne', box.x + box.w, box.y],
      ['e', box.x + box.w, box.y + box.h / 2],
      ['se', box.x + box.w, box.y + box.h],
      ['s', box.x + box.w / 2, box.y + box.h],
      ['sw', box.x, box.y + box.h],
      ['w', box.x, box.y + box.h / 2],
      ['rotate', box.x + box.w / 2, box.y - 28 / this.view.zoom],
    ]
    for (const [name, x, y] of handles) {
      if (Math.hypot(paper.x - x, paper.y - y) <= tol) return name
    }
    return undefined
  }

  private measureGaps(node: SceneNode): GapLine[] {
    const box = node.dimension
      ? { x: Math.min(node.dimension.x1, node.dimension.x2), y: Math.min(node.dimension.y1, node.dimension.y2), w: Math.abs(node.dimension.x2 - node.dimension.x1), h: Math.abs(node.dimension.y2 - node.dimension.y1) }
      : paperBounds(node)
    let best: GapLine | null = null
    let bestDist = 48
    eachNode(this.doc, (other) => {
      if (other.id === node.id) return
      const otherBox = paperBounds(other)
      const gap = otherBox.x - (box.x + box.w)
      if (gap > 0 && gap < bestDist) {
        bestDist = gap
        const y = box.y + box.h / 2
        best = { x1: box.x + box.w, y1: y, x2: otherBox.x, y2: y, label: this.formatPoints(gap) }
      }
    })
    return best ? [best] : []
  }

  duplicate(): void {
    if (!this.selection.length) return
    this.duplicateSelection()
    this.emit()
  }

  private duplicateSelection(): void {
    this.snapshot()
    const copies = selectedNodes(this.doc, this.selection).map((node) => cloneNode(node, 0, 0))
    const layer = activeLayer(this.doc)
    layer.children.push(...copies)
    this.selection = copies.map((node) => node.id)
  }

  wheel(dx: number, dy: number, ctrl: boolean, cx: number, cy: number): void {
    if (ctrl) {
      const paper = this.toPaper({ cx, cy })
      this.zoomAt(dy < 0 ? 1.08 : 1 / 1.08, paper)
      return
    }
    this.view.panX -= dx
    this.view.panY -= dy
    this.emit()
  }

  zoomAt(factor: number, anchor: Pt): void {
    const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, this.view.zoom * factor))
    const client = this.toClient(anchor)
    this.view.zoom = next
    const after = this.toClient(anchor)
    this.view.panX += client.x - after.x
    this.view.panY += client.y - after.y
    this.emit()
  }

  zoomCommand(kind: 'in' | 'out' | 'fit' | 'actual' | 'selection', viewport: { width: number; height: number }): void {
    if (kind === 'in') this.zoomAt(1.25, { x: this.doc.canvas.width / 2, y: this.doc.canvas.height / 2 })
    if (kind === 'out') this.zoomAt(1 / 1.25, { x: this.doc.canvas.width / 2, y: this.doc.canvas.height / 2 })
    if (kind === 'actual') {
      this.view.zoom = 1
      this.emit()
    }
    if (kind === 'fit' || kind === 'selection') {
      const box = kind === 'selection' && this.selection.length ? selectionBounds(this.doc, this.selection) : { x: 0, y: 0, w: this.doc.canvas.width, h: this.doc.canvas.height }
      const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.min((viewport.width - 80) / box.w, (viewport.height - 80) / box.h)))
      this.view.zoom = zoom
      this.view.panX = 40 - box.x * zoom
      this.view.panY = 40 - box.y * zoom
      this.emit()
    }
  }

  setCanvasSize(width: number, height: number): void {
    this.guard(() => {
      assertCanvasPixels(width, height)
      this.snapshot()
      this.doc.canvas.width = width
      this.doc.canvas.height = height
      this.emit()
    })
  }

  setScale(realInchesPerPoint: number): void {
    this.guard(() => {
      assertScale(realInchesPerPoint)
      this.snapshot()
      this.doc.canvas.realInchesPerPoint = realInchesPerPoint
      this.emit()
    })
  }

  setLabelUnit(unit: Doc['canvas']['labelUnit']): void {
    this.snapshot()
    this.doc.canvas.labelUnit = unit
    this.emit()
  }

  newDocument(preset: string): void {
    const doc = makeDocument(preset, `Untitled ${this.docs.length + 1}`)
    this.docs.push(doc)
    this.past.push([])
    this.future.push([])
    this.active = this.docs.length - 1
    this.selection = []
    this.emit()
  }

  closeDocument(): void {
    if (this.docs.length === 1) {
      this.docs[0] = makeDocument()
      this.selection = []
      this.emit()
      return
    }
    this.docs.splice(this.active, 1)
    this.past.splice(this.active, 1)
    this.future.splice(this.active, 1)
    this.active = Math.max(0, this.active - 1)
    this.selection = []
    this.emit()
  }

  selectTab(index: number): void {
    this.active = index
    this.selection = []
    this.emit()
  }

  addLayer(): void {
    this.snapshot()
    const layer = makeLayer(`Layer ${this.doc.layers.length + 1}`)
    const index = this.doc.layers.findIndex((item) => item.id === this.doc.activeLayerId)
    this.doc.layers.splice(index + 1, 0, layer)
    this.doc.activeLayerId = layer.id
    this.emit()
  }

  renameLayer(id: string, name: string): void {
    const layer = this.doc.layers.find((item) => item.id === id)
    if (!layer) return
    this.snapshot()
    layer.name = name
    this.emit()
  }

  deleteLayer(id: string): void {
    this.guard(() => {
      const layer = this.doc.layers.find((item) => item.id === id)
      if (!layer) return
      if (layer.locked) throw new Error('Locked layers cannot be deleted')
      if (this.doc.layers.length === 1) throw new Error('A document needs one layer')
      this.snapshot()
      this.doc.layers = this.doc.layers.filter((item) => item.id !== id)
      this.doc.activeLayerId = this.doc.layers[0].id
      this.emit()
    })
  }

  duplicateLayer(id: string): void {
    const layer = this.doc.layers.find((item) => item.id === id)
    if (!layer) return
    this.snapshot()
    const copy = structuredClone(layer)
    copy.id = uid('l')
    copy.name = `${layer.name} copy`
    copy.children.forEach(function stamp(node: SceneNode) {
      node.id = uid('n')
      node.children.forEach(stamp)
    })
    this.doc.layers.push(copy)
    this.emit()
  }

  mergeDown(id: string): void {
    const index = this.doc.layers.findIndex((item) => item.id === id)
    if (index <= 0) return
    this.snapshot()
    const layer = this.doc.layers[index]
    this.doc.layers[index - 1].children.push(...layer.children)
    this.doc.layers.splice(index, 1)
    this.emit()
  }

  toggleLock(id: string): void {
    this.snapshot()
    const layer = this.doc.layers.find((item) => item.id === id)
    if (layer) layer.locked = !layer.locked
    const node = findNode(this.doc, id)
    if (node) node.locked = !node.locked
    this.emit()
  }

  unlockAll(): void {
    this.snapshot()
    for (const layer of this.doc.layers) {
      layer.locked = false
      eachNode(this.doc, (node) => {
        node.locked = false
      })
    }
    this.emit()
  }

  group(): void {
    const nodes = selectedNodes(this.doc, this.selection)
    if (nodes.length < 2) return
    this.snapshot()
    const group = makePath('Group', 0, 0, [])
    group.kind = 'group'
    group.children = nodes.map((node) => structuredClone(node))
    for (const node of nodes) removeNode(this.doc, node.id)
    this.addNode(group)
    this.emit()
  }

  ungroup(): void {
    const node = this.selection.length === 1 ? findNode(this.doc, this.selection[0]) : undefined
    if (!node || node.kind !== 'group') return
    this.snapshot()
    const list = parentList(this.doc, node.id)
    if (!list) return
    const index = list.findIndex((item) => item.id === node.id)
    list.splice(index, 1, ...node.children)
    this.selection = node.children.map((child) => child.id)
    this.emit()
  }

  align(mode: AlignMode): void {
    this.guard(() => {
      this.snapshot()
      alignNodes(selectedNodes(this.doc, this.selection), mode)
      this.emit()
    })
  }

  distribute(axis: 'h' | 'v'): void {
    this.guard(() => {
      this.snapshot()
      distributeNodes(selectedNodes(this.doc, this.selection), axis)
      this.emit()
    })
  }

  flip(axis: 'h' | 'v'): void {
    this.guard(() => {
      this.snapshot()
      flipNodes(selectedNodes(this.doc, this.selection), axis)
      this.emit()
    })
  }

  arrange(direction: 'forward' | 'backward'): void {
    if (this.selection.length !== 1) return
    this.snapshot()
    if (direction === 'forward') bringForward(this.doc, this.selection[0])
    else sendBackward(this.doc, this.selection[0])
    this.emit()
  }

  boolean(op: BooleanOp): void {
    this.guard(() => {
      if (this.selection.length < 2) throw new Error('Select two closed paths')
      const nodes = selectedNodes(this.doc, this.selection)
      if (nodes.some((node) => !node.commands.some((command) => command.c === 'Z'))) {
        throw new Error('Boolean operations need closed paths')
      }
      const rear = nodes[0]
      const front = nodes[1]
      const results = booleanCommands(op, paperCommands(rear), paperCommands(front))
      this.snapshot()
      nodes.forEach((node) => removeNode(this.doc, node.id))
      const created = results.map((commands, index) => newPathFromCommands(rear, commands, index === 0 ? 'Combined' : `Piece ${index + 1}`))
      created.forEach((node) => {
        node.x = 0
        node.y = 0
        this.addNode(node)
      })
      this.selection = created.map((node) => node.id)
      this.emit()
    })
  }

  join(): void {
    this.guard(() => {
      const nodes = selectedNodes(this.doc, this.selection)
      if (nodes.length !== 2) throw new Error('Select two open paths')
      const commands = joinOpenPaths(nodes[0], nodes[1])
      this.snapshot()
      nodes[0].commands = commands
      removeNode(this.doc, nodes[1].id)
      this.selection = [nodes[0].id]
      this.emit()
    })
  }

  closeSelected(): void {
    const node = this.one()
    if (!node) return
    this.snapshot()
    node.commands = closePath(node.commands)
    this.emit()
  }

  openSelected(): void {
    const node = this.one()
    if (!node) return
    this.snapshot()
    node.commands = openPath(node.commands)
    this.emit()
  }

  reverseSelected(): void {
    const node = this.one()
    if (!node) return
    this.snapshot()
    node.commands = reverseCommands(node.commands)
    if (node.text?.onPath) node.text.path = reverseCommands(node.text.path)
    this.emit()
  }

  outlineSelected(): void {
    const node = this.one()
    if (!node) return
    this.snapshot()
    const outlined = newPathFromCommands(node, outlineStroke(node), 'Outlined stroke')
    const fill = outlined.appearance.find((item) => item.kind === 'fill')
    if (fill && fill.kind === 'fill') fill.enabled = true
    this.addNode(outlined)
    this.emit()
  }

  placeTextOnPath(): void {
    const nodes = selectedNodes(this.doc, this.selection)
    const text = nodes.find((node) => node.kind === 'text')
    const path = nodes.find((node) => node.kind === 'path')
    if (!text?.text || !path) {
      this.banner = 'Select text and a path'
      this.emit()
      return
    }
    this.snapshot()
    text.text.onPath = true
    text.text.path = paperCommands(path)
    text.text.pathOffset = 0
    this.emit()
  }

  releaseText(): void {
    const node = this.one()
    if (!node?.text) return
    this.snapshot()
    node.text.onPath = false
    this.emit()
  }

  convertText(): void {
    const node = this.one()
    if (!node?.text) return
    this.snapshot()
    const width = Math.max(20, node.text.content.length * node.text.fontSize * 0.55)
    node.kind = 'path'
    node.commands = [
      cmd('M', 0, 0),
      cmd('L', width, 0),
      cmd('L', width, node.text.fontSize),
      cmd('L', 0, node.text.fontSize),
      cmd('Z'),
    ]
    node.name = 'Outlined text'
    this.emit()
  }

  setTextContent(content: string): void {
    const node = this.one()
    if (!node?.text) return
    this.snapshot()
    node.text.content = content
    this.emit()
  }

  selectSimilar(key: SimilarKey, scope: 'layer' | 'all'): void {
    const node = this.one()
    if (!node) return
    this.selection = selectSimilar(this.doc, node, key, scope)
    this.emit()
  }

  recolor(method: 'hue' | 'balance' | 'brightness', amount: number): void {
    const nodes = selectedNodes(this.doc, this.selection)
    if (!nodes.length) return
    this.snapshot()
    nodes.forEach((node) => recolorNode(node, method, amount))
    this.emit()
  }

  copyStyle(): void {
    const node = this.one()
    if (!node) return
    this.clipboard = structuredClone(node.appearance)
    this.emit()
  }

  pasteStyle(): void {
    this.guard(() => {
      if (!this.selection.length || !this.clipboard) throw new Error('Nothing selected')
      this.snapshot()
      selectedNodes(this.doc, this.selection).forEach((node) => applyStyle(node, this.clipboard!))
      this.emit()
    })
  }

  saveStyle(name: string): void {
    const node = this.one()
    if (!node) return
    this.doc.styles.push({ id: uid('s'), name, appearance: structuredClone(node.appearance) })
    this.emit()
  }

  applySavedStyle(id: string): void {
    const style = this.doc.styles.find((item) => item.id === id)
    if (!style) return
    this.clipboard = structuredClone(style.appearance)
    this.pasteStyle()
  }

  addAppearance(item: AppearanceItem): void {
    const node = this.one()
    if (!node) return
    if (node.appearance.length >= APPEARANCE_CAP) {
      this.banner = 'An object can have 12 appearance attributes'
      this.emit()
      return
    }
    this.snapshot()
    node.appearance.push(item)
    this.emit()
  }

  search(query: string): CatalogItem[] {
    return searchCatalog([...CATALOG, ...this.customLibrary], query)
  }

  placeSymbol(id: string, x = 48, y = 48): string {
    const item = [...CATALOG, ...this.customLibrary].find((entry) => entry.id === id)
    if (!item) throw new Error('Symbol not found')
    this.snapshot()
    const width = worldInchesToPaperPoints(item.worldWidth, this.doc.canvas.realInchesPerPoint)
    const height = worldInchesToPaperPoints(item.worldHeight, this.doc.canvas.realInchesPerPoint)
    const node = makePath(item.name, x, y, scaleCommands(item.commands, width / item.worldWidth, height / item.worldHeight))
    node.symbolId = item.id
    this.addNode(node)
    this.emit()
    return node.id
  }

  saveCustomLibrary(name: string): void {
    const node = this.one()
    if (!node) return
    const bounds = commandsBounds(node.commands)
    const inchesW = paperPointsToWorldInches(bounds.w, this.doc.canvas.realInchesPerPoint)
    const inchesH = paperPointsToWorldInches(bounds.h, this.doc.canvas.realInchesPerPoint)
    this.customLibrary.push({
      id: uid('sym'),
      name,
      category: 'Custom',
      tags: ['custom', name.toLowerCase()],
      aliases: [],
      worldWidth: Math.max(0.1, inchesW),
      worldHeight: Math.max(0.1, inchesH),
      commands: scaleCommands(node.commands, inchesW / (bounds.w || 1), inchesH / (bounds.h || 1)),
    })
    this.emit()
  }

  exportSvg(options?: Partial<ExportOptions>): string {
    return exportSvg(this.doc, {
      include: options?.include ?? 'canvas',
      scale: options?.scale ?? 1,
      selection: options?.selection ?? this.selection,
    })
  }

  async exportPdf(options?: Partial<ExportOptions>): Promise<Uint8Array> {
    return exportPdf(this.doc, {
      include: options?.include ?? 'canvas',
      scale: options?.scale ?? 1,
      selection: options?.selection ?? this.selection,
    })
  }

  exportForRaster(options: ExportOptions): { nodes: SceneNode[]; includeBackground: boolean } {
    if (options.include === 'selection' && options.selection.length === 0) {
      throw new Error('Select an object to export')
    }
    const nodes: SceneNode[] = []
    eachNode(this.doc, (node) => {
      if (!node.visible) return
      if (options.include !== 'canvas' && outsideCanvas(this.doc, node) && options.include === 'objects') return
      if (options.include === 'selection' && !options.selection.includes(node.id)) return
      nodes.push(node)
    })
    return { nodes, includeBackground: options.include === 'canvas' }
  }

  slices(): ReturnType<typeof sliceNodes> {
    return sliceNodes(this.doc)
  }

  serialize(): string {
    return JSON.stringify({ version: 1, document: this.doc } satisfies MeasuredFile)
  }

  loadText(text: string): void {
    this.guard(() => {
      let parsed: MeasuredFile
      try {
        parsed = JSON.parse(text) as MeasuredFile
      } catch {
        throw new Error('File is not a Measured document')
      }
      if (!parsed || parsed.version !== 1 || !parsed.document?.layers || !parsed.document.canvas) {
        throw new Error('File is not a Measured document')
      }
      this.snapshot()
      this.docs[this.active] = parsed.document
      this.selection = []
      this.emit()
    })
  }

  importPsd(bytes: Uint8Array): void {
    this.guard(() => {
      const size = importPsd(bytes)
      this.snapshot()
      const node = makeRect(0, 0, size.width, size.height)
      node.name = 'PSD image'
      node.imageWidth = size.width
      node.imageHeight = size.height
      this.addNode(node)
      this.emit()
    })
  }

  limitation(topic: string): string {
    return LIMITATIONS[topic] ?? 'This is not available in the browser.'
  }

  runPlugin(code: string): void {
    const api = {
      createRect: (x: number, y: number, w: number, h: number) => {
        this.snapshot()
        const node = makeRect(x, y, w, h)
        this.addNode(node)
        return node.id
      },
      setScale: (value: number) => this.setScale(value),
      placeSymbol: (id: string, x: number, y: number) => this.placeSymbol(id, x, y),
      getSelection: () => [...this.selection],
    }
    try {
      const fn = new Function('api', 'window', 'document', 'globalThis', `"use strict";\n${code}`)
      fn(api, undefined, undefined, undefined)
      this.banner = null
      this.emit()
    } catch (error) {
      this.banner = error instanceof Error ? error.message : 'Plugin failed'
      this.emit()
      throw error
    }
  }

  savePlugin(name: string, code: string): void {
    this.plugins.push({ id: uid('p'), name, code })
    this.emit()
  }

  deletePlugin(id: string): void {
    this.plugins = this.plugins.filter((plugin) => plugin.id !== id)
    this.emit()
  }

  seedRects(count: number): void {
    const layer = activeLayer(this.doc)
    for (let i = 0; i < count; i++) {
      layer.children.push(makeRect((i % 80) * 12, Math.floor(i / 80) * 12, 10, 8))
    }
    this.emit()
  }

  setNumber(field: 'width' | 'height' | 'x' | 'y', raw: string): void {
    this.guard(() => {
      const node = this.one()
      if (!node) throw new Error('Nothing selected')
      const inches = parseLength(raw, this.doc.canvas.realInchesPerPoint)
      const points = worldInchesToPaperPoints(inches, this.doc.canvas.realInchesPerPoint)
      this.snapshot()
      const bounds = commandsBounds(node.commands)
      if (field === 'x') node.x = points
      if (field === 'y') node.y = points
      if (field === 'width' && bounds.w > 0) node.commands = scaleCommands(node.commands, points / bounds.w, 1)
      if (field === 'height' && bounds.h > 0) node.commands = scaleCommands(node.commands, 1, points / bounds.h)
      this.emit()
    })
  }

  resizeArtwork(factor: number, scaleEffects: boolean): void {
    this.guard(() => {
      this.snapshot()
      resizeArtwork(this.doc, factor, scaleEffects)
      this.emit()
    })
  }

  resizeCanvas(side: 'left' | 'right' | 'top' | 'bottom', amount: number): void {
    this.guard(() => {
      this.snapshot()
      resizeCanvasSide(this.doc, side, amount)
      assertCanvasPixels(this.doc.canvas.width, this.doc.canvas.height)
      this.emit()
    })
  }

  key(key: string, mods: { shift?: boolean; alt?: boolean; meta?: boolean }): void {
    const lower = key.toLowerCase()
    if (lower === 'escape') this.cancel()
    if ((lower === 'z' && mods.meta && !mods.shift) || lower === 'undo') this.undo()
    if ((lower === 'z' && mods.meta && mods.shift) || lower === 'redo') this.redo()
    if (lower === 'enter') this.commitPen()
    if (lower === 'backspace' || lower === 'delete') this.deleteSelection()
    if (mods.alt && lower === 'n') this.newDocument('letter')
    if (mods.alt && lower === 'w') this.closeDocument()
    if (lower === ' ' ) this.spaceDown = true
    const tools: Record<string, Tool> = {
      v: 'select',
      a: 'pathSelect',
      p: 'pen',
      n: 'pencil',
      b: 'brush',
      l: 'line',
      r: 'rect',
      o: 'ellipse',
      t: 'text',
      h: 'hand',
      z: 'zoom',
    }
    if (!mods.meta && !mods.alt && tools[lower]) this.setTool(tools[lower])
    this.emit()
  }

  keyUp(key: string): void {
    if (key === ' ') this.spaceDown = false
  }

  commitPen(): void {
    if (this.pen.length < 2) return
    this.snapshot()
    this.addNode(makePath('Path', 0, 0, this.pen))
    this.pen = []
    this.preview = null
    this.emit()
  }

  deleteSelection(): void {
    if (!this.selection.length) return
    this.snapshot()
    for (const id of this.selection) {
      const node = findNode(this.doc, id)
      if (node?.locked) continue
      removeNode(this.doc, id)
    }
    this.selection = []
    this.emit()
  }

  convertAnchor(): void {
    const node = this.one()
    if (!node) return
    this.snapshot()
    node.commands = node.commands.map((command) =>
      command.c === 'L' ? { ...command, c: 'C', x1: command.x, y1: command.y, x2: command.x, y2: command.y } : command.c === 'C' ? { ...command, c: 'L' } : command,
    )
    this.emit()
  }

  slant(amount: number): void {
    const node = this.one()
    if (!node) return
    this.snapshot()
    node.commands = node.commands.map((command) => ({ ...command, x: command.x + command.y * amount, x1: command.x1 + command.y1 * amount, x2: command.x2 + command.y2 * amount }))
    this.emit()
  }

  scaleSelection(factor: number): void {
    const nodes = selectedNodes(this.doc, this.selection)
    if (!nodes.length) return
    this.snapshot()
    for (const node of nodes) node.commands = scaleCommands(node.commands, factor, factor)
    this.emit()
  }

  rotateSelection(radians: number): void {
    const nodes = selectedNodes(this.doc, this.selection)
    if (!nodes.length) return
    this.snapshot()
    for (const node of nodes) node.rotation += radians
    this.emit()
  }

  setPattern(id: string): void {
    const node = this.one()
    if (!node) return
    this.snapshot()
    const fill = node.appearance.find((item) => item.kind === 'fill')
    if (fill && fill.kind === 'fill') {
      fill.enabled = true
      fill.patternId = id
    }
    this.emit()
  }

  setGradient(): void {
    const node = this.one()
    if (!node) return
    this.snapshot()
    const fill = node.appearance.find((item) => item.kind === 'fill')
    if (fill && fill.kind === 'fill') {
      fill.enabled = true
      fill.gradient = {
        kind: 'linear',
        x1: 0,
        y1: 0,
        x2: 80,
        y2: 0,
        stops: [
          { offset: 0, color: rgb(30, 64, 120, 1) },
          { offset: 1, color: rgb(180, 210, 180, 1) },
        ],
      }
    }
    this.emit()
  }

  setImage(id: string, href: string, width: number, height: number): void {
    this.snapshot()
    this.doc.images[id] = href
    const node = makeRect(48, 48, width, height)
    node.kind = 'image'
    node.imageId = id
    node.imageWidth = width
    node.imageHeight = height
    node.name = 'Image'
    this.addNode(node)
    this.emit()
  }

  setLabel(kind: NonNullable<SceneNode['label']>['kind'], text = ''): void {
    const node = this.one()
    if (!node) return
    this.snapshot()
    node.label = {
      kind,
      text,
      offset: 12,
      align: 'centered',
      showUnits: true,
      precision: structuredClone(this.doc.canvas.precision),
    }
    this.emit()
  }

  labelText(node: SceneNode): string {
    if (!node.label) return ''
    if (node.label.kind === 'text') return node.label.text
    const box = paperBounds(node)
    const length = node.dimension ? Math.hypot(node.dimension.x2 - node.dimension.x1, node.dimension.y2 - node.dimension.y1) : nodeLength(node)
    const measure =
      node.label.kind === 'width' ? box.w : node.label.kind === 'height' ? box.h : node.label.kind === 'area' ? 0 : length
    if (node.label.kind === 'area') {
      const area = paperPointsToWorldInches(box.w, this.doc.canvas.realInchesPerPoint) * paperPointsToWorldInches(box.h, this.doc.canvas.realInchesPerPoint)
      return `${area.toFixed(2)} sq in`
    }
    return this.formatPoints(measure)
  }

  enableEffect(kind: 'dropShadow' | 'innerShadow' | 'outerGlow' | 'innerGlow' | 'blur'): void {
    const node = this.one()
    if (!node) return
    this.snapshot()
    const effect = node.appearance.find((item) => item.kind === kind)
    if (effect) effect.enabled = true
    this.emit()
  }

  setBlend(mode: Doc['layers'][number]['blendMode']): void {
    const node = this.one()
    if (!node) return
    this.snapshot()
    node.blendMode = mode
    this.emit()
  }

  clipSelection(): void {
    const nodes = selectedNodes(this.doc, this.selection)
    if (nodes.length < 2) return
    this.snapshot()
    const clip = nodes[0]
    const group = makePath('Clip', 0, 0, clip.commands)
    group.kind = 'group'
    group.clip = true
    group.x = clip.x
    group.y = clip.y
    group.children = nodes.slice(1).map((node) => ({ ...structuredClone(node), x: node.x - clip.x, y: node.y - clip.y }))
    nodes.forEach((node) => removeNode(this.doc, node.id))
    this.addNode(group)
    this.emit()
  }

  seedPaintError(): void {
    const node = makeRect(10, 10, 20, 20)
    node.paintError = true
    node.name = 'Bad paint'
    activeLayer(this.doc).children.push(node)
    this.emit()
  }

  private one(): SceneNode | undefined {
    return this.selection.length ? findNode(this.doc, this.selection[0]) : undefined
  }
}

function paperCommands(node: SceneNode): SceneNode['commands'] {
  return node.commands.map((command) => {
    const point = localToPaper(node, { x: command.x, y: command.y })
    const c1 = localToPaper(node, { x: command.x1, y: command.y1 })
    const c2 = localToPaper(node, { x: command.x2, y: command.y2 })
    return { ...command, x: point.x, y: point.y, x1: c1.x, y1: c1.y, x2: c2.x, y2: c2.y }
  })
}

export function psdBytes(width = 2, height = 2): Uint8Array {
  const rgba = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < width * height; i++) {
    rgba[i * 4] = 20
    rgba[i * 4 + 1] = 40
    rgba[i * 4 + 2] = 80
    rgba[i * 4 + 3] = 255
  }
  return exportPsd(width, height, rgba)
}

export { exportTiff, importPsd, looksLikePsd, requireNode, cssOf }
