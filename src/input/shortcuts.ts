import type { Tool } from '../editor/editor'

/** Single keys that pick a tool. Letters are chosen to avoid browser-reserved combinations and each other. */
export const TOOL_KEYS: Record<string, Tool> = {
  v: 'select',
  a: 'pathSelect',
  p: 'pen',
  n: 'pencil',
  b: 'brush',
  l: 'line',
  u: 'arc',
  r: 'rect',
  d: 'roundRect',
  o: 'ellipse',
  y: 'polygon',
  s: 'star',
  t: 'text',
  e: 'eraser',
  c: 'scissors',
  '+': 'addAnchor',
  '=': 'addAnchor',
  g: 'gradient',
  h: 'hand',
  z: 'zoom',
}

/** The key shown for a tool in tooltips and Help. */
export function shortcutFor(tool: Tool): string | undefined {
  const entry = Object.entries(TOOL_KEYS).find(([, value]) => value === tool)
  return entry ? entry[0].toUpperCase() : undefined
}

/** Non-tool shortcuts, listed in Help. */
export const SHORTCUTS: { keys: string; action: string; reserved?: boolean }[] = [
  { keys: 'Space', action: 'Temporary hand (pan) with any tool' },
  { keys: 'Shift', action: 'Constrain: square, circle, 45° line, 15° rotation' },
  { keys: 'Option', action: 'Draw from the center, or drag a copy' },
  { keys: 'Enter / Escape', action: 'Finish a pen path' },
  { keys: 'Delete', action: 'Delete the selection, or the selected point' },
  { keys: 'Arrows', action: 'Nudge 1 pt (Shift: 10 pt)' },
  { keys: '⌘Z / ⌘⇧Z', action: 'Undo, redo' },
  { keys: '⌘A', action: 'Select all' },
  { keys: '⌘C / ⌘X / ⌘V', action: 'Copy, cut, paste' },
  { keys: '⌘⇧V', action: 'Paste in place' },
  { keys: '⌘D', action: 'Smart duplicate (repeats the last move)' },
  { keys: '⌘G / ⌘⇧G', action: 'Group, ungroup' },
  { keys: '⌘] / ⌘[', action: 'Bring forward, send backward (Shift: to front, to back)' },
  { keys: '⌘J', action: 'Connect the two nearest open ends' },
  { keys: '⌘8', action: 'Make a compound path' },
  { keys: 'Option-N', action: 'New document' },
  { keys: 'Option-W', action: 'Close document' },
  { keys: 'Right-click', action: 'Context menu; on a ruler: guides and units' },
  { keys: 'Command-W', action: 'Reserved by the browser', reserved: true },
  { keys: 'Command-T', action: 'Reserved by the browser', reserved: true },
]
