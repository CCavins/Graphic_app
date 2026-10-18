import { CATALOG, loadCatalog, searchCatalog, type CatalogItem } from '../catalog/catalog'
import { booleanCommands, newPathFromCommands, outlineStroke, type BooleanOp } from '../model/boolean'
import { fromHex, rgb, toHex, type AdjustMethod } from '../model/color'
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
  type NewDocumentOptions,
} from '../model/factory'
import {
  cmd,
  commandsBounds,
  hitNode,
  localBounds,
  localToPaper,
  orientedCorners,
  paperBounds,
  paperToLocal,
  pivotOf,
  reverseCommands,
  scaleCommands,
  smoothCommands,
  translateCommands,
} from '../model/geometry'
import { labelText as labelTextFor, makeLabel, nodeLabels } from '../model/labels'
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
import { svgToCommands } from '../model/svg'
import {
  addAnchor,
  compoundCommands,
  corridor,
  disconnectAt,
  IDENTITY_STEP,
  moveAnchor,
  nearestAnchor,
  nodesInRect,
  paperCommands,
  rotateNode,
  scaleLocal,
  separateContours,
  splitPath,
  symbolStrokeWidth,
  transformNodes,
  trimOpenPath,
} from '../model/transform'
import type {
  AppearanceItem,
  BaseUnit,
  Brush,
  CanvasSettings,
  Cmd,
  Color,
  Doc,
  EffectAttr,
  EffectKind,
  FillAttr,
  Gradient,
  GridSettings,
  LabelKind,
  LabelUnit,
  MeasuredFile,
  ObjectLabel,
  Pt,
  Rect,
  SceneNode,
  StrokeAttr,
  TextData,
  TextSpan,
  TransformStep,
  WorkspaceFile,
} from '../model/types'
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
import { TOOL_KEYS } from '../input/shortcuts'
import { defaultLabelUnit } from '../model/factory'
import { labelUnitForScale, ratioFromInchesPerPoint, realInchesPerPointFor, restateScale, unitSystem, type ScaleStatement } from '../model/scale'

export type Tool =
  | 'select'
  | 'pathSelect'
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
  | 'eraser'
  | 'scissors'
  | 'addAnchor'
  | 'gradient'
  | 'hand'
  | 'zoom'

export type DashPreset = 'solid' | 'dotted' | 'dashed'
export type LineMode = 'plain' | 'arrow' | 'dimension'
export type ArcMode = 'open' | 'pie' | 'chord'

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

export interface CustomLibrary {
  id: string
  name: string
  color: string
  items: CatalogItem[]
}

interface DragOrigin {
  id: string
  x: number
  y: number
  rotation: number
  commands: SceneNode['commands']
  shade?: SceneNode['shade']
  ink?: SceneNode['ink']
  /** Groups keep a copy of their children so a resize can be recomputed from the press each move. */
  children?: SceneNode[]
  dimension?: SceneNode['dimension']
  text?: SceneNode['text']
}

interface Drag {
  kind: 'create' | 'move' | 'handle' | 'pan' | 'pen' | 'pencil' | 'pinch' | 'zoom' | 'marquee' | 'gradient' | 'eraser' | 'anchor' | 'guide'
  start: Pt
  origin: Pt
  ids: string[]
  origins: DragOrigin[]
  handle?: string
  /** Paper-space pivot for rotate handles and the union box for multi-object resizes, captured at press. */
  pivot?: Pt
  box?: Rect
  moved: boolean
  pointerId: number
  duplicated?: boolean
  /** The objects an Option-drag copied from, so an unmoved copy can be taken back. */
  sourceIds?: string[]
  axis?: 'h' | 'v'
  anchorIndex?: number
}

export const RULER_SIZE = 20

export const DASHES: Record<DashPreset, number[]> = { solid: [], dotted: [1, 4], dashed: [8, 6] }

export const LIMITATIONS: Record<string, string> = {
  eps: 'EPS and Illustrator import are not available in the browser. Export SVG from the other app and open that.',
  icloud: 'iCloud is not available on this site. Download the .measured file instead.',
  handoff: 'Handoff is not available on this site. Open this page on the other device and load the file.',
  dropbox: 'Dropbox is not available on this site. Download or upload a .measured file.',
  quicklook: 'Quick Look is a macOS Finder feature and is not available in the browser.',
  'cmyk-pdf': 'PDF export is RGB. CMYK values are stored and shown as RGB on screen.',
  'core-graphics': 'Copy as SVG or CSS. Core Graphics source is not available in the browser.',
  psd: 'PSD export is a flattened RGB composite. PSD import places a frame at the image size.',
  'pdf-import': 'PDF import places a page-sized frame. The browser cannot rasterize PDF pages without a plug-in.',
  shortcut: 'Command-W and Command-T are reserved by the browser. Use Alt-N for a new document and Alt-W to close one.',
}

export class Editor {
  docs: Doc[]
  active = 0
  selection: string[] = []
  tool: Tool = 'select'
  lineMode: LineMode = 'plain'
  dashPreset: DashPreset = 'solid'
  arcMode: ArcMode = 'open'
  view: ViewState = { zoom: 1, panX: 48, panY: 48 }
  readout = ''
  banner: string | null = null
  preview: SceneNode | null = null
  gaps: GapLine[] = []
  smartLines: GapLine[] = []
  marquee: Rect | null = null
  pen: SceneNode['commands'] = []
  private stroke: Pt[] = []
  private strokePressure: number[] = []
  polygonSides = 5
  starPoints = 5
  starInnerRadius = 0.4
  cornerRadius = 12
  eraserWidth = 12
  brushSettings: Brush = { diameter: 12, angle: 35, roundness: 0.45, minWidth: 0.2 }
  paint: { fill: Color; stroke: Color; strokeWidth: number } = { fill: rgb(30, 64, 120, 1), stroke: rgb(20, 32, 48, 1), strokeWidth: 1 }
  textDefaults: { fontFamily: string; fontStyle: string; fontSize: number; align: TextData['align'] } = { fontFamily: 'Georgia, serif', fontStyle: 'normal', fontSize: 18, align: 'left' }
  touchMods = { constrain: false, fromCenter: false, duplicate: false }
  spaceDown = false
  context: { x: number; y: number; kind: 'canvas' | 'ruler'; axis?: 'h' | 'v' } | null = null
  loupe = false
  editingTextId: string | null = null
  textSelection: { start: number; end: number } = { start: 0, end: 0 }
  anchor: { id: string; index: number } | null = null
  lastPointer: PointerInput | null = null
  /** Size of the canvas in CSS pixels, kept current by the app so placements can target the visible area. */
  viewport: { width: number; height: number } | null = null
  private placeCount = 0
  private textUndoArmed = false
  private lastTextClick = { time: 0, id: '' }
  customLibraries: CustomLibrary[] = []
  plugins: { id: string; name: string; code: string }[] = []
  clipboard: AppearanceItem[] | null = null
  clipboardNodes: SceneNode[] | null = null
  lastStep: TransformStep | null = null
  /** Asked before a document with content is closed; the app wires this to a confirm dialog. */
  confirmClose: (name: string) => boolean = () => true
  private recolorBase: Map<string, SceneNode> | null = null
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

  /** Flat view of every custom library item, kept for older callers. */
  get customLibrary(): CatalogItem[] {
    return this.customLibraries.flatMap((library) => library.items)
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

  /** Paper point at the middle of the visible canvas (or of the page when the viewport is unknown). */
  viewCenter(): Pt {
    if (this.viewport) return this.toPaper({ cx: this.viewport.width / 2, cy: this.viewport.height / 2 })
    return { x: this.doc.canvas.width / 2, y: this.doc.canvas.height / 2 }
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
    this.selection = this.selection.filter((id) => findNode(this.doc, id))
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
    this.selection = this.selection.filter((id) => findNode(this.doc, id))
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

  /** Snapshot and add a freshly drawn node, checking the lock first so a refused draw leaves no dead undo step. */
  private place(node: SceneNode): void {
    if (activeLayer(this.doc).locked) throw new Error('The active layer is locked. Unlock it in the Layers pane to draw on it.')
    this.snapshot()
    this.addNode(node)
  }

  /** Apply the toolbar paint (color wells, dash) to a freshly drawn shape. */
  private paintNew(node: SceneNode): SceneNode {
    const fill = node.appearance.find((item): item is FillAttr => item.kind === 'fill')
    const stroke = node.appearance.find((item): item is StrokeAttr => item.kind === 'stroke')
    if (fill && fill.enabled) fill.color = structuredClone(this.paint.fill)
    if (stroke) {
      stroke.color = structuredClone(this.paint.stroke)
      stroke.width = this.paint.strokeWidth
      stroke.dash = [...DASHES[this.dashPreset]]
    }
    return node
  }

  setTool(tool: Tool): void {
    // An unfinished pen path is kept, not thrown away, when the user moves on.
    if (this.pen.length >= 2) this.commitPen()
    this.tool = tool
    this.preview = null
    this.pen = []
    this.stroke = []
    this.strokePressure = []
    this.editingTextId = null
    this.textUndoArmed = false
    this.anchor = null
    this.marquee = null
    this.emit()
  }

  setSnap(worldInches: number | null): void {
    const enabled = worldInches != null && worldInches > 0
    this.doc.canvas.grid.snap = enabled
    this.doc.canvas.grid.snapWorldInches = enabled ? worldInches : null
    this.emit()
  }

  formatPoints(points: number): string {
    const inches = paperPointsToWorldInches(points, this.doc.canvas.realInchesPerPoint)
    return formatWorldLength(inches, this.doc.canvas.labelUnit, this.doc.canvas.precision, this.doc.canvas.showUnits)
  }

  /** Number of paper points for a typed length such as "2 in" or "12' 6"". */
  pointsFor(raw: string): number {
    const inches = parseLength(raw, this.doc.canvas.realInchesPerPoint)
    return worldInchesToPaperPoints(inches, this.doc.canvas.realInchesPerPoint)
  }

  private constrain(pointer: PointerInput): boolean {
    return pointer.shift || this.touchMods.constrain
  }

  private fromCenter(pointer: PointerInput): boolean {
    return pointer.alt || this.touchMods.fromCenter
  }

  private snapStep(): number {
    const grid = this.doc.canvas.grid
    if (!grid.snap) return 0
    if (grid.snapWorldInches && grid.snapWorldInches > 0) {
      return worldInchesToPaperPoints(grid.snapWorldInches, this.doc.canvas.realInchesPerPoint)
    }
    return grid.spacingX > 0 ? grid.spacingX : 0
  }

  private snapped(paper: Pt, pointer: PointerInput): Pt {
    let next = { ...paper }
    const grid = this.doc.canvas.grid
    const step = this.snapStep()
    if (step > 0) {
      next = {
        x: Math.round(next.x / step) * step,
        y: Math.round(next.y / step) * step,
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

  private inRuler(pointer: Pick<PointerInput, 'cx' | 'cy'>): 'h' | 'v' | null {
    if (!this.doc.canvas.showRulers) return null
    if (pointer.cy < RULER_SIZE) return 'h'
    if (pointer.cx < RULER_SIZE) return 'v'
    return null
  }

  pointerDown(pointer: PointerInput): void {
    this.lastPointer = pointer
    this.pointers.set(pointer.pointerId, pointer)
    this.context = null
    const ruler = this.inRuler(pointer)
    if (pointer.button === 2) {
      if (!ruler) {
        const hit = this.hit(this.toPaper(pointer), pointer)
        if (hit && !this.selection.includes(hit.id)) this.selection = [hit.id]
      }
      this.context = ruler ? { x: pointer.cx, y: pointer.cy, kind: 'ruler', axis: ruler } : { x: pointer.cx, y: pointer.cy, kind: 'canvas' }
      this.emit()
      return
    }
    if (ruler) {
      this.drag = { kind: 'guide', axis: ruler, start: { x: pointer.cx, y: pointer.cy }, origin: this.toPaper(pointer), ids: [], origins: [], moved: false, pointerId: pointer.pointerId }
      return
    }
    if (this.pointers.size >= 2) {
      this.preview = null
      this.marquee = null
      this.drag = { kind: 'pinch', start: this.toPaper(pointer), origin: { ...this.toPaper(pointer) }, ids: [], origins: [], moved: false, pointerId: pointer.pointerId }
      this.readout = ''
      this.emit()
      return
    }
    if (pointer.button === 1 || this.spaceDown || this.tool === 'hand') {
      this.drag = { kind: 'pan', start: { x: pointer.cx, y: pointer.cy }, origin: { x: this.view.panX, y: this.view.panY }, ids: [], origins: [], moved: false, pointerId: pointer.pointerId }
      return
    }
    const raw = this.toPaper(pointer)
    if (this.tool === 'text') {
      const textHit = this.hit(raw, pointer, true)
      if (textHit?.kind === 'text') {
        this.editText(textHit.id)
        return
      }
      this.stopTextEdit()
    }
    const paper = this.snapped(raw, pointer)
    if (this.tool === 'scissors' || this.tool === 'addAnchor') {
      const target = this.selectedPathOrHit(raw, pointer)
      if (target) {
        if (this.tool === 'scissors') this.scissorsAt(target.id, raw)
        else this.addAnchorAt(target.id, raw)
      } else {
        this.banner = this.tool === 'scissors' ? 'Click on the outline of a shape to cut it there.' : 'Click on the outline of a shape to add an anchor point there.'
        this.emit()
      }
      return
    }
    if (this.tool === 'eraser') {
      this.stroke = [paper]
      this.drag = { kind: 'eraser', start: paper, origin: paper, ids: [], origins: [], moved: false, pointerId: pointer.pointerId }
      return
    }
    if (this.tool === 'gradient') {
      const node = this.one() ?? this.hit(raw, pointer)
      if (!node) {
        this.banner = 'Select a shape, then drag across it to set the gradient direction.'
        this.emit()
        return
      }
      this.selection = [node.id]
      this.drag = { kind: 'gradient', start: paper, origin: paper, ids: [node.id], origins: [], moved: false, pointerId: pointer.pointerId }
      this.emit()
      return
    }
    if (this.tool === 'pathSelect') {
      const node = this.one()
      if (node && node.kind === 'path') {
        const index = nearestAnchor(node, raw, this.hitSlop(pointer.type) / this.view.zoom)
        if (index != null) {
          this.anchor = { id: node.id, index }
          this.drag = { kind: 'anchor', anchorIndex: index, start: paper, origin: paper, ids: [node.id], origins: this.captureOrigins(), moved: false, pointerId: pointer.pointerId }
          this.emit()
          return
        }
      }
    }
    if (this.tool === 'select' || this.tool === 'pathSelect') {
      // A lone dimension line has no resize handles: pressing on it moves it.
      const loneDimension = this.selection.length === 1 && this.one()?.kind === 'dimension'
      const handle = loneDimension ? null : this.hitHandle(paper, pointer.type)
      if (handle && this.selection.length) {
        const sourceIds = [...this.selection]
        const duplicated = pointer.alt || this.touchMods.duplicate
        if (duplicated) this.duplicateSelection(0, 0, false)
        const frame = this.selectionFrame()!
        const pivot = {
          x: (frame.corners[0].x + frame.corners[2].x) / 2,
          y: (frame.corners[0].y + frame.corners[2].y) / 2,
        }
        this.drag = {
          kind: 'handle',
          handle,
          start: paper,
          origin: paper,
          ids: [...this.selection],
          origins: this.captureOrigins(),
          pivot,
          box: selectionBounds(this.doc, this.selection),
          moved: false,
          pointerId: pointer.pointerId,
          duplicated,
          sourceIds,
        }
        this.loupe = pointer.type === 'touch'
        return
      }
      const hit = this.hit(paper, pointer)
      if (hit?.kind === 'text' && this.tool === 'select') {
        const now = Date.now()
        if (this.lastTextClick.id === hit.id && now - this.lastTextClick.time < 500) {
          this.editText(hit.id)
          this.lastTextClick = { time: 0, id: '' }
          return
        }
        this.lastTextClick = { time: now, id: hit.id }
      }
      if (hit) {
        if (pointer.shift) {
          this.selection = this.selection.includes(hit.id) ? this.selection.filter((id) => id !== hit.id) : [...this.selection, hit.id]
        } else if (!this.selection.includes(hit.id)) this.selection = [hit.id]
        this.activateLayerOf(hit.id)
        const duplicated = pointer.alt || this.touchMods.duplicate
        const sourceIds = [...this.selection]
        if (duplicated) this.duplicateSelection(0, 0, false)
        this.drag = { kind: 'move', start: paper, origin: paper, ids: [...this.selection], origins: this.captureOrigins(), moved: false, pointerId: pointer.pointerId, duplicated, sourceIds }
      } else {
        if (!pointer.shift) this.selection = []
        this.anchor = null
        this.drag = { kind: 'marquee', start: raw, origin: raw, ids: pointer.shift ? [...this.selection] : [], origins: [], moved: false, pointerId: pointer.pointerId }
      }
      this.emit()
      return
    }
    if (this.tool === 'pen') {
      this.drag = { kind: 'pen', start: paper, origin: paper, ids: [], origins: [], moved: false, pointerId: pointer.pointerId }
      const last = this.pen[this.pen.length - 1]
      this.stroke = last ? [{ x: last.x, y: last.y }, paper] : [paper]
      this.strokePressure = []
      return
    }
    if (this.tool === 'zoom') {
      this.zoomAt(pointer.alt ? 1 / 1.25 : 1.25, paper)
      return
    }
    const freehand = this.tool === 'pencil' || this.tool === 'brush'
    this.drag = { kind: freehand ? 'pencil' : 'create', start: paper, origin: paper, ids: [], origins: [], moved: false, pointerId: pointer.pointerId }
    if (freehand) {
      this.stroke = []
      this.strokePressure = []
      this.rememberSample(paper, pointer.pressure)
    }
  }

  pointerMove(pointer: PointerInput, emit = true): void {
    this.lastPointer = pointer
    this.pointers.set(pointer.pointerId, pointer)
    if (!this.drag) {
      if (this.tool === 'pen' && this.pen.length && emit) {
        const hover = this.snapped(this.toPaper(pointer), pointer)
        this.preview = makePath('Pen', 0, 0, [...this.pen, cmd('L', hover.x, hover.y)])
        this.emit()
      }
      return
    }
    if (this.drag.pointerId !== pointer.pointerId && this.drag.kind !== 'pinch') return
    const raw = this.toPaper(pointer)
    const freeKinds: Drag['kind'][] = ['pencil', 'pen', 'eraser', 'marquee']
    const paper = freeKinds.includes(this.drag.kind) ? raw : this.snapped(raw, pointer)
    const threshold = pointer.type === 'touch' ? 10 : 3
    const clientDelta = Math.hypot(pointer.cx - this.toClient(this.drag.start).x, pointer.cy - this.toClient(this.drag.start).y)
    if (this.drag.kind === 'pan') {
      this.view.panX = this.drag.origin.x + (pointer.cx - this.drag.start.x)
      this.view.panY = this.drag.origin.y + (pointer.cy - this.drag.start.y)
      this.emit()
      return
    }
    if (this.drag.kind === 'guide') {
      this.drag.moved = true
      this.preview = null
      this.readout = this.drag.axis === 'h' ? this.formatPoints(raw.y) : this.formatPoints(raw.x)
      this.marquee = this.drag.axis === 'h' ? { x: -1e6, y: raw.y, w: 2e6, h: 0 } : { x: raw.x, y: -1e6, w: 0, h: 2e6 }
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
    if (this.drag.kind === 'marquee') {
      this.marquee = { x: this.drag.start.x, y: this.drag.start.y, w: raw.x - this.drag.start.x, h: raw.y - this.drag.start.y }
      const ids = nodesInRect(this.doc, this.marquee, pointer.alt || this.touchMods.fromCenter)
      this.selection = [...new Set([...this.drag.ids, ...ids])]
      this.readout = `${this.formatPoints(Math.abs(this.marquee.w))} × ${this.formatPoints(Math.abs(this.marquee.h))}`
      if (emit) this.emit()
      return
    }
    if (this.drag.kind === 'gradient') {
      const node = findNode(this.doc, this.drag.ids[0])
      if (node) {
        const a = paperToLocal(node, this.drag.start)
        const b = paperToLocal(node, paper)
        this.applyGradientHandles(node, a, b)
      }
      if (emit) this.emit()
      return
    }
    if (this.drag.kind === 'eraser') {
      this.stroke.push(raw)
      this.preview = makePath('Eraser', 0, 0, this.stroke.map((p, i) => cmd(i === 0 ? 'M' : 'L', p.x, p.y)))
      const stroke = this.preview.appearance.find((item): item is StrokeAttr => item.kind === 'stroke')
      if (stroke) {
        stroke.width = this.eraserWidth
        stroke.color = rgb(220, 80, 80, 0.6)
      }
      const fill = this.preview.appearance.find((item) => item.kind === 'fill')
      if (fill) fill.enabled = false
      if (emit) this.emit()
      return
    }
    if (this.drag.kind === 'anchor') {
      const node = findNode(this.doc, this.drag.ids[0])
      const origin = this.drag.origins[0]
      if (node && origin && this.drag.anchorIndex != null) {
        const a = paperToLocal({ ...node, commands: origin.commands }, this.drag.start)
        const b = paperToLocal({ ...node, commands: origin.commands }, paper)
        node.commands = moveAnchor(origin.commands, this.drag.anchorIndex, b.x - a.x, b.y - a.y)
      }
      if (emit) this.emit()
      return
    }
    if (this.drag.kind === 'handle') {
      this.applyHandle(paper, this.constrain(pointer))
      return
    }
    if (this.drag.kind === 'move') {
      this.applyMove(paper)
      return
    }
    if (this.drag.kind === 'pencil' || this.drag.kind === 'pen') {
      this.rememberSample(paper, pointer.pressure)
      if (this.stroke.length >= 2) this.preview = this.freehandNode()
      if (emit) this.emit()
      return
    }
    this.preview = this.shapeFromDrag(this.drag.start, paper, pointer)
    const bounds = this.preview.dimension
      ? { w: Math.abs(this.preview.dimension.x2 - this.preview.dimension.x1), h: Math.abs(this.preview.dimension.y2 - this.preview.dimension.y1) }
      : commandsBounds(this.preview.commands)
    if (this.tool === 'line') {
      // A line is better described by its length and direction than by its bounding box.
      const dx = paper.x - this.drag.start.x
      const dy = paper.y - this.drag.start.y
      const angle = Math.round((((-Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360) * 10) / 10
      this.readout = `${this.formatPoints(Math.hypot(dx, dy))} · ${angle}°`
    } else {
      this.readout = `${this.formatPoints(bounds.w)} × ${this.formatPoints(bounds.h)}`
    }
    this.gaps = this.measureGaps(this.preview)
    if (emit) {
      this.loupe = pointer.type === 'touch'
      this.emit()
    }
  }

  pointerUp(pointer: PointerInput): void {
    try {
      this.finishPointer(pointer)
    } catch (error) {
      // A refused draw (for example on a locked layer) ends the gesture and explains itself instead of throwing.
      this.preview = null
      this.stroke = []
      this.strokePressure = []
      this.pen = []
      this.readout = ''
      this.gaps = []
      this.banner = error instanceof Error ? error.message : 'Something went wrong'
      this.emit()
    }
  }

  private finishPointer(pointer: PointerInput): void {
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
    if (drag.kind === 'guide') {
      this.marquee = null
      this.readout = ''
      if (drag.moved && !this.inRuler(pointer)) {
        const paper = this.toPaper(pointer)
        this.addGuide(drag.axis ?? 'h', drag.axis === 'h' ? paper.y : paper.x)
      }
      this.emit()
      return
    }
    if (drag.kind === 'marquee') {
      this.marquee = null
      this.readout = ''
      this.emit()
      return
    }
    if (drag.kind === 'gradient') {
      if (drag.moved) this.snapshotAfterPlain(drag)
      this.emit()
      return
    }
    if (drag.kind === 'anchor') {
      if (drag.moved) this.snapshotAfter(drag)
      this.emit()
      return
    }
    if (drag.kind === 'eraser') {
      this.preview = null
      if (this.stroke.length >= 1) this.eraseAlong(this.stroke)
      this.stroke = []
      this.emit()
      return
    }
    if (drag.kind === 'pen') {
      this.finishPen(drag, pointer)
      return
    }
    if (drag.kind === 'pencil') {
      if (this.stroke.length >= 2) this.place(this.paintNew(this.freehandNode()))
      this.preview = null
      this.stroke = []
      this.strokePressure = []
      this.readout = ''
      this.emit()
      return
    }
    if (drag.kind === 'create' && !drag.moved) {
      const paper = this.snapped(this.toPaper(pointer), pointer)
      const distance = Math.hypot(paper.x - drag.start.x, paper.y - drag.start.y)
      const threshold = pointer.type === 'touch' ? 10 : 3
      if (distance >= threshold) {
        drag.moved = true
        this.preview = this.shapeFromDrag(drag.start, paper, pointer)
      } else if (this.tool === 'text') {
        drag.moved = true
        this.preview = this.shapeFromDrag(drag.start, drag.start, pointer)
      }
    }
    if (drag.kind === 'create') {
      if (!drag.moved || !this.preview) {
        this.preview = null
        this.readout = ''
        this.emit()
        return
      }
      this.place(this.tool === 'text' ? this.preview : this.paintNew(this.preview))
      if (this.tool === 'text') {
        this.editText(this.selection[0])
        // Typing into a box that was just made belongs to the same undo step as making it.
        this.textUndoArmed = true
      }
      this.preview = null
      this.pen = []
    }
    if (drag.kind === 'move' || drag.kind === 'handle') {
      if (drag.moved) {
        this.snapshotAfter(drag)
        if (drag.kind === 'move' && drag.duplicated) {
          const first = drag.origins[0]
          const node = first ? findNode(this.doc, first.id) : undefined
          if (node && first) this.lastStep = { ...IDENTITY_STEP, dx: node.x - first.x, dy: node.y - first.y }
        }
      } else if (drag.duplicated) {
        // An Option-click without a drag made copies that never moved: take them back and keep the originals selected.
        for (const id of drag.ids) removeNode(this.doc, id)
        this.selection = drag.sourceIds ?? []
      }
    }
    this.gaps = []
    this.smartLines = []
    this.readout = ''
    this.emit()
  }

  cancel(): void {
    // Escape finishes a pen path in progress rather than discarding it, as in other vector editors.
    if (this.pen.length >= 2 && !this.drag) this.commitPen()
    this.preview = null
    this.drag = null
    this.pen = []
    this.stroke = []
    this.strokePressure = []
    this.readout = ''
    this.gaps = []
    this.smartLines = []
    this.marquee = null
    this.context = null
    this.emit()
  }

  private rememberSample(paper: Pt, pressure: number): void {
    const last = this.stroke[this.stroke.length - 1]
    if (last) {
      const from = this.toClient(last)
      const to = this.toClient(paper)
      if (Math.hypot(from.x - to.x, from.y - to.y) < 1.25) return
    }
    this.stroke.push({ x: paper.x, y: paper.y })
    this.strokePressure.push(pressure || 0.5)
  }

  private freehandNode(): SceneNode {
    const node = makePath(this.tool === 'brush' ? 'Brush' : this.tool === 'pen' ? 'Pen' : 'Pencil', 0, 0, smoothCommands(this.stroke))
    const fill = node.appearance.find((item) => item.kind === 'fill')
    if (fill && fill.kind === 'fill') fill.enabled = false
    if (this.tool === 'brush') {
      const average = this.strokePressure.reduce((sum, value) => sum + value, 0) / (this.strokePressure.length || 1)
      const stroke = node.appearance.find((item) => item.kind === 'stroke')
      if (stroke && stroke.kind === 'stroke') {
        const b = this.brushSettings
        stroke.width = Math.max(b.minWidth * b.diameter, b.diameter * (0.4 + average * 0.8))
        stroke.brush = { ...b }
      }
      node.pressures = [...this.strokePressure]
    }
    return node
  }

  private finishPen(drag: Drag, pointer: PointerInput): void {
    const end = this.snapped(this.toPaper(pointer), pointer)
    const travel = Math.hypot(end.x - drag.start.x, end.y - drag.start.y)
    const drawn = drag.moved && this.stroke.length >= 4 && travel >= 6
    if (!drawn) {
      const point = drag.start
      const last = this.pen[this.pen.length - 1]
      if (!last) this.pen = [cmd('M', point.x, point.y)]
      else if (last.x !== point.x || last.y !== point.y) this.pen.push(cmd('L', point.x, point.y))
      this.preview = makePath('Pen', 0, 0, this.pen)
      this.stroke = []
      this.emit()
      return
    }
    this.place(this.paintNew(this.freehandNode()))
    this.preview = null
    this.pen = []
    this.stroke = []
    this.strokePressure = []
    this.emit()
  }

  /**
   * Record the state before a drag as one undo step. For an Option-drag the "before" is the document without
   * the copies, so a single Undo removes the duplicate instead of only sliding it back onto the original.
   */
  private snapshotAfter(drag: Drag): void {
    const current = structuredClone(this.doc)
    if (drag.duplicated) {
      for (const id of drag.ids) removeNode(current, id)
    } else {
      drag.origins.forEach((origin) => {
        const node = findNode(current, origin.id)
        if (!node) return
        node.x = origin.x
        node.y = origin.y
        node.rotation = origin.rotation
        node.commands = structuredClone(origin.commands)
        node.shade = origin.shade ? structuredClone(origin.shade) : undefined
        node.ink = origin.ink ? structuredClone(origin.ink) : undefined
      })
    }
    const past = this.past[this.active]
    past.push(current)
    if (past.length > HISTORY_CAP) past.shift()
    this.future[this.active] = []
  }

  private snapshotAfterPlain(_drag: Drag): void {
    const past = this.past[this.active]
    past.push(structuredClone(this.doc))
    if (past.length > HISTORY_CAP) past.shift()
    this.future[this.active] = []
  }

  private captureOrigins(): Drag['origins'] {
    return this.selection.flatMap((id) => {
      const node = findNode(this.doc, id)
      if (!node) return []
      return [
        {
          id,
          x: node.x,
          y: node.y,
          rotation: node.rotation,
          commands: structuredClone(node.commands),
          shade: node.shade ? structuredClone(node.shade) : undefined,
          ink: node.ink ? structuredClone(node.ink) : undefined,
          children: node.kind === 'group' ? structuredClone(node.children) : undefined,
          dimension: node.dimension ? { ...node.dimension } : undefined,
          text: node.text ? { ...node.text } : undefined,
        },
      ]
    })
  }

  /** Put a node back to how it was at the press so a handle drag is recomputed from scratch each move. */
  private restoreOrigin(node: SceneNode, origin: DragOrigin): void {
    node.x = origin.x
    node.y = origin.y
    node.rotation = origin.rotation
    node.commands = structuredClone(origin.commands)
    node.shade = origin.shade ? structuredClone(origin.shade) : undefined
    node.ink = origin.ink ? structuredClone(origin.ink) : undefined
    if (origin.children) node.children = structuredClone(origin.children)
    if (origin.dimension) node.dimension = { ...origin.dimension }
    if (origin.text && node.text) Object.assign(node.text, { fontSize: origin.text.fontSize, fieldWidth: origin.text.fieldWidth })
  }

  /**
   * The selection frame drawn on the canvas. A single rotated object shows its own box turned with it;
   * groups, dimensions, and multiple objects show the axis-aligned union.
   */
  selectionFrame(): { corners: [Pt, Pt, Pt, Pt]; angle: number } | null {
    if (!this.selection.length) return null
    const node = this.selection.length === 1 ? this.one() : undefined
    if (node && node.kind !== 'group' && node.kind !== 'dimension') {
      return { corners: orientedCorners(node), angle: node.rotation }
    }
    const b = selectionBounds(this.doc, this.selection)
    return {
      corners: [
        { x: b.x, y: b.y },
        { x: b.x + b.w, y: b.y },
        { x: b.x + b.w, y: b.y + b.h },
        { x: b.x, y: b.y + b.h },
      ],
      angle: 0,
    }
  }

  /** Handle positions in paper space: corners, edge midpoints, and the rotate knob above the top edge. */
  handlePositions(): { name: string; x: number; y: number }[] {
    const frame = this.selectionFrame()
    if (!frame) return []
    const [nw, ne, se, sw] = frame.corners
    const mid = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
    const n = mid(nw, ne)
    const s = mid(sw, se)
    const center = mid(n, s)
    // "Up" is away from the center through the top edge; when the box is degenerate fall back to paper up.
    const upLength = Math.hypot(n.x - center.x, n.y - center.y)
    const up = upLength > 1e-6 ? { x: (n.x - center.x) / upLength, y: (n.y - center.y) / upLength } : { x: -Math.sin(frame.angle), y: -Math.cos(frame.angle) }
    const offset = 28 / this.view.zoom
    return [
      { name: 'nw', ...nw },
      { name: 'n', ...n },
      { name: 'ne', ...ne },
      { name: 'e', ...mid(ne, se) },
      { name: 'se', ...se },
      { name: 's', ...s },
      { name: 'sw', ...sw },
      { name: 'w', ...mid(nw, sw) },
      { name: 'rotate', x: n.x + up.x * offset, y: n.y + up.y * offset },
    ]
  }

  private applyMove(paper: Pt): void {
    if (!this.drag) return
    let dx = paper.x - this.drag.start.x
    let dy = paper.y - this.drag.start.y
    this.smartLines = []
    if (this.drag.kind === 'move' && this.doc.canvas.smartGuides) {
      const adjust = this.smartSnap(dx, dy)
      dx = adjust.dx
      dy = adjust.dy
    }
    for (const origin of this.drag.origins) {
      const node = findNode(this.doc, origin.id)
      if (!node || node.locked) continue
      node.x = origin.x + dx
      node.y = origin.y + dy
    }
    const box = selectionBounds(this.doc, this.selection)
    this.readout = `${this.formatPoints(box.x)}, ${this.formatPoints(box.y)}`
    this.gaps = []
    const nodes = selectedNodes(this.doc, this.selection)
    if (nodes[0]) this.gaps = this.measureGaps(nodes[0])
    this.emit()
  }

  /** Resize or rotate handles. Everything is recomputed from the press so the math never drifts. */
  private applyHandle(paper: Pt, constrain: boolean): void {
    const drag = this.drag
    if (!drag || !drag.handle || !drag.pivot || !drag.box) return
    const live = drag.origins.flatMap((origin) => {
      const node = findNode(this.doc, origin.id)
      return node && !node.locked ? [{ node, origin }] : []
    })
    if (!live.length) return
    for (const { node, origin } of live) this.restoreOrigin(node, origin)
    this.smartLines = []
    this.gaps = []
    if (drag.handle === 'rotate') {
      const center = drag.pivot
      const a0 = Math.atan2(drag.start.y - center.y, drag.start.x - center.x)
      const a1 = Math.atan2(paper.y - center.y, paper.x - center.x)
      let delta = a1 - a0
      if (constrain) {
        const step = Math.PI / 12
        const base = live.length === 1 ? live[0].origin.rotation : 0
        delta = Math.round((base + delta) / step) * step - base
      }
      for (const { node } of live) rotateNode(node, delta, center)
      const shown = live.length === 1 ? live[0].node.rotation : delta
      this.readout = `${Math.round((((shown * 180) / Math.PI) % 360) * 10) / 10}°`
      this.emit()
      return
    }
    const dx = paper.x - drag.start.x
    const dy = paper.y - drag.start.y
    const single = live.length === 1 && live[0].node.kind !== 'group' && live[0].node.kind !== 'dimension' ? live[0] : null
    if (single) {
      this.resizeOriented(single.node, drag.handle, dx, dy, constrain)
    } else {
      this.resizeUnion(live.map((entry) => entry.node), drag.box, drag.handle, dx, dy, constrain)
    }
    const box = selectionBounds(this.doc, this.selection)
    const frame = single ? localBounds(single.node) : box
    this.readout = `${this.formatPoints(frame.w)} × ${this.formatPoints(frame.h)}`
    const nodes = selectedNodes(this.doc, this.selection)
    if (nodes[0]) this.gaps = this.measureGaps(nodes[0])
    this.emit()
  }

  /**
   * Resize one object in its own rotated frame: the pointer delta is turned into the object's axes,
   * the opposite side stays pinned in paper space, and the box keeps turning with the shape.
   */
  private resizeOriented(node: SceneNode, handle: string, dx: number, dy: number, constrain: boolean): void {
    const before = localBounds(node)
    const cos = Math.cos(-node.rotation)
    const sin = Math.sin(-node.rotation)
    const ldx = dx * cos - dy * sin
    const ldy = dx * sin + dy * cos
    let w = before.w
    let h = before.h
    if (handle.includes('e')) w = before.w + ldx
    if (handle.includes('w')) w = before.w - ldx
    if (handle.includes('s')) h = before.h + ldy
    if (handle.includes('n')) h = before.h - ldy
    w = Math.max(1, w)
    h = Math.max(1, h)
    let sx = before.w > 1e-6 ? w / before.w : 1
    let sy = before.h > 1e-6 ? h / before.h : 1
    if (!handle.includes('e') && !handle.includes('w')) sx = 1
    if (!handle.includes('n') && !handle.includes('s')) sy = 1
    if (constrain) {
      const corner = handle.length === 2
      const uniform = corner ? Math.max(sx, sy) : sx !== 1 ? sx : sy
      sx = uniform
      sy = uniform
    }
    // The side opposite the handle is the anchor; edge handles anchor on the opposite edge's midpoint.
    const ax = handle.includes('w') ? before.x + before.w : handle.includes('e') ? before.x : before.x + before.w / 2
    const ay = handle.includes('n') ? before.y + before.h : handle.includes('s') ? before.y : before.y + before.h / 2
    const anchorPaper = localToPaper(node, { x: ax, y: ay })
    scaleLocal(node, sx, sy)
    const probe = localToPaper({ ...node, x: 0, y: 0 }, { x: ax * sx, y: ay * sy })
    node.x = anchorPaper.x - probe.x
    node.y = anchorPaper.y - probe.y
  }

  /** Resize several objects (or a group) together: scale their union box and keep the layout inside it. */
  private resizeUnion(nodes: SceneNode[], box: Rect, handle: string, dx: number, dy: number, constrain: boolean): void {
    let w = box.w
    let h = box.h
    if (handle.includes('e')) w = box.w + dx
    if (handle.includes('w')) w = box.w - dx
    if (handle.includes('s')) h = box.h + dy
    if (handle.includes('n')) h = box.h - dy
    w = Math.max(1, w)
    h = Math.max(1, h)
    let sx = box.w > 1e-6 && (handle.includes('e') || handle.includes('w')) ? w / box.w : 1
    let sy = box.h > 1e-6 && (handle.includes('n') || handle.includes('s')) ? h / box.h : 1
    if (constrain) {
      const uniform = handle.length === 2 ? Math.max(sx, sy) : sx !== 1 ? sx : sy
      sx = uniform
      sy = uniform
    }
    const anchorX = handle.includes('w') ? box.x + box.w : handle.includes('e') ? box.x : box.x + box.w / 2
    const anchorY = handle.includes('n') ? box.y + box.h : handle.includes('s') ? box.y : box.y + box.h / 2
    for (const node of nodes) {
      const before = paperBounds(node)
      scaleLocal(node, sx, sy)
      const after = paperBounds(node)
      node.x += anchorX + (before.x - anchorX) * sx - after.x
      node.y += anchorY + (before.y - anchorY) * sy - after.y
    }
  }

  /** Smart guides: pull the moving bounds onto nearby edges and centers of other objects. */
  private smartSnap(dx: number, dy: number): { dx: number; dy: number } {
    if (!this.drag) return { dx, dy }
    const originBoxes = this.drag.origins.map((origin) => {
      const node = findNode(this.doc, origin.id)
      if (!node) return null
      return paperBounds({ ...node, x: origin.x, y: origin.y, rotation: origin.rotation, commands: origin.commands })
    })
    const boxes = originBoxes.filter((box): box is Rect => Boolean(box))
    if (!boxes.length) return { dx, dy }
    const union = {
      x: Math.min(...boxes.map((b) => b.x)) + dx,
      y: Math.min(...boxes.map((b) => b.y)) + dy,
      w: Math.max(...boxes.map((b) => b.x + b.w)) - Math.min(...boxes.map((b) => b.x)),
      h: Math.max(...boxes.map((b) => b.y + b.h)) - Math.min(...boxes.map((b) => b.y)),
    }
    const tol = 6 / this.view.zoom
    const movingX = [union.x, union.x + union.w / 2, union.x + union.w]
    const movingY = [union.y, union.y + union.h / 2, union.y + union.h]
    let bestX: { diff: number; at: number; other: Rect } | null = null
    let bestY: { diff: number; at: number; other: Rect } | null = null
    eachNode(this.doc, (other) => {
      if (this.selection.includes(other.id) || !other.visible) return
      const box = paperBounds(other)
      for (const ox of [box.x, box.x + box.w / 2, box.x + box.w]) {
        for (const mx of movingX) {
          const diff = ox - mx
          if (Math.abs(diff) <= tol && (!bestX || Math.abs(diff) < Math.abs(bestX.diff))) bestX = { diff, at: ox, other: box }
        }
      }
      for (const oy of [box.y, box.y + box.h / 2, box.y + box.h]) {
        for (const my of movingY) {
          const diff = oy - my
          if (Math.abs(diff) <= tol && (!bestY || Math.abs(diff) < Math.abs(bestY.diff))) bestY = { diff, at: oy, other: box }
        }
      }
    })
    const snapX = bestX as { diff: number; at: number; other: Rect } | null
    const snapY = bestY as { diff: number; at: number; other: Rect } | null
    if (snapX) {
      dx += snapX.diff
      const top = Math.min(union.y, snapX.other.y)
      const bottom = Math.max(union.y + union.h, snapX.other.y + snapX.other.h)
      this.smartLines.push({ x1: snapX.at, y1: top, x2: snapX.at, y2: bottom, label: '' })
    }
    if (snapY) {
      dy += snapY.diff
      const left = Math.min(union.x, snapY.other.x)
      const right = Math.max(union.x + union.w, snapY.other.x + snapY.other.w)
      this.smartLines.push({ x1: left, y1: snapY.at, x2: right, y2: snapY.at, label: '' })
    }
    return { dx, dy }
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
    if (this.tool === 'star') return makeStar(x, y, w, h, this.starPoints, this.starInnerRadius)
    if (this.tool === 'arc') return makeArc(x, y, w, h, this.arcMode)
    if (this.tool === 'roundRect') return makeRect(x, y, w, h, this.cornerRadius)
    if (this.tool === 'text') {
      const node = makePath('Text', x, y, [])
      node.kind = 'text'
      node.text = {
        content: 'Text',
        fontFamily: this.textDefaults.fontFamily,
        fontStyle: this.textDefaults.fontStyle,
        fontSize: this.textDefaults.fontSize,
        align: this.textDefaults.align,
        lineSpacing: 1.2,
        charSpacing: 0,
        mode: w > 8 ? 'field' : 'box',
        fieldWidth: Math.max(40, w),
        onPath: false,
        path: [],
        pathOffset: 0,
        color: structuredClone(this.paint.stroke),
      }
      const fill = node.appearance.find((item) => item.kind === 'fill')
      if (fill) fill.enabled = false
      const stroke = node.appearance.find((item) => item.kind === 'stroke')
      if (stroke) stroke.enabled = false
      return node
    }
    return makeRect(x, y, w, h)
  }

  hit(paper: Pt, pointer: PointerInput, anyLayer = false): SceneNode | undefined {
    const tol = this.hitSlop(pointer.type) / this.view.zoom
    const visit = (nodes: SceneNode[], ox: number, oy: number): SceneNode | undefined => {
      for (let i = nodes.length - 1; i >= 0; i--) {
        const node = nodes[i]
        if (!node.visible || node.locked) continue
        if (node.kind === 'group') {
          const found = visit(node.children, ox + node.x, oy + node.y)
          if (found) return node
          continue
        }
        if (hitNode({ ...node, x: node.x + ox, y: node.y + oy }, paper, tol)) return node
      }
      return undefined
    }
    void anyLayer
    for (let i = this.doc.layers.length - 1; i >= 0; i--) {
      const layer = this.doc.layers[i]
      if (!layer.visible || layer.locked) continue
      const found = visit(layer.children, 0, 0)
      if (found) return found
    }
    return undefined
  }

  private activateLayerOf(id: string): void {
    const layer = this.doc.layers.find((item) => item.children.some((node) => node.id === id || containsNode(node, id)))
    if (layer) this.doc.activeLayerId = layer.id
  }

  private selectedPathOrHit(paper: Pt, pointer: PointerInput): SceneNode | undefined {
    const node = this.one()
    if (node && node.kind === 'path' && hitNode(node, paper, this.hitSlop(pointer.type) / this.view.zoom)) return node
    const hit = this.hit(paper, pointer)
    return hit?.kind === 'path' ? hit : undefined
  }

  private hitHandle(paper: Pt, type: PointerInput['type']): string | undefined {
    if (!this.selection.length) return undefined
    const tol = this.hitSlop(type) / this.view.zoom
    let best: { name: string; dist: number } | null = null
    for (const handle of this.handlePositions()) {
      const dist = Math.hypot(paper.x - handle.x, paper.y - handle.y)
      if (dist <= tol && (!best || dist < best.dist)) best = { name: handle.name, dist }
    }
    return best?.name
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

  // ---------- selection ----------

  selectAll(): void {
    const layer = activeLayer(this.doc)
    this.selection = layer.children.filter((node) => node.visible && !node.locked).map((node) => node.id)
    this.emit()
  }

  deselect(): void {
    this.selection = []
    this.anchor = null
    this.emit()
  }

  selectNode(id: string, additive = false): void {
    if (!findNode(this.doc, id)) return
    this.selection = additive ? [...new Set([...this.selection, id])] : [id]
    this.activateLayerOf(id)
    this.emit()
  }

  // ---------- multiplying ----------

  duplicate(): void {
    if (!this.selection.length) return
    this.duplicateSelection(16, 16)
    this.lastStep = { ...IDENTITY_STEP, dx: 16, dy: 16 }
    this.emit()
  }

  private duplicateSelection(dx = 0, dy = 0, snapshot = true): void {
    if (snapshot) this.snapshot()
    const copies = selectedNodes(this.doc, this.selection).map((node) => cloneNode(node, dx, dy))
    const layer = activeLayer(this.doc)
    layer.children.push(...copies)
    this.selection = copies.map((node) => node.id)
  }

  /** Command-D: duplicate and replay the last duplicate's transform. */
  smartDuplicate(): void {
    if (!this.selection.length) return
    const step = this.lastStep ?? { ...IDENTITY_STEP, dx: 16, dy: 16 }
    this.duplicateSelection()
    transformNodes(selectedNodes(this.doc, this.selection), step)
    this.lastStep = step
    this.emit()
  }

  copy(): void {
    const nodes = selectedNodes(this.doc, this.selection)
    if (!nodes.length) return
    this.clipboardNodes = nodes.map((node) => structuredClone(node))
    this.emit()
  }

  cut(): void {
    if (!this.selection.length) return
    this.copy()
    this.deleteSelection()
  }

  paste(viewport?: { width: number; height: number }): void {
    this.guard(() => {
      if (!this.clipboardNodes?.length) throw new Error('Nothing to paste')
      this.snapshot()
      const union = selectionBoundsOf(this.clipboardNodes)
      const center = viewport
        ? this.toPaper({ cx: viewport.width / 2, cy: viewport.height / 2 })
        : { x: union.x + union.w / 2 + 16, y: union.y + union.h / 2 + 16 }
      const dx = center.x - (union.x + union.w / 2)
      const dy = center.y - (union.y + union.h / 2)
      const copies = this.clipboardNodes.map((node) => cloneNode(node, dx, dy))
      const layer = activeLayer(this.doc)
      if (layer.locked) throw new Error('The active layer is locked')
      layer.children.push(...copies)
      this.selection = copies.map((node) => node.id)
      this.emit()
    })
  }

  pasteInPlace(): void {
    this.guard(() => {
      if (!this.clipboardNodes?.length) throw new Error('Nothing to paste')
      this.snapshot()
      const copies = this.clipboardNodes.map((node) => cloneNode(node, 0, 0))
      const layer = activeLayer(this.doc)
      if (layer.locked) throw new Error('The active layer is locked')
      layer.children.push(...copies)
      this.selection = copies.map((node) => node.id)
      this.emit()
    })
  }

  copyAsSvg(): string {
    if (!this.selection.length) throw new Error('Nothing selected')
    return this.exportSvg({ include: 'selection' })
  }

  copyAsCss(): string {
    const node = this.one()
    if (!node) throw new Error('Nothing selected')
    return cssOf(node)
  }

  // ---------- transform panel ----------

  /** Apply a Transform panel step. `copy` duplicates first and remembers the step for Smart Duplicate. */
  transform(step: Partial<TransformStep>, options: { copy?: boolean; scaleStyles?: boolean } = {}): void {
    this.guard(() => {
      if (!this.selection.length) throw new Error('Nothing selected')
      const full: TransformStep = { ...IDENTITY_STEP, ...step }
      if (options.copy) this.duplicateSelection()
      else this.snapshot()
      transformNodes(selectedNodes(this.doc, this.selection), full, options.scaleStyles ?? false)
      if (options.copy) this.lastStep = full
      this.emit()
    })
  }

  nudge(dx: number, dy: number): void {
    const nodes = selectedNodes(this.doc, this.selection)
    if (!nodes.length) return
    this.snapshot()
    for (const node of nodes) {
      if (node.locked) continue
      node.x += dx
      node.y += dy
      if (node.dimension) {
        node.dimension.x1 += dx
        node.dimension.x2 += dx
        node.dimension.y1 += dy
        node.dimension.y2 += dy
      }
    }
    this.emit()
  }

  // ---------- view ----------

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

  // ---------- canvas ----------

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

  /** A scale statement like 1/4 in = 1 ft. */
  setScaleStatement(paperAmount: number, paperUnit: BaseUnit, realAmount: number, realUnit: LabelUnit): void {
    this.guard(() => {
      this.snapshot()
      const scale: ScaleStatement = { paperAmount, paperUnit, realAmount, realUnit }
      this.doc.canvas.realInchesPerPoint = realInchesPerPointFor(scale)
      this.doc.canvas.scale = scale
      this.followScaleUnit(labelUnitForScale(scale))
      this.emit()
    })
  }

  /** Applies a scale statement expressed in the current page unit. */
  applyScale(scale: ScaleStatement): void {
    this.setScaleStatement(scale.paperAmount, scale.paperUnit, scale.realAmount, scale.realUnit)
  }

  /** The current scale as a statement in the page unit (restated when the document only stores the ratio). */
  scaleStatement(): ScaleStatement {
    const canvas = this.doc.canvas
    return canvas.scale ?? restateScale(ratioFromInchesPerPoint(canvas.realInchesPerPoint), canvas.baseUnit)
  }

  /**
   * Changes the ruler/page unit. The scale keeps its ratio but is re-expressed in the new unit
   * (1/4 in = 1 ft becomes 1 mm = 4.8 cm), and automatic label units move to the new system.
   */
  setBaseUnit(unit: BaseUnit): void {
    const canvas = this.doc.canvas
    if (canvas.baseUnit === unit) return
    this.snapshot()
    const previousSystem = unitSystem(canvas.baseUnit)
    canvas.baseUnit = unit
    const ratio = ratioFromInchesPerPoint(canvas.realInchesPerPoint)
    canvas.scale = restateScale(ratio, unit)
    if (unitSystem(unit) !== previousSystem) this.followScaleUnit(Math.abs(ratio - 1) < 1e-9 ? defaultLabelUnit(unit) : labelUnitForScale(canvas.scale))
    this.emit()
  }

  /** Moves the label unit along with an automatic choice, unless the user picked one by hand. */
  private followScaleUnit(unit: LabelUnit): void {
    const canvas = this.doc.canvas
    const defaults: LabelUnit[] = ['px', 'in', 'cm', 'mm']
    const automatic = defaults.includes(canvas.labelUnit) || canvas.labelUnit === canvas.scaleLabelUnit
    if (!automatic) return
    canvas.labelUnit = unit
    canvas.scaleLabelUnit = unit
  }

  setLabelUnit(unit: Doc['canvas']['labelUnit']): void {
    this.snapshot()
    this.doc.canvas.labelUnit = unit
    this.emit()
  }

  setCanvas(patch: Partial<CanvasSettings>): void {
    const { baseUnit, ...rest } = patch
    if (baseUnit && baseUnit !== this.doc.canvas.baseUnit) this.setBaseUnit(baseUnit)
    if (Object.keys(rest).length === 0) return
    this.snapshot()
    Object.assign(this.doc.canvas, rest)
    this.emit()
  }

  setGrid(patch: Partial<GridSettings>): void {
    this.snapshot()
    Object.assign(this.doc.canvas.grid, patch)
    this.emit()
  }

  setPrecision(patch: Partial<CanvasSettings['precision']>): void {
    this.snapshot()
    Object.assign(this.doc.canvas.precision, patch)
    this.emit()
  }

  addGuide(axis: 'h' | 'v', at: number): string {
    this.snapshot()
    const guide = { id: uid('g'), axis, at }
    this.doc.guides.push(guide)
    this.emit()
    return guide.id
  }

  removeGuide(id: string): void {
    this.snapshot()
    this.doc.guides = this.doc.guides.filter((guide) => guide.id !== id)
    this.emit()
  }

  clearGuides(): void {
    this.snapshot()
    this.doc.guides = []
    this.emit()
  }

  // ---------- documents ----------

  newDocument(preset: string | NewDocumentOptions): void {
    const options: NewDocumentOptions = typeof preset === 'string' ? { preset } : preset
    const doc = makeDocument({ ...options, name: options.name ?? `Untitled ${this.docs.length + 1}` })
    this.docs.push(doc)
    this.past.push([])
    this.future.push([])
    this.active = this.docs.length - 1
    this.selection = []
    this.emit()
  }

  /** True when the active document has anything drawn on any layer. */
  documentHasContent(): boolean {
    return this.doc.layers.some((layer) => layer.children.length > 0)
  }

  closeDocument(): void {
    if (this.documentHasContent() && !this.confirmClose(this.doc.name)) return
    if (this.docs.length === 1) {
      this.docs[0] = makeDocument()
      this.past[0] = []
      this.future[0] = []
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

  renameDocument(name: string): void {
    this.doc.name = name.trim() || this.doc.name
    this.emit()
  }

  // ---------- layers ----------

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
      this.selection = this.selection.filter((selected) => findNode(this.doc, selected))
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
    if (this.doc.activeLayerId === id) this.doc.activeLayerId = this.doc.layers[index - 1].id
    this.emit()
  }

  moveLayer(id: string, direction: 'up' | 'down'): void {
    const index = this.doc.layers.findIndex((item) => item.id === id)
    const target = direction === 'up' ? index + 1 : index - 1
    if (index < 0 || target < 0 || target >= this.doc.layers.length) return
    this.snapshot()
    const [layer] = this.doc.layers.splice(index, 1)
    this.doc.layers.splice(target, 0, layer)
    this.emit()
  }

  setLayer(id: string, patch: Partial<Pick<Doc['layers'][number], 'visible' | 'locked' | 'opacity' | 'blendMode' | 'name'>>): void {
    const layer = this.doc.layers.find((item) => item.id === id)
    if (!layer) return
    this.snapshot()
    Object.assign(layer, patch)
    this.emit()
  }

  setActiveLayer(id: string): void {
    if (!this.doc.layers.some((layer) => layer.id === id)) return
    this.doc.activeLayerId = id
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

  setNodeVisible(id: string, visible: boolean): void {
    const node = findNode(this.doc, id)
    if (!node) return
    this.snapshot()
    node.visible = visible
    this.emit()
  }

  renameNode(id: string, name: string): void {
    const node = findNode(this.doc, id)
    if (!node) return
    this.snapshot()
    node.name = name
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

  // ---------- organizing ----------

  group(): void {
    const nodes = selectedNodes(this.doc, this.selection)
    if (nodes.length < 2) return
    this.snapshot()
    const group = makePath('Group', 0, 0, [])
    group.kind = 'group'
    group.children = nodes.map((node) => structuredClone(node))
    for (const node of nodes) removeNode(this.doc, node.id)
    this.addNode(group)
    this.selection = [group.id]
    this.emit()
  }

  ungroup(): void {
    const node = this.selection.length === 1 ? findNode(this.doc, this.selection[0]) : undefined
    if (!node || node.kind !== 'group') return
    this.snapshot()
    const list = parentList(this.doc, node.id)
    if (!list) return
    const index = list.findIndex((item) => item.id === node.id)
    const children = node.children.map((child) => ({ ...child, x: child.x + node.x, y: child.y + node.y }))
    list.splice(index, 1, ...children)
    this.selection = children.map((child) => child.id)
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
      const nodes = selectedNodes(this.doc, this.selection)
      flipNodes(nodes, axis)
      for (const node of nodes) {
        const bounds = commandsBounds(node.commands)
        node.commands = node.commands.map((command) => {
          if (command.c === 'Z') return command
          const mirror = (value: number, start: number, size: number) => start + size - (value - start)
          return axis === 'h'
            ? { ...command, x: mirror(command.x, bounds.x, bounds.w), x1: command.c === 'C' ? mirror(command.x1, bounds.x, bounds.w) : command.x1, x2: command.c === 'C' ? mirror(command.x2, bounds.x, bounds.w) : command.x2 }
            : { ...command, y: mirror(command.y, bounds.y, bounds.h), y1: command.c === 'C' ? mirror(command.y1, bounds.y, bounds.h) : command.y1, y2: command.c === 'C' ? mirror(command.y2, bounds.y, bounds.h) : command.y2 }
        })
      }
      this.emit()
    })
  }

  arrange(direction: 'forward' | 'backward' | 'front' | 'back'): void {
    if (this.selection.length !== 1) return
    this.snapshot()
    const id = this.selection[0]
    if (direction === 'forward') bringForward(this.doc, id)
    else if (direction === 'backward') sendBackward(this.doc, id)
    else {
      const list = parentList(this.doc, id)
      if (list) {
        const index = list.findIndex((node) => node.id === id)
        const [node] = list.splice(index, 1)
        if (direction === 'front') list.push(node)
        else list.unshift(node)
      }
    }
    this.emit()
  }

  // ---------- paths ----------

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
        node.rotation = 0
        this.addNode(node)
      })
      this.selection = created.map((node) => node.id)
      this.emit()
    })
  }

  compound(): void {
    this.guard(() => {
      const nodes = selectedNodes(this.doc, this.selection).filter((node) => node.kind === 'path')
      const commands = compoundCommands(nodes)
      this.snapshot()
      const created = newPathFromCommands(nodes[0], commands, 'Compound path')
      created.x = 0
      created.y = 0
      created.rotation = 0
      nodes.forEach((node) => removeNode(this.doc, node.id))
      this.addNode(created)
      this.emit()
    })
  }

  releaseCompound(): void {
    this.guard(() => {
      const node = this.one()
      if (!node || node.kind !== 'path') throw new Error('Select a compound path')
      const parts: SceneNode['commands'][] = []
      let current: SceneNode['commands'] = []
      for (const command of node.commands) {
        if (command.c === 'M' && current.length) {
          parts.push(current)
          current = []
        }
        current.push(command)
      }
      if (current.length) parts.push(current)
      if (parts.length < 2) throw new Error('This path has one subpath')
      this.snapshot()
      removeNode(this.doc, node.id)
      const created = parts.map((part, index) => {
        const piece = newPathFromCommands(node, part, `${node.name} ${index + 1}`)
        piece.x = node.x
        piece.y = node.y
        piece.rotation = node.rotation
        return piece
      })
      created.forEach((piece) => this.addNode(piece))
      this.selection = created.map((piece) => piece.id)
      this.emit()
    })
  }

  join(): void {
    this.guard(() => {
      const nodes = selectedNodes(this.doc, this.selection)
      if (nodes.length !== 2) throw new Error('Select two open paths')
      const commands = joinOpenPaths({ ...nodes[0], commands: paperCommands(nodes[0]) }, { ...nodes[1], commands: paperCommands(nodes[1]) })
      this.snapshot()
      nodes[0].commands = commands
      nodes[0].x = 0
      nodes[0].y = 0
      nodes[0].rotation = 0
      removeNode(this.doc, nodes[1].id)
      this.selection = [nodes[0].id]
      this.emit()
    })
  }

  /** Connect: with two paths join them; with one open path close it. */
  connectEndpoints(): void {
    if (this.selection.length === 2) this.join()
    else this.closeSelected()
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

  scissorsAt(id: string, paper: Pt): void {
    this.guard(() => {
      const node = requireNode(this.doc, id)
      const local = paperToLocal(node, paper)
      const pieces = splitPath(node.commands, local)
      this.snapshot()
      node.commands = pieces[0]
      const created = pieces.slice(1).map((commands, index) => {
        const piece = newPathFromCommands(node, commands, `${node.name} ${index + 2}`)
        piece.x = node.x
        piece.y = node.y
        piece.rotation = node.rotation
        return piece
      })
      created.forEach((piece) => this.addNode(piece))
      this.selection = [node.id, ...created.map((piece) => piece.id)]
      this.emit()
    })
  }

  addAnchorAt(id: string, paper: Pt): void {
    this.guard(() => {
      const node = requireNode(this.doc, id)
      const local = paperToLocal(node, paper)
      this.snapshot()
      node.commands = addAnchor(node.commands, local)
      this.selection = [node.id]
      this.emit()
    })
  }

  /** Disconnect the selected anchor so the path breaks there. */
  disconnectAnchor(): void {
    this.guard(() => {
      if (!this.anchor) throw new Error('Select an anchor with the path tool first')
      const node = requireNode(this.doc, this.anchor.id)
      const pieces = disconnectAt(node.commands, this.anchor.index)
      this.snapshot()
      node.commands = pieces[0]
      pieces.slice(1).forEach((commands, index) => {
        const piece = newPathFromCommands(node, commands, `${node.name} ${index + 2}`)
        piece.x = node.x
        piece.y = node.y
        piece.rotation = node.rotation
        this.addNode(piece)
      })
      this.anchor = null
      this.emit()
    })
  }

  deleteAnchor(): void {
    this.guard(() => {
      if (!this.anchor) throw new Error('Select an anchor with the path tool first')
      const node = requireNode(this.doc, this.anchor.id)
      if (node.commands.filter((c) => c.c !== 'Z').length <= 2) throw new Error('A path needs two anchors')
      this.snapshot()
      const index = this.anchor.index
      node.commands = node.commands.filter((_, i) => i !== index)
      if (node.commands[0] && node.commands[0].c !== 'M') node.commands[0] = { ...node.commands[0], c: 'M' }
      this.anchor = null
      this.emit()
    })
  }

  convertAnchor(): void {
    const node = this.one()
    if (!node) return
    this.snapshot()
    if (this.anchor && this.anchor.id === node.id) {
      const index = this.anchor.index
      node.commands = node.commands.map((command, i) =>
        i !== index ? command : command.c === 'L' ? { ...command, c: 'C', x1: command.x, y1: command.y, x2: command.x, y2: command.y } : command.c === 'C' ? { ...command, c: 'L' } : command,
      )
    } else {
      node.commands = node.commands.map((command) =>
        command.c === 'L' ? { ...command, c: 'C', x1: command.x, y1: command.y, x2: command.x, y2: command.y } : command.c === 'C' ? { ...command, c: 'L' } : command,
      )
    }
    this.emit()
  }

  /** Cut closed shapes with the eraser, and shorten or split open lines it crosses. */
  eraseAlong(points: Pt[]): void {
    const radius = Math.max(0.5, this.eraserWidth / 2)
    const cut = corridor(points, radius * 2)
    const cutBounds = commandsBounds(cut)
    const targets: SceneNode[] = []
    const layer = activeLayer(this.doc)
    for (const node of layer.children) {
      if (!node.visible || node.locked || node.kind !== 'path') continue
      const box = paperBounds(node)
      const pad = radius + (this.strokeOf(node)?.width ?? 0) / 2
      const overlaps =
        box.x - pad < cutBounds.x + cutBounds.w &&
        box.x + box.w + pad > cutBounds.x &&
        box.y - pad < cutBounds.y + cutBounds.h &&
        box.y + box.h + pad > cutBounds.y
      if (overlaps) targets.push(node)
    }
    if (!targets.length) return
    this.snapshot()
    for (const node of targets) {
      const open = !node.commands.some((command) => command.c === 'Z')
      if (open) {
        const reach = radius + (this.strokeOf(node)?.width ?? 0) / 2
        const pieces = trimOpenPath(paperCommands(node), points, reach)
        if (!pieces) continue
        node.shade = undefined
        node.ink = undefined
        node.x = 0
        node.y = 0
        node.rotation = 0
        this.replaceWithPieces(node, pieces, layer)
        continue
      }
      try {
        const results = booleanCommands('subtract', paperCommands(node), cut)
        this.replaceWithPieces(node, separateContours(results[0] ?? []), layer)
      } catch {
        /* a degenerate path stays as it is */
      }
    }
  }

  /** Turn a saved path into one object per piece when those pieces do not actually overlap. */
  private detachDisjoint(doc: Doc): void {
    const visit = (list: SceneNode[]) => {
      for (let index = 0; index < list.length; index++) {
        const node = list[index]
        if (node.children.length) visit(node.children)
        if (node.kind !== 'path') continue
        const pieces = separateContours(node.commands)
        if (pieces.length < 2) continue
        const children = pieces.map((commands, piece) => {
          const next = newPathFromCommands(node, commands, `${node.name} ${piece + 1}`)
          next.x = node.x
          next.y = node.y
          next.rotation = node.rotation
          next.shade = undefined
          next.ink = undefined
          return next
        })
        list.splice(index, 1, ...children)
        index += children.length - 1
      }
    }
    for (const layer of doc.layers) visit(layer.children)
  }

  /** One contour stays on the node. Disconnected contours become separate objects. */
  private replaceWithPieces(node: SceneNode, pieces: Cmd[][], layer: { children: SceneNode[] }): void {
    node.shade = undefined
    node.ink = undefined
    if (pieces.length <= 1) {
      if (!pieces.length) {
        removeNode(this.doc, node.id)
        this.selection = this.selection.filter((id) => id !== node.id)
        return
      }
      node.commands = pieces[0]
      node.x = 0
      node.y = 0
      node.rotation = 0
      return
    }
    const children = pieces.map((commands, index) => {
      const piece = newPathFromCommands(node, commands, `${node.name} ${index + 1}`)
      piece.x = 0
      piece.y = 0
      piece.rotation = 0
      piece.shade = undefined
      piece.ink = undefined
      return piece
    })
    const list = parentList(this.doc, node.id) ?? layer.children
    const index = list.findIndex((item) => item.id === node.id)
    if (index >= 0) list.splice(index, 1, ...children)
    else list.push(...children)
    this.selection = children.map((piece) => piece.id)
  }

  slant(amount: number): void {
    const node = this.one()
    if (!node) return
    this.snapshot()
    const shear = (commands: SceneNode['commands']) => commands.map((command) => ({ ...command, x: command.x + command.y * amount, x1: command.x1 + command.y1 * amount, x2: command.x2 + command.y2 * amount }))
    node.commands = shear(node.commands)
    if (node.shade) node.shade = shear(node.shade)
    if (node.ink) node.ink = shear(node.ink)
    this.emit()
  }

  scaleSelection(factor: number): void {
    const nodes = selectedNodes(this.doc, this.selection)
    if (!nodes.length) return
    this.snapshot()
    for (const node of nodes) {
      node.commands = scaleCommands(node.commands, factor, factor)
      if (node.shade) node.shade = scaleCommands(node.shade, factor, factor)
      if (node.ink) node.ink = scaleCommands(node.ink, factor, factor)
    }
    this.emit()
  }

  rotateSelection(radians: number): void {
    const nodes = selectedNodes(this.doc, this.selection)
    if (!nodes.length) return
    this.snapshot()
    for (const node of nodes) node.rotation += radians
    this.emit()
  }

  // ---------- text ----------

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
    text.text.path = translateCommands(paperCommands(path), -text.x, -text.y)
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

  /** Slide text along its path; the on-canvas handle and the Offset field both call this. */
  setTextPathOffset(offset: number): void {
    const node = this.one()
    if (!node?.text?.onPath) return
    this.snapshot()
    node.text.pathOffset = Math.max(0, offset)
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
    const fill = node.appearance.find((item) => item.kind === 'fill')
    if (fill && fill.kind === 'fill') {
      fill.enabled = true
      fill.color = node.text.color ?? fill.color
    }
    node.name = 'Outlined text'
    node.text = undefined
    this.emit()
  }

  setTextContent(content: string): void {
    const node = findNode(this.doc, this.editingTextId ?? this.selection[0] ?? '')
    if (!node?.text) return
    if (!this.textUndoArmed) {
      this.snapshot()
      this.textUndoArmed = true
    }
    const delta = content.length - node.text.content.length
    node.text.content = content
    if (node.text.spans && delta !== 0) {
      const at = this.textSelection.start
      node.text.spans = node.text.spans
        .map((span) => ({
          ...span,
          start: span.start >= at ? Math.max(at, span.start + delta) : span.start,
          end: span.end > at ? Math.max(at, span.end + delta) : span.end,
        }))
        .filter((span) => span.end > span.start && span.start < content.length)
    }
    this.emit()
  }

  setTextProp(patch: Partial<Omit<TextData, 'content' | 'path' | 'spans'>>): void {
    const nodes = selectedNodes(this.doc, this.selection).filter((node) => node.text)
    if (!nodes.length) return
    this.snapshot()
    for (const node of nodes) Object.assign(node.text!, patch)
    this.emit()
  }

  /** Style only the highlighted characters of the text being edited. */
  styleTextRange(start: number, end: number, patch: Partial<Omit<TextSpan, 'start' | 'end'>>): void {
    const node = findNode(this.doc, this.editingTextId ?? this.selection[0] ?? '')
    if (!node?.text) return
    const from = Math.max(0, Math.min(start, end))
    const to = Math.min(node.text.content.length, Math.max(start, end))
    if (to <= from) {
      this.setTextProp({ fontStyle: patch.bold ? 'bold' : patch.italic ? 'italic' : 'normal', ...(patch.color ? { color: patch.color } : {}) })
      return
    }
    this.snapshot()
    const spans = node.text.spans ?? []
    const next: TextSpan[] = []
    for (const span of spans) {
      if (span.end <= from || span.start >= to) {
        next.push(span)
        continue
      }
      if (span.start < from) next.push({ ...span, end: from })
      if (span.end > to) next.push({ ...span, start: to })
    }
    const existing = spans.find((span) => span.start <= from && span.end >= to)
    next.push({ ...(existing ?? {}), ...patch, start: from, end: to })
    node.text.spans = next.sort((a, b) => a.start - b.start)
    this.emit()
  }

  editText(id: string): void {
    const node = findNode(this.doc, id)
    if (!node?.text) return
    this.selection = [id]
    this.editingTextId = id
    this.textUndoArmed = false
    this.drag = null
    this.emit()
  }

  stopTextEdit(): void {
    if (!this.editingTextId && !this.textUndoArmed) return
    this.editingTextId = null
    this.textUndoArmed = false
    this.emit()
  }

  // ---------- styles ----------

  selectSimilar(key: SimilarKey, scope: 'layer' | 'all'): void {
    const node = this.one()
    if (!node) return
    this.selection = selectSimilar(this.doc, node, key, scope)
    this.emit()
  }

  recolor(method: AdjustMethod, amount: number): void {
    const nodes = selectedNodes(this.doc, this.selection)
    if (!nodes.length) return
    this.snapshot()
    nodes.forEach((node) => recolorNode(node, method, amount))
    this.emit()
  }

  /** Recolor Artwork dialog: preview on the live canvas, then commit or reset. */
  beginRecolor(): void {
    const nodes = selectedNodes(this.doc, this.selection)
    this.recolorBase = new Map(nodes.map((node) => [node.id, structuredClone(node)]))
  }

  previewRecolor(values: Partial<Record<AdjustMethod, number>>): void {
    if (!this.recolorBase) this.beginRecolor()
    for (const [id, base] of this.recolorBase!) {
      const node = findNode(this.doc, id)
      if (!node) continue
      node.appearance = structuredClone(base.appearance)
      node.children = structuredClone(base.children)
      for (const [method, amount] of Object.entries(values) as [AdjustMethod, number][]) {
        if (amount) recolorNode(node, method, amount)
      }
    }
    this.emit()
  }

  resetRecolor(): void {
    if (!this.recolorBase) return
    for (const [id, base] of this.recolorBase) {
      const node = findNode(this.doc, id)
      if (!node) continue
      node.appearance = structuredClone(base.appearance)
      node.children = structuredClone(base.children)
    }
    this.emit()
  }

  commitRecolor(): void {
    if (!this.recolorBase) return
    const current = structuredClone(this.doc)
    for (const [id, base] of this.recolorBase) {
      const node = findNode(current, id)
      if (node) {
        node.appearance = structuredClone(base.appearance)
        node.children = structuredClone(base.children)
      }
    }
    const past = this.past[this.active]
    past.push(current)
    if (past.length > HISTORY_CAP) past.shift()
    this.future[this.active] = []
    this.recolorBase = null
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

  deleteStyle(id: string): void {
    this.doc.styles = this.doc.styles.filter((style) => style.id !== id)
    this.emit()
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

  // ---------- appearance ----------

  /** Front fill and stroke of the selection, or the paint for the next shape. */
  frontColors(): { fill: Color | null; stroke: Color | null; strokeWidth: number; dash: DashPreset } {
    const node = this.one()
    if (!node) return { fill: this.paint.fill, stroke: this.paint.stroke, strokeWidth: this.paint.strokeWidth, dash: this.dashPreset }
    const fill = [...node.appearance].reverse().find((item): item is FillAttr => item.kind === 'fill')
    const stroke = [...node.appearance].reverse().find((item): item is StrokeAttr => item.kind === 'stroke')
    return {
      fill: fill && fill.enabled ? fill.color : node.text?.color ?? null,
      stroke: stroke && stroke.enabled ? stroke.color : null,
      strokeWidth: stroke?.width ?? this.paint.strokeWidth,
      dash: stroke ? dashPresetOf(stroke.dash) : this.dashPreset,
    }
  }

  fillOf(node: SceneNode): FillAttr | undefined {
    return node.appearance.find((item): item is FillAttr => item.kind === 'fill')
  }

  strokeOf(node: SceneNode): StrokeAttr | undefined {
    return node.appearance.find((item): item is StrokeAttr => item.kind === 'stroke')
  }

  effectOf(node: SceneNode, kind: EffectKind): EffectAttr | undefined {
    return node.appearance.find((item): item is EffectAttr => item.kind === kind)
  }

  private editSelected(apply: (node: SceneNode) => void, fallback?: () => void): void {
    const nodes = selectedNodes(this.doc, this.selection)
    if (!nodes.length) {
      fallback?.()
      this.emit()
      return
    }
    this.snapshot()
    nodes.forEach((node) => {
      apply(node)
      node.children.forEach(apply)
    })
    this.emit()
  }

  setFill(patch: Partial<Pick<FillAttr, 'color' | 'enabled' | 'opacity'>>): void {
    this.editSelected(
      (node) => {
        const fill = this.fillOf(node)
        if (node.text && patch.color) node.text.color = structuredClone(patch.color)
        if (!fill) return
        Object.assign(fill, patch)
        if (patch.color) {
          fill.gradient = undefined
          fill.patternId = undefined
          fill.imageId = undefined
        }
      },
      () => {
        if (patch.color) this.paint.fill = structuredClone(patch.color)
      },
    )
  }

  setFillHex(hex: string): void {
    const color = fromHex(hex)
    if (!color) {
      this.banner = `${hex} is not a hex color`
      this.emit()
      return
    }
    this.setFill({ color, enabled: true })
  }

  setStroke(patch: Partial<Pick<StrokeAttr, 'color' | 'enabled' | 'opacity' | 'width' | 'dash' | 'arrows' | 'align'>>): void {
    this.editSelected(
      (node) => {
        const stroke = this.strokeOf(node)
        if (!stroke) return
        if (patch.width != null && !(patch.width >= 0)) throw new Error('Stroke width must be zero or more')
        Object.assign(stroke, patch)
      },
      () => {
        if (patch.color) this.paint.stroke = structuredClone(patch.color)
        if (patch.width != null) this.paint.strokeWidth = patch.width
        if (patch.dash) this.dashPreset = dashPresetOf(patch.dash)
      },
    )
  }

  setStrokeHex(hex: string): void {
    const color = fromHex(hex)
    if (!color) {
      this.banner = `${hex} is not a hex color`
      this.emit()
      return
    }
    this.setStroke({ color, enabled: true })
  }

  setDash(preset: DashPreset): void {
    this.dashPreset = preset
    this.setStroke({ dash: [...DASHES[preset]], enabled: true })
  }

  /** Plain, arrow, or dimension for the Line tool and for a selected line. */
  setLineMode(mode: LineMode): void {
    this.lineMode = mode
    const node = this.one()
    if (!node) {
      this.emit()
      return
    }
    const isLine = node.kind === 'path' && node.commands.filter((c) => c.c !== 'Z').length === 2
    if (node.kind === 'dimension' && node.dimension && mode !== 'dimension') {
      this.snapshot()
      const d = node.dimension
      const line = makeLine(d.x1, d.y1, d.x2, d.y2, mode === 'arrow' ? 'end' : 'none')
      this.replaceNode(node.id, line)
      return
    }
    if (isLine) {
      const a = localToPaper(node, { x: node.commands[0].x, y: node.commands[0].y })
      const b = localToPaper(node, { x: node.commands[1].x, y: node.commands[1].y })
      if (mode === 'dimension') {
        this.snapshot()
        this.replaceNode(node.id, makeDimension(a.x, a.y, b.x, b.y, 28))
        return
      }
      this.setStroke({ arrows: mode === 'arrow' ? 'end' : 'none' })
      return
    }
    this.emit()
  }

  private replaceNode(id: string, replacement: SceneNode): void {
    const list = parentList(this.doc, id)
    if (!list) return
    const index = list.findIndex((node) => node.id === id)
    const old = list[index]
    const arrows = this.strokeOf(replacement)?.arrows
    replacement.appearance = structuredClone(old.appearance)
    const stroke = this.strokeOf(replacement)
    if (stroke && arrows) stroke.arrows = arrows
    if (replacement.kind === 'dimension') {
      const fill = this.fillOf(replacement)
      if (fill) fill.enabled = false
    }
    list.splice(index, 1, replacement)
    this.selection = [replacement.id]
    this.emit()
  }

  setOpacity(value: number): void {
    this.guard(() => {
      if (!(value >= 0 && value <= 1)) throw new Error('Opacity is between 0 and 1')
      this.editSelected((node) => {
        node.opacity = value
      })
    })
  }

  toggleEffect(kind: EffectKind, enabled?: boolean): void {
    this.editSelected((node) => {
      const effect = this.effectOf(node, kind)
      if (effect) effect.enabled = enabled ?? !effect.enabled
    })
  }

  setEffect(kind: EffectKind, patch: Partial<Pick<EffectAttr, 'color' | 'opacity' | 'blur' | 'dx' | 'dy' | 'enabled'>>): void {
    this.editSelected((node) => {
      const effect = this.effectOf(node, kind)
      if (effect) Object.assign(effect, patch)
    })
  }

  enableEffect(kind: EffectKind): void {
    const node = this.one()
    if (!node) return
    this.toggleEffect(kind, true)
  }

  setBlend(mode: Doc['layers'][number]['blendMode']): void {
    this.editSelected((node) => {
      node.blendMode = mode
    })
  }

  setGradient(kind: Gradient['kind'] = 'linear', stops?: Gradient['stops']): void {
    this.editSelected((node) => {
      const fill = this.fillOf(node)
      if (!fill) return
      const bounds = commandsBounds(node.commands)
      fill.enabled = true
      fill.patternId = undefined
      fill.imageId = undefined
      const existing = fill.gradient
      fill.gradient = {
        kind,
        x1: existing?.x1 ?? bounds.x,
        y1: existing?.y1 ?? bounds.y + bounds.h / 2,
        x2: existing?.x2 ?? bounds.x + bounds.w,
        y2: existing?.y2 ?? bounds.y + bounds.h / 2,
        stops: stops ?? existing?.stops ?? [
          { offset: 0, color: structuredClone(fill.color) },
          { offset: 1, color: rgb(255, 255, 255, 1) },
        ],
      }
    })
  }

  setGradientStop(index: number, patch: { offset?: number; color?: Color }): void {
    this.editSelected((node) => {
      const fill = this.fillOf(node)
      const stop = fill?.gradient?.stops[index]
      if (stop) Object.assign(stop, patch)
    })
  }

  private applyGradientHandles(node: SceneNode, a: Pt, b: Pt): void {
    const fill = this.fillOf(node)
    if (!fill) return
    if (!fill.gradient) {
      fill.enabled = true
      fill.gradient = {
        kind: 'linear',
        x1: a.x,
        y1: a.y,
        x2: b.x,
        y2: b.y,
        stops: [
          { offset: 0, color: structuredClone(fill.color) },
          { offset: 1, color: rgb(255, 255, 255, 1) },
        ],
      }
    }
    fill.gradient.x1 = a.x
    fill.gradient.y1 = a.y
    fill.gradient.x2 = b.x
    fill.gradient.y2 = b.y
  }

  setGradientHandles(x1: number, y1: number, x2: number, y2: number): void {
    this.editSelected((node) => this.applyGradientHandles(node, { x: x1, y: y1 }, { x: x2, y: y2 }))
  }

  setPattern(id: string): void {
    this.editSelected((node) => {
      const fill = this.fillOf(node)
      if (!fill) return
      fill.enabled = true
      fill.gradient = undefined
      fill.imageId = undefined
      fill.patternId = id
    })
  }

  /** Save the selected path as a pattern tile in the document palette. */
  savePattern(name: string): string | null {
    const node = this.one()
    if (!node || node.kind !== 'path') return null
    const bounds = commandsBounds(node.commands)
    const size = Math.max(4, Math.max(bounds.w, bounds.h))
    const id = uid('pat')
    this.snapshot()
    this.doc.patterns.push({ id, name, commands: translateCommands(node.commands, -bounds.x, -bounds.y), size })
    this.emit()
    return id
  }

  setImageFill(imageId: string): void {
    this.editSelected((node) => {
      const fill = this.fillOf(node)
      if (!fill) return
      fill.enabled = true
      fill.gradient = undefined
      fill.patternId = undefined
      fill.imageId = imageId
    })
  }

  // ---------- libraries ----------

  search(query: string, library?: string): CatalogItem[] {
    return searchCatalog([...CATALOG, ...this.customLibrary], query, library)
  }

  loadCatalog(): Promise<CatalogItem[]> {
    return loadCatalog().then((items) => {
      this.emit()
      return items
    })
  }

  placeSymbol(id: string, x?: number, y?: number, center = false): string {
    const item = [...CATALOG, ...this.customLibrary].find((entry) => entry.id === id)
    if (!item) throw new Error('Symbol not found')
    this.snapshot()
    const width = worldInchesToPaperPoints(item.worldWidth, this.doc.canvas.realInchesPerPoint)
    const height = worldInchesToPaperPoints(item.worldHeight, this.doc.canvas.realInchesPerPoint)
    if (x == null || y == null) {
      // No position given: drop it in the middle of what the user is looking at, stepping each repeat so copies do not stack.
      const at = this.viewCenter()
      const step = (12 * (this.placeCount++ % 8)) / this.view.zoom
      x = at.x - width / 2 + step
      y = at.y - height / 2 + step
      center = false
    }
    const sx = width / item.worldWidth
    const sy = height / item.worldHeight
    const node = makePath(item.name, center ? x - width / 2 : x, center ? y - height / 2 : y, scaleCommands(item.commands, sx, sy))
    node.symbolId = item.id
    if (item.fillCommands?.length) node.shade = scaleCommands(item.fillCommands, sx, sy)
    if (item.inkCommands?.length) node.ink = scaleCommands(item.inkCommands, sx, sy)
    const fill = this.fillOf(node)
    const stroke = this.strokeOf(node)
    const shaded = Boolean(node.shade?.length)
    if (fill) fill.enabled = shaded || item.source === 'generated' || item.source === 'custom'
    if (fill && fill.enabled) fill.color = shaded ? rgb(214, 224, 236, 1) : rgb(255, 255, 255, 1)
    if (stroke) {
      stroke.color = structuredClone(this.paint.stroke)
      // Match the library thumbnail: a stroke that stays visible on a symbol several feet wide.
      const span = Math.max(width, height)
      stroke.width = item.source === 'generated' ? 1 : symbolStrokeWidth(span)
    }
    if (item.text) node.labels = [{ ...makeLabel('text', this.doc.canvas, item.text), location: 'center', offset: 0 }]
    this.addNode(node)
    this.emit()
    return node.id
  }

  createLibrary(name: string, color = '#e7ebf0'): string {
    const id = uid('lib')
    this.customLibraries.push({ id, name: name.trim() || 'Library', color, items: [] })
    this.emit()
    return id
  }

  renameLibrary(id: string, name: string, color?: string): void {
    const library = this.customLibraries.find((item) => item.id === id)
    if (!library) return
    library.name = name.trim() || library.name
    if (color) library.color = color
    this.emit()
  }

  deleteLibrary(id: string): void {
    this.customLibraries = this.customLibraries.filter((item) => item.id !== id)
    this.emit()
  }

  /** Add the selected object to a custom library (the plus button). */
  addToLibrary(libraryId: string, name: string): void {
    this.guard(() => {
      const node = this.one()
      if (!node) throw new Error('Nothing selected')
      let library = this.customLibraries.find((item) => item.id === libraryId)
      if (!library) {
        const id = this.createLibrary('My shapes')
        library = this.customLibraries.find((item) => item.id === id)!
      }
      const bounds = commandsBounds(node.commands)
      const inchesW = paperPointsToWorldInches(bounds.w, this.doc.canvas.realInchesPerPoint)
      const inchesH = paperPointsToWorldInches(bounds.h, this.doc.canvas.realInchesPerPoint)
      library.items.push({
        id: uid('sym'),
        name,
        library: library.name,
        category: 'Custom',
        tags: ['custom', ...name.toLowerCase().split(/\s+/)],
        aliases: [],
        worldWidth: Math.max(0.1, inchesW),
        worldHeight: Math.max(0.1, inchesH),
        commands: scaleCommands(translateCommands(node.commands, -bounds.x, -bounds.y), inchesW / (bounds.w || 1), inchesH / (bounds.h || 1)),
        fillCommands: node.shade?.length ? scaleCommands(translateCommands(node.shade, -bounds.x, -bounds.y), inchesW / (bounds.w || 1), inchesH / (bounds.h || 1)) : [],
        inkCommands: node.ink?.length ? scaleCommands(translateCommands(node.ink, -bounds.x, -bounds.y), inchesW / (bounds.w || 1), inchesH / (bounds.h || 1)) : [],
        source: 'custom',
      })
      this.emit()
    })
  }

  saveCustomLibrary(name: string): void {
    const library = this.customLibraries[0] ?? this.customLibraries[this.customLibraries.push({ id: uid('lib'), name: 'My shapes', color: '#e7ebf0', items: [] }) - 1]
    this.addToLibrary(library.id, name)
  }

  exportLibrary(id: string): string {
    const library = this.customLibraries.find((item) => item.id === id)
    if (!library) throw new Error('Library not found')
    return JSON.stringify({ version: 1, library: { name: library.name, color: library.color, items: library.items } })
  }

  importLibrary(text: string): void {
    this.guard(() => {
      let parsed: { version?: number; library?: { name?: string; color?: string; items?: CatalogItem[] } }
      try {
        parsed = JSON.parse(text)
      } catch {
        throw new Error('File is not a Measured library')
      }
      if (!parsed?.library || !Array.isArray(parsed.library.items)) throw new Error('File is not a Measured library')
      const id = this.createLibrary(parsed.library.name ?? 'Imported', parsed.library.color)
      const library = this.customLibraries.find((item) => item.id === id)!
      library.items = parsed.library.items.map((item) => ({ ...item, id: uid('sym'), library: library.name, source: 'custom' as const }))
      this.emit()
    })
  }

  // ---------- export and import ----------

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

  /** One SVG per @slice:name.ext object. */
  sliceExports(): { filename: string; svg: string }[] {
    return this.slices().map((slice) => ({ filename: `${slice.name}.${slice.ext === 'svg' ? 'svg' : slice.ext}`, svg: this.exportSvg({ include: 'selection', selection: [slice.node.id] }) }))
  }

  /** One SVG per visible layer. */
  layerExports(): { filename: string; svg: string }[] {
    return this.doc.layers
      .filter((layer) => layer.visible && layer.children.length)
      .map((layer) => ({ filename: `${layer.name}.svg`, svg: this.exportSvg({ include: 'selection', selection: layer.children.map((node) => node.id) }) }))
  }

  serialize(): string {
    return JSON.stringify({ version: 1, document: this.doc } satisfies MeasuredFile)
  }

  /** Everything worth restoring on reload: all tabs, the active tab, custom libraries, and plugins. */
  serializeWorkspace(): string {
    const workspace: WorkspaceFile = { version: 1, workspace: true, docs: this.docs, active: this.active, customLibraries: this.customLibraries, plugins: this.plugins }
    return JSON.stringify(workspace)
  }

  /** Restore an autosaved workspace; older autosaves hold a single document and still load. */
  loadWorkspace(text: string): void {
    let parsed: Partial<WorkspaceFile> & Partial<MeasuredFile>
    try {
      parsed = JSON.parse(text) as Partial<WorkspaceFile> & Partial<MeasuredFile>
    } catch {
      throw new Error('Autosave is not readable')
    }
    if (!parsed.workspace) {
      this.loadText(text)
      return
    }
    const docs = Array.isArray(parsed.docs) ? parsed.docs.filter((doc) => doc?.layers && doc.canvas) : []
    if (!docs.length) throw new Error('Autosave has no documents')
    for (const doc of docs) {
      migrate(doc)
      this.detachDisjoint(doc)
    }
    this.docs = docs
    this.past = docs.map(() => [])
    this.future = docs.map(() => [])
    this.active = Math.min(Math.max(0, parsed.active ?? 0), docs.length - 1)
    this.selection = []
    if (Array.isArray(parsed.customLibraries)) this.customLibraries = parsed.customLibraries as CustomLibrary[]
    if (Array.isArray(parsed.plugins)) this.plugins = parsed.plugins
    this.emit()
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
      migrate(parsed.document)
      this.detachDisjoint(parsed.document)
      this.snapshot()
      this.docs[this.active] = parsed.document
      this.selection = []
      this.emit()
    })
  }

  importPsd(bytes: Uint8Array, name = 'PSD image'): void {
    this.guard(() => {
      const size = importPsd(bytes)
      this.snapshot()
      const node = makeRect(0, 0, size.width, size.height)
      node.name = name
      node.imageWidth = size.width
      node.imageHeight = size.height
      this.addNode(node)
      this.emit()
    })
  }

  importSvg(text: string, name = 'SVG'): string {
    let id = ''
    this.guard(() => {
      const parsed = svgToCommands(text)
      if (!parsed.commands.length) throw new Error('No paths were found in the SVG')
      this.snapshot()
      const node = makePath(name, 48, 48, parsed.commands)
      const fill = this.fillOf(node)
      if (fill) fill.enabled = false
      this.addNode(node)
      id = node.id
      this.emit()
    })
    return id
  }

  /** Place a raster image. `href` is a data URL kept in the document. */
  importImage(href: string, width: number, height: number, name = 'Image'): string {
    const id = uid('img')
    this.snapshot()
    this.doc.images[id] = href
    const node = makeRect(48, 48, width, height)
    node.kind = 'image'
    node.imageId = id
    node.imageWidth = width
    node.imageHeight = height
    node.name = name
    const stroke = this.strokeOf(node)
    if (stroke) stroke.enabled = false
    this.addNode(node)
    this.emit()
    return node.id
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

  /** PDF pages cannot be rasterized in the browser without a plug-in; place a page-sized frame. */
  importPdfPage(width: number, height: number, name = 'PDF page'): string {
    this.snapshot()
    const node = makeRect(48, 48, width, height)
    node.name = `${name} (placeholder)`
    const fill = this.fillOf(node)
    if (fill) fill.color = rgb(245, 245, 245, 1)
    this.addNode(node)
    this.banner = LIMITATIONS['pdf-import']
    this.emit()
    return node.id
  }

  limitation(topic: string): string {
    return LIMITATIONS[topic] ?? 'This is not available in the browser.'
  }

  // ---------- plugins ----------

  runPlugin(code: string): void {
    const api = {
      createRect: (x: number, y: number, w: number, h: number) => {
        this.snapshot()
        const node = makeRect(x, y, w, h)
        this.addNode(node)
        return node.id
      },
      createEllipse: (x: number, y: number, w: number, h: number) => {
        this.snapshot()
        const node = makeEllipse(x, y, w, h)
        this.addNode(node)
        return node.id
      },
      createText: (x: number, y: number, content: string) => {
        this.snapshot()
        const node = this.shapeFromDrag({ x, y }, { x, y }, { cx: 0, cy: 0, type: 'mouse', button: 0, shift: false, alt: false, meta: false, pressure: 0, pointerId: 0 })
        if (node.text) node.text.content = content
        this.addNode(node)
        return node.id
      },
      setScale: (value: number) => this.setScale(value),
      placeSymbol: (id: string, x: number, y: number) => this.placeSymbol(id, x, y),
      getSelection: () => [...this.selection],
      select: (ids: string[]) => {
        this.selection = ids.filter((id) => findNode(this.doc, id))
      },
      setFill: (hex: string) => this.setFillHex(hex),
      setStroke: (hex: string, width?: number) => {
        this.setStrokeHex(hex)
        if (width != null) this.setStroke({ width })
      },
      move: (dx: number, dy: number) => this.nudge(dx, dy),
      getDocument: () => structuredClone(this.doc),
      alert: (message: string) => {
        this.banner = String(message)
      },
    }
    try {
      const fn = new Function('api', 'window', 'document', 'globalThis', `"use strict";\n${code}`)
      fn(api, undefined, undefined, undefined)
      if (!this.banner) this.banner = null
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

  // ---------- numeric fields ----------

  /** Bounds of the selection in paper points, for the options bar. */
  /**
   * What the X/Y/W/H fields show: the position of the selection's bounding box, and for a single
   * object its own width and height (so a rotated 5 in × 20 in rectangle still reads 5 in × 20 in).
   */
  selectionRect(): Rect | null {
    if (!this.selection.length) return null
    const box = selectionBounds(this.doc, this.selection)
    const node = this.selection.length === 1 ? this.one() : undefined
    if (node && node.kind !== 'group' && node.kind !== 'dimension' && node.rotation !== 0) {
      const local = localBounds(node)
      return { x: box.x, y: box.y, w: local.w, h: local.h }
    }
    return box
  }

  setNumber(field: 'width' | 'height' | 'x' | 'y' | 'rotation', raw: string): void {
    this.guard(() => {
      const nodes = selectedNodes(this.doc, this.selection)
      if (!nodes.length) throw new Error('Nothing selected')
      if (field === 'rotation') {
        const degrees = Number(String(raw).replace(/[^\d.-]/g, ''))
        if (!Number.isFinite(degrees)) throw new Error('Enter an angle in degrees')
        this.snapshot()
        const target = (degrees * Math.PI) / 180
        for (const node of nodes) {
          // Turn about the object's own center; groups turn their children since they carry no angle.
          const center = localToPaper(node, pivotOf(node))
          rotateNode(node, node.kind === 'group' ? target : target - node.rotation, center)
        }
        this.emit()
        return
      }
      const points = this.pointsFor(raw)
      this.snapshot()
      const union = this.selectionRect()!
      if (field === 'x' || field === 'y') {
        const delta = field === 'x' ? points - union.x : points - union.y
        for (const node of nodes) {
          if (field === 'x') node.x += delta
          else node.y += delta
          if (node.dimension) {
            if (field === 'x') {
              node.dimension.x1 += delta
              node.dimension.x2 += delta
            } else {
              node.dimension.y1 += delta
              node.dimension.y2 += delta
            }
          }
        }
        this.emit()
        return
      }
      if (!(points > 0)) throw new Error('Size must be positive')
      const factor = field === 'width' ? points / (union.w || 1) : points / (union.h || 1)
      transformNodes(nodes, { ...IDENTITY_STEP, scaleX: field === 'width' ? factor : 1, scaleY: field === 'height' ? factor : 1, origin: 'nw' })
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

  // ---------- keyboard ----------

  key(key: string, mods: { shift?: boolean; alt?: boolean; meta?: boolean }, viewport?: { width: number; height: number }, code?: string): void {
    // Option on macOS turns letters into symbols ("˜", "∑"), so Alt shortcuts match the physical key as well.
    const lower = mods.alt && code?.startsWith('Key') ? code.slice(3).toLowerCase() : key.toLowerCase()
    if (lower === 'escape') this.cancel()
    if ((lower === 'z' && mods.meta && !mods.shift) || lower === 'undo') this.undo()
    if ((lower === 'z' && mods.meta && mods.shift) || lower === 'redo') this.redo()
    if (lower === 'enter') this.commitPen()
    if (lower === 'backspace' || lower === 'delete') {
      if (this.anchor && this.tool === 'pathSelect') this.deleteAnchor()
      else this.deleteSelection()
    }
    if (mods.alt && lower === 'n') this.newDocument('letter')
    if (mods.alt && lower === 'w') this.closeDocument()
    if (mods.meta && lower === 'a') this.selectAll()
    if (mods.meta && lower === 'c') this.copy()
    if (mods.meta && lower === 'x') this.cut()
    if (mods.meta && lower === 'v' && !mods.shift) this.paste(viewport)
    if (mods.meta && lower === 'v' && mods.shift) this.pasteInPlace()
    if (mods.meta && lower === 'd') this.smartDuplicate()
    if (mods.meta && lower === 'g' && !mods.shift) this.group()
    if (mods.meta && lower === 'g' && mods.shift) this.ungroup()
    if (mods.meta && lower === ']') this.arrange(mods.shift ? 'front' : 'forward')
    if (mods.meta && lower === '[') this.arrange(mods.shift ? 'back' : 'backward')
    if (mods.meta && lower === 'j') this.connectEndpoints()
    if (mods.meta && lower === '8') this.compound()
    const nudge = mods.shift ? 10 : 1
    if (lower === 'arrowleft') this.nudge(-nudge, 0)
    if (lower === 'arrowright') this.nudge(nudge, 0)
    if (lower === 'arrowup') this.nudge(0, -nudge)
    if (lower === 'arrowdown') this.nudge(0, nudge)
    if (lower === ' ') this.spaceDown = true
    if (!mods.meta && !mods.alt && TOOL_KEYS[lower]) this.setTool(TOOL_KEYS[lower])
    this.emit()
  }

  keyUp(key: string): void {
    if (key === ' ') this.spaceDown = false
  }

  commitPen(): void {
    if (this.pen.length < 2) return
    const commands = this.pen
    this.pen = []
    this.preview = null
    try {
      this.place(this.paintNew(makePath('Path', 0, 0, commands)))
    } catch (error) {
      this.banner = error instanceof Error ? error.message : 'Could not finish the path'
    }
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
    this.anchor = null
    this.emit()
  }

  // ---------- labels ----------

  labelsOf(node: SceneNode): ObjectLabel[] {
    return nodeLabels(node)
  }

  /** Add a label (width, height, size, area, length, or text) to each selected object. */
  addLabel(kind: LabelKind, text = ''): void {
    const nodes = selectedNodes(this.doc, this.selection)
    if (!nodes.length) return
    this.snapshot()
    for (const node of nodes) {
      const labels = nodeLabels(node).filter((label) => label.kind !== kind || kind === 'text')
      labels.push(makeLabel(kind, this.doc.canvas, text))
      node.labels = labels
      node.label = undefined
    }
    this.emit()
  }

  /** Replace all labels with one, kept for older callers and tests. */
  setLabel(kind: LabelKind, text = ''): void {
    const nodes = selectedNodes(this.doc, this.selection)
    if (!nodes.length) return
    this.snapshot()
    for (const node of nodes) {
      node.labels = [makeLabel(kind, this.doc.canvas, text)]
      node.label = undefined
    }
    this.emit()
  }

  updateLabel(index: number, patch: Partial<Omit<ObjectLabel, 'precision'>> & { precision?: Partial<ObjectLabel['precision']> }): void {
    const node = this.one()
    if (!node) return
    const labels = nodeLabels(node)
    const label = labels[index]
    if (!label) return
    this.snapshot()
    const { precision, ...rest } = patch
    Object.assign(label, rest)
    if (precision) Object.assign(label.precision, precision)
    node.labels = labels
    node.label = undefined
    this.emit()
  }

  removeLabel(index: number): void {
    const node = this.one()
    if (!node) return
    this.snapshot()
    node.labels = nodeLabels(node).filter((_, i) => i !== index)
    node.label = undefined
    this.emit()
  }

  clearLabels(): void {
    const nodes = selectedNodes(this.doc, this.selection)
    if (!nodes.length) return
    this.snapshot()
    for (const node of nodes) {
      node.labels = []
      node.label = undefined
    }
    this.emit()
  }

  /** Text of the first label (older callers) or of a specific label. */
  labelText(node: SceneNode, label?: ObjectLabel): string {
    const target = label ?? nodeLabels(node)[0]
    if (!target) return ''
    return labelTextFor(node, target, this.doc.canvas)
  }

  clipSelection(): void {
    const nodes = selectedNodes(this.doc, this.selection)
    if (nodes.length < 2) {
      this.banner = 'Select the shape to mask with and at least one shape behind it, then choose Mask.'
      this.emit()
      return
    }
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

  releaseClip(): void {
    const node = this.one()
    if (!node || !node.clip) return
    this.snapshot()
    node.clip = false
    this.ungroup()
  }

  seedPaintError(): void {
    const node = makeRect(10, 10, 20, 20)
    node.paintError = true
    node.name = 'Bad paint'
    activeLayer(this.doc).children.push(node)
    this.emit()
  }

  one(): SceneNode | undefined {
    return this.selection.length ? findNode(this.doc, this.selection[0]) : undefined
  }

  hexOf(color: Color | null): string {
    return color ? toHex(color) : '#000000'
  }

  nodeLengthOf(node: SceneNode): number {
    return nodeLength(node)
  }
}

function containsNode(node: SceneNode, id: string): boolean {
  return node.children.some((child) => child.id === id || containsNode(child, id))
}

function selectionBoundsOf(nodes: SceneNode[]): Rect {
  const boxes = nodes.map((node) => paperBounds(node))
  const x = Math.min(...boxes.map((b) => b.x))
  const y = Math.min(...boxes.map((b) => b.y))
  return { x, y, w: Math.max(...boxes.map((b) => b.x + b.w)) - x, h: Math.max(...boxes.map((b) => b.y + b.h)) - y }
}

export function dashPresetOf(dash: number[]): DashPreset {
  if (!dash.length) return 'solid'
  return dash[0] <= 2 ? 'dotted' : 'dashed'
}

/** Fill in fields added after a file was saved. */
function migrate(doc: Doc): void {
  const canvas = doc.canvas as Partial<CanvasSettings>
  if (!canvas.style) canvas.style = 'plain'
  if (!canvas.colorMode) canvas.colorMode = 'rgb'
  if (canvas.showRulers == null) canvas.showRulers = true
  if (canvas.smartGuides == null) canvas.smartGuides = true
  if (canvas.grid && canvas.grid.snapWorldInches === undefined) canvas.grid.snapWorldInches = null
  eachNode(doc, (node) => {
    if (node.label && !node.labels) {
      node.labels = [{ ...node.label, location: node.label.location ?? (node.label.kind === 'height' ? 'left' : 'top') }]
      node.label = undefined
    }
    for (const label of node.labels ?? []) if (!label.location) label.location = label.kind === 'height' ? 'left' : 'top'
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

export { exportTiff, importPsd, looksLikePsd, requireNode, cssOf, paperCommands }
