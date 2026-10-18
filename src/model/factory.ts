import { rgb } from './color'
import { arcCommands, ellipseCommands, polygonCommands, rectCommands, starCommands } from './geometry'
import type {
  AppearanceItem,
  BaseUnit,
  CanvasSettings,
  CanvasStyle,
  Doc,
  EffectKind,
  LabelUnit,
  Layer,
  Precision,
  SceneNode,
} from './types'
import { uid } from './types'
import { oneToOneScale } from './units'

export const defaultPrecision = (): Precision => ({
  mode: 'decimal',
  decimals: 2,
  denominator: 16,
  trimZeros: true,
})

function effect(kind: EffectKind): AppearanceItem {
  return {
    id: uid('a'),
    kind,
    enabled: false,
    color: kind === 'blur' ? rgb(0, 0, 0, 1) : rgb(0, 0, 0, 0.35),
    opacity: 1,
    blur: kind === 'blur' ? 4 : 8,
    dx: kind === 'dropShadow' ? 4 : 0,
    dy: kind === 'dropShadow' ? 4 : 0,
  }
}

export function defaultAppearance(): AppearanceItem[] {
  return [
    { id: uid('a'), kind: 'fill', enabled: true, color: rgb(30, 64, 120, 1), opacity: 1 },
    {
      id: uid('a'),
      kind: 'stroke',
      enabled: true,
      color: rgb(20, 32, 48, 1),
      opacity: 1,
      width: 1,
      align: 'center',
      dash: [],
      arrows: 'none',
    },
    effect('dropShadow'),
    effect('innerShadow'),
    effect('outerGlow'),
    effect('innerGlow'),
    effect('blur'),
  ]
}

export function baseNode(partial: Partial<SceneNode> & Pick<SceneNode, 'kind' | 'name'>): SceneNode {
  return {
    id: uid('n'),
    x: 0,
    y: 0,
    rotation: 0,
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    commands: [],
    children: [],
    clip: false,
    appearance: defaultAppearance(),
    ...partial,
  }
}

export function makePath(name: string, x: number, y: number, commands: SceneNode['commands']): SceneNode {
  return baseNode({ kind: 'path', name, x, y, commands })
}

export function makeRect(x: number, y: number, w: number, h: number, radius = 0): SceneNode {
  return makePath(radius > 0 ? 'Rounded rectangle' : 'Rectangle', x, y, rectCommands(w, h, radius))
}

export function makeEllipse(x: number, y: number, w: number, h: number): SceneNode {
  return makePath('Ellipse', x, y, ellipseCommands(w, h))
}

export function makePolygon(x: number, y: number, w: number, h: number, sides: number): SceneNode {
  return makePath('Polygon', x, y, polygonCommands(w, h, sides))
}

export function makeStar(x: number, y: number, w: number, h: number, points: number, innerRadius = 0.4): SceneNode {
  return makePath('Star', x, y, starCommands(w, h, points, innerRadius))
}

export function makeArc(x: number, y: number, w: number, h: number, mode: 'open' | 'pie' | 'chord' = 'open'): SceneNode {
  const node = makePath('Arc', x, y, arcCommands(w, h, mode))
  const fill = node.appearance.find((a) => a.kind === 'fill')
  if (fill && fill.kind === 'fill') fill.enabled = mode !== 'open'
  return node
}

export function makeLine(x1: number, y1: number, x2: number, y2: number, arrows: 'none' | 'end' = 'none'): SceneNode {
  const node = makePath('Line', x1, y1, [
    { c: 'M', x: 0, y: 0, x1: 0, y1: 0, x2: 0, y2: 0 },
    { c: 'L', x: x2 - x1, y: y2 - y1, x1: 0, y1: 0, x2: 0, y2: 0 },
  ])
  const fill = node.appearance.find((a) => a.kind === 'fill')
  if (fill && fill.kind === 'fill') fill.enabled = false
  const stroke = node.appearance.find((a) => a.kind === 'stroke')
  if (stroke && stroke.kind === 'stroke') stroke.arrows = arrows === 'end' ? 'end' : 'none'
  return node
}

export function makeDimension(x1: number, y1: number, x2: number, y2: number, offset = 24): SceneNode {
  const node = baseNode({
    kind: 'dimension',
    name: 'Dimension',
    x: 0,
    y: 0,
    commands: [],
    dimension: { x1, y1, x2, y2, offset },
  })
  const fill = node.appearance.find((a) => a.kind === 'fill')
  if (fill && fill.kind === 'fill') fill.enabled = false
  return node
}

/** The label unit a fresh document uses for a given ruler unit. */
export function defaultLabelUnit(baseUnit: BaseUnit): LabelUnit {
  return baseUnit === 'px' ? 'px' : baseUnit === 'mm' ? 'mm' : baseUnit === 'cm' ? 'cm' : 'in'
}

export function defaultCanvas(width: number, height: number, baseUnit: BaseUnit): CanvasSettings {
  return {
    width,
    height,
    baseUnit,
    realInchesPerPoint: oneToOneScale(),
    labelUnit: defaultLabelUnit(baseUnit),
    precision: defaultPrecision(),
    showUnits: true,
    background: rgb(255, 255, 255, 1),
    grid: {
      show: true,
      snap: false,
      snapPoints: false,
      snapWorldInches: null,
      spacingX: baseUnit === 'px' ? 8 : 36,
      spacingY: baseUnit === 'px' ? 8 : 36,
      subdivisions: 4,
      margins: { top: 36, right: 36, bottom: 36, left: 36 },
      extend: false,
      originFromMargin: false,
    },
    pixelAlignStrokes: false,
    selectionColor: '#1d4e89',
    colorPicker: 'popup',
    viewMode: 'vector',
    style: 'plain',
    colorMode: 'rgb',
    showRulers: true,
    smartGuides: true,
  }
}

/** Apply one of the New Document canvas styles: grid spacing, background, and visibility. */
export function applyCanvasStyle(canvas: CanvasSettings, style: CanvasStyle): void {
  canvas.style = style
  if (style === 'plain') {
    canvas.grid.show = false
    canvas.background = rgb(255, 255, 255, 1)
  }
  if (style === 'graph') {
    canvas.grid.show = true
    canvas.grid.spacingX = canvas.baseUnit === 'px' ? 20 : 18
    canvas.grid.spacingY = canvas.grid.spacingX
    canvas.grid.extend = true
    canvas.background = rgb(255, 255, 255, 1)
  }
  if (style === 'notebook') {
    canvas.grid.show = true
    canvas.grid.spacingX = 0
    canvas.grid.spacingY = 24
    canvas.grid.extend = true
    canvas.background = rgb(253, 252, 245, 1)
  }
  if (style === 'blueprint') {
    canvas.grid.show = true
    canvas.grid.spacingX = 36
    canvas.grid.spacingY = 36
    canvas.grid.extend = true
    canvas.background = rgb(28, 68, 128, 1)
  }
}

export interface Preset {
  id: string
  name: string
  width: number
  height: number
  baseUnit: BaseUnit
  group: 'Print' | 'Screen' | 'Other'
}

export const PRESETS: Preset[] = [
  { id: 'letter', name: 'Letter', width: 11 * 72, height: 8.5 * 72, baseUnit: 'in', group: 'Print' },
  { id: 'legal', name: 'Legal', width: 14 * 72, height: 8.5 * 72, baseUnit: 'in', group: 'Print' },
  { id: 'tabloid', name: 'Tabloid', width: 17 * 72, height: 11 * 72, baseUnit: 'in', group: 'Print' },
  { id: 'a3', name: 'A3', width: (420 / 25.4) * 72, height: (297 / 25.4) * 72, baseUnit: 'mm', group: 'Print' },
  { id: 'a4', name: 'A4', width: (210 / 25.4) * 72, height: (297 / 25.4) * 72, baseUnit: 'mm', group: 'Print' },
  { id: 'a5', name: 'A5', width: (148 / 25.4) * 72, height: (210 / 25.4) * 72, baseUnit: 'mm', group: 'Print' },
  { id: 'arch-d', name: 'Arch D 24 x 36', width: 36 * 72, height: 24 * 72, baseUnit: 'in', group: 'Print' },
  { id: 'iphone', name: 'iPhone', width: 390, height: 844, baseUnit: 'px', group: 'Screen' },
  { id: 'ipad', name: 'iPad', width: 1024, height: 1366, baseUnit: 'px', group: 'Screen' },
  { id: 'hd', name: 'HD 1920 x 1080', width: 1920, height: 1080, baseUnit: 'px', group: 'Screen' },
  { id: 'icon', name: 'Icon 1024', width: 1024, height: 1024, baseUnit: 'px', group: 'Screen' },
  { id: 'custom', name: 'Custom', width: 800, height: 600, baseUnit: 'px', group: 'Other' },
]

export interface NewDocumentOptions {
  preset?: string
  name?: string
  width?: number
  height?: number
  baseUnit?: BaseUnit
  orientation?: 'portrait' | 'landscape'
  style?: CanvasStyle
  colorMode?: 'rgb' | 'cmyk'
}

export function makeLayer(name: string): Layer {
  return { id: uid('l'), name, visible: true, locked: false, opacity: 1, blendMode: 'normal', children: [] }
}

export function makeDocument(presetOrOptions: string | NewDocumentOptions = 'letter', name = 'Untitled'): Doc {
  const options: NewDocumentOptions = typeof presetOrOptions === 'string' ? { preset: presetOrOptions, name } : presetOrOptions
  const preset = PRESETS.find((p) => p.id === options.preset) ?? PRESETS[0]
  const layer = makeLayer('Layer 1')
  let width = options.width ?? preset.width
  let height = options.height ?? preset.height
  if (options.orientation === 'portrait' && width > height) [width, height] = [height, width]
  if (options.orientation === 'landscape' && height > width) [width, height] = [height, width]
  const canvas = defaultCanvas(width, height, options.baseUnit ?? preset.baseUnit)
  canvas.colorMode = options.colorMode ?? 'rgb'
  applyCanvasStyle(canvas, options.style ?? 'plain')
  return {
    id: uid('d'),
    name: options.name ?? name,
    canvas,
    layers: [layer],
    activeLayerId: layer.id,
    guides: [],
    styles: [],
    patterns: [
      { id: 'stripes', name: 'Stripes' },
      { id: 'dots', name: 'Dots' },
      { id: 'grid', name: 'Grid' },
      { id: 'crosshatch', name: 'Crosshatch' },
    ],
    images: {},
  }
}

export function activeLayer(doc: Doc): Layer {
  return doc.layers.find((l) => l.id === doc.activeLayerId) ?? doc.layers[0]
}

export function eachNode(doc: Doc, visit: (node: SceneNode, list: SceneNode[]) => void): void {
  const walk = (list: SceneNode[]) => {
    for (const node of list) {
      visit(node, list)
      if (node.children.length) walk(node.children)
    }
  }
  for (const layer of doc.layers) walk(layer.children)
}

export function findNode(doc: Doc, id: string): SceneNode | undefined {
  let found: SceneNode | undefined
  eachNode(doc, (node) => {
    if (node.id === id) found = node
  })
  return found
}

export function parentList(doc: Doc, id: string): SceneNode[] | undefined {
  let found: SceneNode[] | undefined
  const walk = (list: SceneNode[]) => {
    if (list.some((n) => n.id === id)) found = list
    for (const node of list) if (node.children.length) walk(node.children)
  }
  for (const layer of doc.layers) walk(layer.children)
  return found
}

export function selectedNodes(doc: Doc, ids: string[]): SceneNode[] {
  return ids.map((id) => findNode(doc, id)).filter((n): n is SceneNode => Boolean(n))
}
