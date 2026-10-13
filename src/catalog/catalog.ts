import { rectCommands } from '../model/geometry'
import type { Cmd } from '../model/types'

export interface CatalogItem {
  id: string
  name: string
  category: string
  tags: string[]
  aliases: string[]
  worldWidth: number
  worldHeight: number
  commands: Cmd[]
}

const items: CatalogItem[] = []

function add(
  category: string,
  name: string,
  tags: string[],
  worldWidth: number,
  worldHeight: number,
  aliases: string[] = [],
): void {
  const commands = rectCommands(worldWidth, worldHeight)
  if (worldWidth > 4 && worldHeight > 4) {
    const inset = Math.min(worldWidth, worldHeight) * 0.08
    commands.push(
      ...rectCommands(worldWidth - inset * 2, worldHeight - inset * 2).map((command) => ({
        ...command,
        x: command.c === 'Z' ? command.x : command.x + inset,
        y: command.c === 'Z' ? command.y : command.y + inset,
      })),
    )
  }
  items.push({
    id: `${category}-${items.length + 1}`,
    name,
    category,
    tags,
    aliases,
    worldWidth,
    worldHeight,
    commands,
  })
}

function grid(
  category: string,
  label: string,
  tags: string[],
  widths: number[],
  heights: number[],
  unit = 'in',
): void {
  for (const width of widths) {
    for (const height of heights) {
      add(category, `${label} ${width} x ${height} ${unit}`, [...tags, label.toLowerCase(), `${width}`, `${height}`, unit], width, height, [
        label.toLowerCase(),
      ])
    }
  }
}

function range(start: number, end: number, step: number): number[] {
  const values: number[] = []
  for (let value = start; value <= end + 1e-6; value += step) values.push(Math.round(value * 100) / 100)
  return values
}

function build(): CatalogItem[] {
  if (items.length) return items
  const diagonals = [24, 27, 32, 40, 43, 48, 50, 55, 65, 75, 77, 83, 85, 98]
  const aspects: [string, number][] = [
    ['16:9', 9 / 16],
    ['21:9', 9 / 21],
    ['4:3', 3 / 4],
    ['32:9', 9 / 32],
  ]
  const displayTypes = ['TV', 'Monitor', 'Laptop', 'Tablet', 'Projector']
  for (const diagonal of diagonals) {
    for (const [aspect, ratio] of aspects) {
      for (const type of displayTypes) {
        const width = (diagonal * 16) / Math.hypot(16, 16 * ratio)
        const height = width * ratio
        const w = Math.round(width * 10) / 10
        const h = Math.round(height * 10) / 10
        add('Displays', `${diagonal} in ${type} ${aspect}`, ['display', type.toLowerCase(), aspect, `${diagonal}`, 'screen'], w, h, [
          'tv',
          'monitor',
          'screen',
        ])
      }
    }
  }
  const doorWidths = [24, 28, 30, 32, 36, 42]
  const doorHeights = [80, 84, 96]
  const hands = ['left', 'right']
  const doorTypes = ['single', 'double', 'pocket', 'barn', 'sliding']
  for (const width of doorWidths) {
    for (const height of doorHeights) {
      for (const hand of hands) {
        for (const type of doorTypes) {
          add('Openings', `${type} door ${width} x ${height} ${hand}`, ['door', type, hand, 'opening', `${width}`], width, height)
        }
      }
    }
  }
  grid('Openings', 'Window', ['window', 'opening'], range(12, 72, 6), range(12, 60, 12))
  grid('Furniture', 'Table', ['table', 'furniture'], range(36, 96, 12), range(24, 48, 6))
  grid('Furniture', 'Chair', ['chair', 'seating'], range(18, 30, 2), range(18, 24, 2))
  grid('Furniture', 'Sofa', ['sofa', 'seating'], range(60, 120, 12), [32, 36, 40])
  grid('Furniture', 'Bed', ['bed', 'furniture'], [38, 54, 60, 76, 80], [75, 80])
  grid('Kitchen', 'Base cabinet', ['cabinet', 'kitchen', 'base'], range(9, 48, 3), [24, 34.5])
  grid('Kitchen', 'Wall cabinet', ['cabinet', 'kitchen', 'wall'], range(9, 48, 3), [12, 18, 24, 30, 42])
  grid('Appliances', 'Appliance', ['appliance'], [24, 30, 36, 48], [24, 27, 36, 70])
  grid('Bath', 'Fixture', ['bath', 'fixture'], [15, 18, 24, 30, 36, 48, 60], [15, 18, 30, 32, 60])
  grid('Circulation', 'Stair', ['stair', 'steps'], range(36, 60, 6), range(36, 120, 12))
  grid('Structure', 'Column', ['column'], range(6, 36, 2), range(6, 36, 2))
  grid('Landscape', 'Plant', ['plant', 'tree'], range(12, 72, 6), range(12, 72, 12))
  grid('People', 'Person', ['person', 'figure'], [16, 18, 20, 22], [16, 18, 24])
  grid('Vehicles', 'Vehicle', ['vehicle', 'car'], [72, 84, 96, 180, 240], [36, 48, 72, 96])
  grid('Lighting', 'Light', ['light', 'lamp'], range(6, 48, 6), range(6, 24, 6))
  grid('HVAC', 'Diffuser', ['hvac', 'diffuser'], range(6, 36, 6), range(6, 24, 6))
  const electrical = ['outlet', 'switch', 'panel', 'data', 'speaker', 'camera', 'thermostat', 'smoke']
  for (const name of electrical) {
    for (const size of [4, 6, 8]) add('Electrical', `${name} ${size} in`, ['electrical', name, 'symbol'], size, size)
  }
  grid('Annotation', 'Arrow', ['arrow', 'annotation'], range(12, 72, 12), [4, 8, 12])
  grid('Diagrams', 'Flow node', ['flowchart', 'diagram'], [40, 80, 120, 160], [24, 40, 64])
  grid('Mockups', 'Button', ['button', 'ui', 'mockup'], range(40, 160, 20), [24, 32, 44])
  grid('Mockups', 'Field', ['field', 'input', 'ui'], range(80, 320, 40), [28, 36, 44])
  grid('Mockups', 'Card', ['card', 'ui'], range(80, 240, 40), range(60, 180, 40))
  const devices: [string, number, number][] = [
    ['phone', 2.8, 5.8],
    ['phone large', 3.1, 6.4],
    ['tablet', 7.8, 10.2],
    ['tablet large', 8.3, 11.5],
    ['laptop 13', 11.9, 8.2],
    ['laptop 16', 14, 9.6],
  ]
  for (const [name, w, h] of devices) {
    add('Mockups', `${name} frame portrait`, ['device', 'frame', 'mockup', name], w, h)
    add('Mockups', `${name} frame landscape`, ['device', 'frame', 'mockup', name], h, w)
  }
  grid('Mockups', 'Navigation bar', ['nav', 'ui'], range(320, 1440, 160), [44, 56, 64])
  grid('Annotation', 'Scale bar', ['scale', 'annotation'], range(24, 120, 12), [8, 12])
  grid('Storage', 'Shelf', ['shelf', 'storage'], range(12, 72, 6), range(12, 84, 12))
  grid('Furniture', 'Rug', ['rug', 'furniture'], range(36, 120, 12), range(24, 96, 12))
  grid('Furniture', 'Desk', ['desk', 'office'], range(48, 84, 6), range(24, 36, 6))
  grid('Walls', 'Wall segment', ['wall', 'plan'], range(6, 240, 6), [4, 6, 8])
  grid('Panels', 'Panel', ['panel'], range(6, 48, 2), range(12, 96, 12))
  grid('Seating', 'Bench', ['bench', 'seating'], range(36, 96, 6), [16, 18, 20, 24])
  grid('Storage', 'Drawer bank', ['drawer', 'storage'], range(12, 60, 3), range(12, 36, 6))
  const marks = ['north', 'section', 'break', 'revision', 'title', 'callout', 'level', 'datum']
  for (const mark of marks) {
    for (const size of range(8, 64, 4)) {
      add('Annotation', `${mark} mark ${size}`, ['annotation', mark, 'symbol', `${size}`], size, size)
    }
  }
  return items
}

export const CATALOG: CatalogItem[] = build()

export function searchCatalog(source: CatalogItem[], query: string): CatalogItem[] {
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean)
  if (!terms.length) return source
  return source.filter((item) => {
    const hay = `${item.name} ${item.category} ${item.tags.join(' ')} ${item.aliases.join(' ')} ${item.worldWidth} ${item.worldHeight}`.toLowerCase()
    return terms.every((term) => hay.includes(term))
  })
}
