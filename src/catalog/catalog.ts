import { cmd, commandsBounds, ellipseCommands, polygonCommands, rectCommands, scaleCommands, translateCommands } from '../model/geometry'
import type { Cmd } from '../model/types'

export interface CatalogItem {
  id: string
  name: string
  /** Library name, matching Graphic's library list: Floor Plans, Symbols, App Mockups, Numbers, Custom. */
  library: string
  category: string
  tags: string[]
  aliases: string[]
  /** Real-world size in inches. */
  worldWidth: number
  worldHeight: number
  /** Path in world inches with the top-left corner at 0,0. */
  commands: Cmd[]
  /** Subset of the path that is shaded. Empty for line-art symbols. */
  fillCommands: Cmd[]
  /** Subset painted solid in the stroke color. */
  inkCommands: Cmd[]
  /** Optional label placed in the middle of the symbol (used by the Numbers library). */
  text?: string
  source?: 'drawio' | 'floorplansvg' | 'generated' | 'custom'
}

interface RawSymbol {
  id: string
  name: string
  lib: string
  cat: string
  tags: string[]
  s: number
  w: number
  h: number
  d: string
  f?: string
  k?: string
  src: 'drawio' | 'floorplansvg'
}

export const LIBRARIES = ['Floor Plans', 'Symbols', 'App Mockups', 'Numbers'] as const

/** Parse the compact path string stored in symbols.json into commands, scaled by `scale`. */
export function parsePathData(d: string, scale = 1): Cmd[] {
  const out: Cmd[] = []
  const re = /([MLCZ])((?:\s*-?\d*\.?\d+)*)/g
  let match: RegExpExecArray | null
  while ((match = re.exec(d))) {
    const nums = match[2].trim().split(/\s+/).filter(Boolean).map((value) => Number(value) * scale)
    if (match[1] === 'M') out.push(cmd('M', nums[0], nums[1]))
    else if (match[1] === 'L') out.push(cmd('L', nums[0], nums[1]))
    else if (match[1] === 'C') out.push(cmd('C', nums[4], nums[5], nums[0], nums[1], nums[2], nums[3]))
    else out.push(cmd('Z'))
  }
  return out
}

function fromRaw(raw: RawSymbol): CatalogItem {
  let parsed: Cmd[] | null = null
  const item: CatalogItem = {
    id: raw.id,
    name: raw.name,
    library: raw.lib,
    category: raw.cat,
    tags: raw.tags,
    aliases: [],
    worldWidth: Math.max(0.05, raw.w * raw.s),
    worldHeight: Math.max(0.05, raw.h * raw.s),
    commands: [],
    fillCommands: [],
    inkCommands: [],
    source: raw.src,
  }
  Object.defineProperty(item, 'commands', {
    enumerable: true,
    get() {
      if (!parsed) parsed = parsePathData(raw.d, raw.s)
      return parsed
    },
  })
  let parsedFill: Cmd[] | null = null
  let parsedInk: Cmd[] | null = null
  Object.defineProperty(item, 'fillCommands', {
    enumerable: true,
    get() {
      if (!parsedFill) parsedFill = raw.f ? parsePathData(raw.f, raw.s) : []
      return parsedFill
    },
  })
  Object.defineProperty(item, 'inkCommands', {
    enumerable: true,
    get() {
      if (!parsedInk) parsedInk = raw.k ? parsePathData(raw.k, raw.s) : []
      return parsedInk
    },
  })
  return item
}

/** Stretch commands so their bounds fill a size × size box. */
function fit(commands: Cmd[], size: number): Cmd[] {
  const bounds = commandsBounds(commands)
  return scaleCommands(translateCommands(commands, -bounds.x, -bounds.y), size / (bounds.w || 1), size / (bounds.h || 1))
}

/** Numbered markers, like Graphic's Numbers library: a shape with a centered number. */
function numbers(): CatalogItem[] {
  const items: CatalogItem[] = []
  const shapes: [string, (size: number) => Cmd[]][] = [
    ['Circle', (size) => ellipseCommands(size, size)],
    ['Square', (size) => rectCommands(size, size)],
    ['Rounded', (size) => rectCommands(size, size, size * 0.25)],
    ['Hexagon', (size) => fit(polygonCommands(size, size, 6), size)],
    ['Diamond', (size) => fit(polygonCommands(size, size, 4), size)],
  ]
  for (const [shape, build] of shapes) {
    for (let value = 1; value <= 40; value++) {
      items.push({
        id: `numbers-${shape.toLowerCase()}-${value}`,
        name: `${shape} ${value}`,
        library: 'Numbers',
        category: `Numbers ${shape}`,
        tags: ['number', 'marker', 'badge', shape.toLowerCase(), String(value)],
        aliases: ['callout', 'bubble'],
        worldWidth: 0.5,
        worldHeight: 0.5,
        commands: build(0.5),
        fillCommands: [],
        inkCommands: [],
        text: String(value),
        source: 'generated',
      })
    }
  }
  return items
}

/** Items available right away. Imported symbols are appended by `loadCatalog`. */
export const CATALOG: CatalogItem[] = numbers()

let loading: Promise<CatalogItem[]> | null = null
let loaded = false

export function catalogLoaded(): boolean {
  return loaded
}

/** Load the imported draw.io and FloorPlanSVGSymbols sets. Safe to call more than once. */
export function loadCatalog(): Promise<CatalogItem[]> {
  if (!loading) {
    loading = import('./symbols.json').then((module) => {
      const raw = (module.default ?? module) as unknown as RawSymbol[]
      const known = new Set(CATALOG.map((item) => item.id))
      for (const entry of raw) {
        if (known.has(entry.id)) continue
        known.add(entry.id)
        CATALOG.push(fromRaw(entry))
      }
      loaded = true
      return CATALOG
    })
  }
  return loading
}

export function searchCatalog(source: CatalogItem[], query: string, library?: string): CatalogItem[] {
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean)
  const scoped = library ? source.filter((item) => item.library === library) : source
  if (!terms.length) return scoped
  // Rank whole-word name matches ("Single Door") above substring hits ("Outdoor") and tag-only hits.
  const scored: { item: CatalogItem; score: number }[] = []
  for (const item of scoped) {
    const name = item.name.toLowerCase()
    const nameWords = name.split(/[\s/-]+/)
    const hay = `${name} ${item.category} ${item.library} ${item.tags.join(' ')} ${item.aliases.join(' ')}`.toLowerCase()
    let score = 0
    let ok = true
    for (const term of terms) {
      if (!hay.includes(term)) {
        ok = false
        break
      }
      if (name === term) score += 8
      else if (nameWords.includes(term)) score += 4
      else if (nameWords.some((word) => word.startsWith(term))) score += 3
      else if (name.includes(term)) score += 1
    }
    if (ok) scored.push({ item, score: score - name.length / 1000 })
  }
  return scored.sort((a, b) => b.score - a.score).map((entry) => entry.item)
}

export const CATALOG_ATTRIBUTION =
  'Symbol shapes: draw.io stencils © JGraph Ltd (CC BY 4.0) and FloorPlanSVGSymbols © 1337GameDev (MIT). See src/catalog/data/NOTICE.'
