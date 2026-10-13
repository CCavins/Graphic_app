/**
 * Build src/catalog/symbols.json from open-licensed symbol sets.
 *
 * Sources:
 *  - draw.io stencil XML (JGraph Ltd, CC BY 4.0, tag v24.7.17)
 *  - FloorPlanSVGSymbols (1337GameDev, MIT)
 *
 * Run: npx tsx scripts/import-symbols.ts
 * Set SYMBOL_CACHE=/path to reuse previously downloaded files.
 * Attribution and license texts live in src/catalog/data/NOTICE.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { PathBuilder, svgToCommands, xmlTags } from '../src/model/svg'

const DRAWIO_TAG = 'v24.7.17'
const DRAWIO_RAW = `https://raw.githubusercontent.com/jgraph/drawio/${DRAWIO_TAG}/src/main/webapp/stencils/`
const FLOOR_RAW = 'https://raw.githubusercontent.com/1337GameDev/FloorPlanSVGSymbols/main/Floor%20Plan%20Symbols/'
const cache = process.env.SYMBOL_CACHE || '/tmp/measured-symbols'

interface Source {
  file: string
  lib: 'Floor Plans' | 'Symbols' | 'App Mockups'
  cat: string
  /** world inches per stencil unit */
  scale: number
  tags: string[]
}

function pretty(name: string): string {
  return name
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/Iec/g, 'IEC')
    .replace(/Plc/g, 'PLC')
    .replace(/Din/g, 'DIN')
    .replace(/Iso/g, 'ISO')
}

const drawio: Source[] = [
  { file: 'floorplan.xml', lib: 'Floor Plans', cat: 'Floor plan', scale: 0.36, tags: ['floor plan', 'plan', 'furniture'] },
  { file: 'cabinets.xml', lib: 'Symbols', cat: 'Electrical cabinets', scale: 0.04, tags: ['electrical', 'cabinet', 'din'] },
  { file: 'basic.xml', lib: 'Symbols', cat: 'Basic shapes', scale: 0.02, tags: ['basic', 'shape', 'diagram'] },
  { file: 'arrows.xml', lib: 'Symbols', cat: 'Arrows', scale: 0.02, tags: ['arrow', 'annotation'] },
  { file: 'flowchart.xml', lib: 'Symbols', cat: 'Flowchart', scale: 0.02, tags: ['flowchart', 'diagram'] },
  { file: 'bpmn.xml', lib: 'Symbols', cat: 'BPMN', scale: 0.02, tags: ['bpmn', 'process', 'diagram'] },
  { file: 'networks.xml', lib: 'Symbols', cat: 'Networks', scale: 0.03, tags: ['network', 'it', 'device'] },
  { file: 'android/android.xml', lib: 'App Mockups', cat: 'Android', scale: 1 / 72, tags: ['android', 'mockup', 'ui'] },
  { file: 'ios7/icons.xml', lib: 'App Mockups', cat: 'iOS icons', scale: 1 / 72, tags: ['ios', 'icon', 'mockup'] },
  { file: 'ios7/misc.xml', lib: 'App Mockups', cat: 'iOS controls', scale: 1 / 72, tags: ['ios', 'control', 'mockup'] },
  ...[
    'abstract', 'capacitors', 'diodes', 'electro-mechanical', 'iec417', 'iec_logic_gates', 'inductors', 'instruments',
    'logic_gates', 'miscellaneous', 'mosfets1', 'mosfets2', 'op_amps', 'opto_electronics', 'plc_ladder',
    'power_semiconductors', 'radio', 'resistors', 'rot_mech', 'signal_sources', 'thermionic_devices', 'transistors',
    'transmission', 'waveforms',
  ].map((name): Source => ({ file: `electrical/${name}.xml`, lib: 'Symbols', cat: `Electrical ${pretty(name)}`, scale: 0.06, tags: ['electrical', 'schematic', pretty(name).toLowerCase()] })),
  ...['advertising', 'calendars', 'carousel', 'charts_and_tables', 'controls', 'form_elements', 'menus_and_buttons', 'misc', 'tabs'].map(
    (name): Source => ({ file: `mockup/${name}.xml`, lib: 'App Mockups', cat: `Mockup ${pretty(name)}`, scale: 1 / 72, tags: ['mockup', 'ui', 'wireframe', pretty(name).toLowerCase()] }),
  ),
  ...['animals', 'food', 'healthcare', 'nature', 'people', 'safety', 'science', 'sports', 'tech', 'transportation', 'travel'].map(
    (name): Source => ({ file: `signs/${name}.xml`, lib: 'Symbols', cat: `Signs ${pretty(name)}`, scale: 0.08, tags: ['sign', 'icon', 'pictogram', name] }),
  ),
  ...[
    'agitators', 'apparatus_elements', 'centrifuges', 'compressors', 'compressors_iso', 'crushers_grinding', 'driers', 'engines',
    'feeders', 'filters', 'fittings', 'flow_sensors', 'heat_exchangers', 'instruments', 'misc', 'mixers', 'piping', 'pumps',
    'pumps_din', 'pumps_iso', 'separators', 'shaping_machines', 'valves', 'vessels',
  ].map((name): Source => ({ file: `pid/${name}.xml`, lib: 'Symbols', cat: `P&ID ${pretty(name)}`, scale: 0.05, tags: ['pid', 'piping', 'process', pretty(name).toLowerCase()] })),
]

const floorSvgs = [
  '240vReceptacle', '4BladeFan', '5BladeFan', 'AC', 'AwningWindow', 'BifoldDoor', 'BifoldDoorFlipped', 'Cabinet', 'CasementWindow',
  'Chair', 'ChestFreezer', 'ClosetDoor', 'CouchCushion', 'CouchLeft', 'CouchMiddle', 'CouchRight', 'Dehumidifier', 'Dishwasher',
  'Doorbell', 'Double120vReceptacle-GFCI', 'Double120vReceptacle', 'DoubleHungWindow', 'DoubleSink', 'Dryer', 'ElectricalPanel',
  'EndTable', 'EntertainmentCenter', 'ExteriorLight', 'FixedWindow', 'FloodLight', 'Furnace', 'GenericAppliance', 'GenericAppliance2',
  'GenericWall', 'GenericWindow', 'HopperWindow', 'JalousieWindow', 'Lamp', 'LoungeChair', 'Microwave', 'MultiLightBar', 'OfficeChair',
  'OutdoorOverheadLight', 'OverheadLight', 'Pull Cord Switch', 'Pump', 'QueenBed', 'Refrigerator', 'SecurityCamera', 'Shower',
  'Single120vReceptacle', 'SingleDoor-NoWall', 'SingleDoor', 'Sink', 'SlidingWindow', 'SmokeDetector', 'Stove', 'StraightStairs',
  'Switch', 'TV', 'Table', 'Thermostat', 'Toilet', 'Tub', 'Vent', 'Washer', 'WaterHeater',
]
/** The MIT set is drawn at roughly 1:40, so one millimetre is about 0.6 real inches. */
const FLOOR_SCALE = 0.6

interface OutItem {
  id: string
  name: string
  lib: string
  cat: string
  tags: string[]
  s: number
  w: number
  h: number
  d: string
  src: 'drawio' | 'floorplansvg'
}

async function load(url: string, key: string): Promise<string | null> {
  const local = join(cache, key)
  if (existsSync(local)) return readFileSync(local, 'utf8')
  const response = await fetch(url)
  if (!response.ok) {
    console.warn(`skip ${key}: ${response.status}`)
    return null
  }
  const text = await response.text()
  mkdirSync(dirname(local), { recursive: true })
  writeFileSync(local, text)
  return text
}

function uniqueId(base: string, seen: Set<string>): string {
  let id = base
  let dup = 2
  while (seen.has(id)) id = `${base}-${dup++}`
  seen.add(id)
  return id
}

/** Shift artwork that starts left of or above the origin so its box begins at (0, 0). */
function normalizeOrigin(path: PathBuilder): void {
  const dx = path.minX < 0 ? -path.minX : 0
  const dy = path.minY < 0 ? -path.minY : 0
  if (!dx && !dy) return
  const r = (v: number) => Math.round(v * 100) / 100
  for (const c of path.commands) {
    if (c.c === 'Z') continue
    c.x = r(c.x + dx)
    c.y = r(c.y + dy)
    if (c.c === 'C') {
      c.x1 = r(c.x1 + dx)
      c.y1 = r(c.y1 + dy)
      c.x2 = r(c.x2 + dx)
      c.y2 = r(c.y2 + dy)
    }
  }
  path.maxX += dx
  path.maxY += dy
  path.minX = 0
  path.minY = 0
}

function convertStencils(xml: string, source: Source, out: OutItem[], seen: Set<string>): number {
  let count = 0
  let current: { name: string; w: number; h: number; path: PathBuilder } | null = null
  for (const tag of xmlTags(xml)) {
    if (tag.name === 'shape' && !tag.close) {
      current = { name: tag.attrs.name ?? 'Shape', w: Number(tag.attrs.w) || 100, h: Number(tag.attrs.h) || 100, path: new PathBuilder() }
      continue
    }
    if (tag.name === 'shape' && tag.close) {
      if (current && current.path.commands.length) {
        normalizeOrigin(current.path)
        const name = current.name.replace(/_/g, ' ').trim()
        const id = uniqueId(`${source.cat} ${name}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''), seen)
        out.push({
          id,
          name,
          lib: source.lib,
          cat: source.cat,
          tags: [...source.tags, ...name.toLowerCase().split(/[\s/-]+/).filter((word) => word.length > 1)],
          s: source.scale,
          // Some stencils draw past their declared box; the box must always contain the artwork.
          w: Math.round(Math.max(current.w, current.path.maxX - Math.min(0, current.path.minX)) * 100) / 100,
          h: Math.round(Math.max(current.h, current.path.maxY - Math.min(0, current.path.minY)) * 100) / 100,
          d: current.path.toString(),
          src: 'drawio',
        })
        count++
      }
      current = null
      continue
    }
    if (!current || tag.close) continue
    const p = current.path
    const a = tag.attrs
    const num = (key: string) => Number(a[key]) || 0
    switch (tag.name) {
      case 'move':
        p.move(num('x'), num('y'))
        break
      case 'line':
        p.line(num('x'), num('y'))
        break
      case 'curve':
        p.cubic(num('x1'), num('y1'), num('x2'), num('y2'), num('x3'), num('y3'))
        break
      case 'quad':
        p.quad(num('x1'), num('y1'), num('x2'), num('y2'))
        break
      case 'arc':
        p.arc(num('rx'), num('ry'), num('x-axis-rotation'), a['large-arc-flag'] === '1', a['sweep-flag'] === '1', num('x'), num('y'))
        break
      case 'close':
        p.close()
        break
      case 'rect':
        p.rect(num('x'), num('y'), num('w'), num('h'))
        break
      case 'roundrect': {
        const arcsize = Number(a.arcsize)
        const r = (Math.min(num('w'), num('h')) * (Number.isFinite(arcsize) && arcsize > 0 ? arcsize : 15)) / 100
        p.rect(num('x'), num('y'), num('w'), num('h'), r)
        break
      }
      case 'ellipse':
        p.ellipse(num('x'), num('y'), num('w'), num('h'))
        break
      default:
        break
    }
  }
  return count
}

function convertSvg(svg: string, name: string, out: OutItem[], seen: Set<string>): boolean {
  const widthMm = Number((svg.match(/<svg[^>]*\swidth="([\d.]+)mm"/) ?? [])[1]) || 0
  const viewBox = (svg.match(/viewBox="([^"]+)"/) ?? [])[1]?.split(/[\s,]+/).map(Number)
  const unitsPerMm = viewBox && viewBox[2] && widthMm ? viewBox[2] / widthMm : 1
  const parsed = svgToCommands(svg)
  if (!parsed.commands.length) return false
  const builder = new PathBuilder()
  const k = 1 / unitsPerMm
  for (const c of parsed.commands) {
    if (c.c === 'M') builder.move(c.x * k, c.y * k)
    else if (c.c === 'L') builder.line(c.x * k, c.y * k)
    else if (c.c === 'C') builder.cubic(c.x1 * k, c.y1 * k, c.x2 * k, c.y2 * k, c.x * k, c.y * k)
    else builder.close()
  }
  const label = name.replace(/([a-z])([A-Z0-9])/g, '$1 $2').replace(/-/g, ' ').replace(/\s+/g, ' ').trim()
  const id = `floor-plan-svg-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
  if (seen.has(id)) return false
  seen.add(id)
  out.push({
    id,
    name: label,
    lib: 'Floor Plans',
    cat: 'Floor plan symbols',
    tags: ['floor plan', 'plan', 'symbol', ...label.toLowerCase().split(' ')],
    s: FLOOR_SCALE,
    w: Math.round(Math.max(parsed.width * k, builder.maxX) * 100) / 100,
    h: Math.round(Math.max(parsed.height * k, builder.maxY) * 100) / 100,
    d: builder.toString(),
    src: 'floorplansvg',
  })
  return true
}

async function main(): Promise<void> {
  const out: OutItem[] = []
  const seen = new Set<string>()
  for (const source of drawio) {
    const xml = await load(DRAWIO_RAW + source.file, `drawio/${source.file}`)
    if (!xml) continue
    console.log(`${source.file}: ${convertStencils(xml, source, out, seen)}`)
  }
  let floor = 0
  for (const name of floorSvgs) {
    const svg = await load(FLOOR_RAW + encodeURIComponent(name) + '.svg', `floorplansvg/${name}.svg`)
    if (svg && convertSvg(svg, name, out, seen)) floor++
  }
  console.log(`FloorPlanSVGSymbols: ${floor}`)
  const target = new URL('../src/catalog/symbols.json', import.meta.url)
  const json = JSON.stringify(out)
  writeFileSync(target, json)
  console.log(`wrote ${out.length} symbols (${Math.round(json.length / 1024)} KB)`)
}

void main()
