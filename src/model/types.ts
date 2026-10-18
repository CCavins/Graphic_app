export type ID = string

export type BaseUnit = 'px' | 'in' | 'cm' | 'mm'
export type LabelUnit = 'px' | 'in' | 'ft' | 'ft-in' | 'yd' | 'mi' | 'mm' | 'cm' | 'm' | 'km'

export interface RGB {
  space: 'rgb'
  r: number
  g: number
  b: number
  a: number
}

export interface CMYK {
  space: 'cmyk'
  c: number
  m: number
  y: number
  k: number
  a: number
}

export type Color = RGB | CMYK

export interface Gradient {
  kind: 'linear' | 'radial' | 'angle'
  stops: { offset: number; color: Color }[]
  x1: number
  y1: number
  x2: number
  y2: number
}

export interface Brush {
  diameter: number
  angle: number
  roundness: number
  minWidth: number
}

export const BLEND_MODES = [
  'normal',
  'multiply',
  'screen',
  'overlay',
  'darken',
  'lighten',
  'color-dodge',
  'color-burn',
  'hard-light',
  'soft-light',
  'difference',
  'exclusion',
  'hue',
  'saturation',
  'color',
  'luminosity',
  'linear-burn',
  'linear-dodge',
  'vivid-light',
  'linear-light',
  'pin-light',
  'darker-color',
  'lighter-color',
] as const

export type BlendMode = (typeof BLEND_MODES)[number]

export const APPROXIMATE_BLEND = new Set<BlendMode>([
  'linear-burn',
  'linear-dodge',
  'vivid-light',
  'linear-light',
  'pin-light',
  'darker-color',
  'lighter-color',
])

export type EffectKind = 'dropShadow' | 'innerShadow' | 'outerGlow' | 'innerGlow' | 'blur'

export interface FillAttr {
  id: ID
  kind: 'fill'
  enabled: boolean
  color: Color
  opacity: number
  gradient?: Gradient
  patternId?: string
  imageId?: string
}

export interface StrokeAttr {
  id: ID
  kind: 'stroke'
  enabled: boolean
  color: Color
  opacity: number
  width: number
  align: 'center' | 'inner' | 'outer'
  dash: number[]
  arrows: 'none' | 'start' | 'end' | 'both'
  brush?: Brush
}

export interface EffectAttr {
  id: ID
  kind: EffectKind
  enabled: boolean
  color: Color
  opacity: number
  blur: number
  dx: number
  dy: number
}

export type AppearanceItem = FillAttr | StrokeAttr | EffectAttr

export interface Cmd {
  c: 'M' | 'L' | 'C' | 'Z'
  x: number
  y: number
  x1: number
  y1: number
  x2: number
  y2: number
}

export interface Precision {
  mode: 'decimal' | 'fraction'
  decimals: number
  denominator: 2 | 4 | 8 | 16 | 32
  trimZeros: boolean
}

export type LabelKind = 'length' | 'width' | 'height' | 'size' | 'area' | 'text'
export type LabelLocation = 'top' | 'bottom' | 'left' | 'right' | 'center'

export interface ObjectLabel {
  kind: LabelKind
  text: string
  /** Which edge of the object's bounds the label sits on. */
  location: LabelLocation
  offset: number
  align: 'horizontal' | 'vertical' | 'parallel' | 'perpendicular' | 'centered'
  showUnits: boolean
  precision: Precision
}

export interface TextSpan {
  start: number
  end: number
  bold?: boolean
  italic?: boolean
  underline?: boolean
  color?: Color
}

/** The last duplicate-plus-transform step, replayed by Smart Duplicate. */
export interface TransformStep {
  dx: number
  dy: number
  rotate: number
  scaleX: number
  scaleY: number
  shearX: number
  shearY: number
  origin: TransformOrigin
}

export type TransformOrigin = 'nw' | 'n' | 'ne' | 'w' | 'c' | 'e' | 'sw' | 's' | 'se'

export interface DimensionData {
  x1: number
  y1: number
  x2: number
  y2: number
  offset: number
}

export interface TextData {
  content: string
  fontFamily: string
  fontStyle: string
  fontSize: number
  align: 'left' | 'center' | 'right' | 'justify'
  lineSpacing: number
  charSpacing: number
  mode: 'box' | 'field'
  fieldWidth: number
  onPath: boolean
  path: Cmd[]
  pathOffset: number
  color?: Color
  /** Character ranges with their own style, from highlighting part of the text. */
  spans?: TextSpan[]
}

export interface SceneNode {
  id: ID
  name: string
  kind: 'path' | 'text' | 'image' | 'group' | 'dimension'
  x: number
  y: number
  rotation: number
  visible: boolean
  locked: boolean
  opacity: number
  blendMode: BlendMode
  commands: Cmd[]
  /** Closed regions drawn with the fill, for library symbols that are shaded rather than pure line art. */
  shade?: Cmd[]
  /** Solid details drawn in the stroke color, such as a drain or a filled icon mark. */
  ink?: Cmd[]
  children: SceneNode[]
  clip: boolean
  appearance: AppearanceItem[]
  /** Older files stored one label here. `labels` is the current list. */
  label?: ObjectLabel
  labels?: ObjectLabel[]
  dimension?: DimensionData
  text?: TextData
  imageId?: string
  imageWidth?: number
  imageHeight?: number
  symbolId?: string
  paintError?: boolean
  pressures?: number[]
}

export interface Layer {
  id: ID
  name: string
  visible: boolean
  locked: boolean
  opacity: number
  blendMode: BlendMode
  children: SceneNode[]
}

export interface Guide {
  id: ID
  axis: 'h' | 'v'
  at: number
}

export interface GridSettings {
  show: boolean
  snap: boolean
  snapPoints: boolean
  /** World inches between snap positions. Null keeps the cursor free. */
  snapWorldInches: number | null
  spacingX: number
  spacingY: number
  subdivisions: number
  margins: { top: number; right: number; bottom: number; left: number }
  extend: boolean
  originFromMargin: boolean
}

export interface CanvasSettings {
  width: number
  height: number
  baseUnit: BaseUnit
  /** World inches represented by one paper point. */
  realInchesPerPoint: number
  /** The statement the user typed for the scale, e.g. "1/4 in = 1 ft", echoed back in the Properties pane. */
  scaleStatement?: string
  /** Label unit that the last scale statement chose, so a later statement may change it again while a manual choice is kept. */
  scaleLabelUnit?: LabelUnit
  labelUnit: LabelUnit
  precision: Precision
  showUnits: boolean
  background: Color
  grid: GridSettings
  pixelAlignStrokes: boolean
  selectionColor: string
  colorPicker: 'popup' | 'panel'
  viewMode: 'vector' | 'pixels' | 'outline'
  /** Canvas style from the New Document dialog. */
  style: CanvasStyle
  colorMode: 'rgb' | 'cmyk'
  showRulers: boolean
  smartGuides: boolean
}

export type CanvasStyle = 'plain' | 'graph' | 'notebook' | 'blueprint'

export interface SavedStyle {
  id: ID
  name: string
  appearance: AppearanceItem[]
}

export interface PatternDef {
  id: ID
  name: string
  /** Saved from the selection: a tile of paths in paper points. */
  commands?: Cmd[]
  size?: number
}

export interface Doc {
  id: ID
  name: string
  canvas: CanvasSettings
  layers: Layer[]
  activeLayerId: ID
  guides: Guide[]
  styles: SavedStyle[]
  patterns: PatternDef[]
  images: Record<string, string>
}

export interface MeasuredFile {
  version: 1
  document: Doc
}

/** Everything the app restores on reload: every open tab, which one is active, custom libraries, and plugins. */
export interface WorkspaceFile {
  version: 1
  workspace: true
  docs: Doc[]
  active: number
  customLibraries: unknown[]
  plugins: { id: string; name: string; code: string }[]
}

export interface Pt {
  x: number
  y: number
}

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export const MAX_CANVAS = 16000
export const APPEARANCE_CAP = 12
export const HISTORY_CAP = 200
export const MIN_ZOOM = 0.1
export const MAX_ZOOM = 64
export const PT_PER_IN = 72

let seq = 0
export function uid(prefix = 'n'): ID {
  seq += 1
  return `${prefix}${seq.toString(36)}`
}

export function resetIds(start = 0): void {
  seq = start
}
