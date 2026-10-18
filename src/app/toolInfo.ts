import type { Tool } from '../editor/editor'
import { shortcutFor } from '../input/shortcuts'

export interface ToolInfo {
  /** Full name shown in tooltips, the options bar, and Help. */
  name: string
  /** One line for the tooltip: what a click or drag does. */
  hint: string
  /** A short paragraph for the manual: how to use it and the options it has. */
  how: string
}

/** Toolbar order, top to bottom. */
export const TOOLS: Tool[] = ['select', 'pathSelect', 'pen', 'pencil', 'brush', 'line', 'arc', 'rect', 'roundRect', 'ellipse', 'polygon', 'star', 'text', 'eraser', 'scissors', 'addAnchor', 'gradient', 'hand', 'zoom']

/** One source of truth for tool names, keys, and descriptions, shared by the toolbar, options bar, Help, and docs. */
const INFO: Record<Tool, ToolInfo> = {
  select: {
    name: 'Select',
    hint: 'Click to select, drag to move, drag a handle to resize or rotate.',
    how: 'Click an object to select it; Shift-click adds to the selection; drag on empty canvas to marquee-select. Drag a selected object to move it and read its position live. Drag a corner or edge handle to resize (Shift keeps proportions), or the knob above the box to rotate (Shift snaps to 15°). Hold Option while dragging to move a copy. Double-click text to edit it. Arrow keys nudge by 1 pt, Shift-arrows by 10.',
  },
  pathSelect: {
    name: 'Direct select',
    hint: 'Click a point on a selected path and drag it.',
    how: 'Select a path, then click one of its anchor points to pick it and drag to move it. Press Delete with a point selected to remove just that point. Use Layers > Path > Convert anchor to switch the point between a corner and a curve.',
  },
  pen: {
    name: 'Pen',
    hint: 'Click to add corner points; press Enter or Escape to finish.',
    how: 'Click once per corner to build a straight-sided path; a drag instead draws a smooth freehand segment. Press Enter, Escape, or pick another tool to finish the path. Close it later with Layers > Path > Close.',
  },
  pencil: {
    name: 'Pencil',
    hint: 'Drag to draw a smooth freehand line.',
    how: 'Press and drag; the stroke is smoothed into curves when you release. Use the Appearance pane to change its color, width, and dash afterwards.',
  },
  brush: {
    name: 'Brush',
    hint: 'Drag to paint a calligraphic stroke; pressure changes the width.',
    how: 'Drag to paint. On a pressure-sensitive pen the stroke thins and thickens with pressure. The options bar sets the Diameter, the nib Angle, its Roundness, and the minimum width as a percentage of the diameter.',
  },
  line: {
    name: 'Line',
    hint: 'Drag a straight line, an arrow, or a dimension line. Shift snaps to 45°.',
    how: 'Drag from one end to the other; hold Shift to constrain to 45° steps. The options bar switches between Plain, Arrow (arrowhead at the end), and Dimension, which draws a measured line that shows its length. Line also sets solid, dotted, or dashed.',
  },
  arc: {
    name: 'Arc',
    hint: 'Drag to draw a quarter arc; choose Open, Pie, or Chord.',
    how: 'Drag a box; the arc fills it. The options bar sets Open (just the curve), Pie (closed through the center), or Chord (closed across the ends). Shift keeps it circular, Option draws from the center.',
  },
  rect: {
    name: 'Rectangle',
    hint: 'Drag to draw a rectangle. Shift for a square, Option from the center.',
    how: 'Drag from one corner to the opposite one. Hold Shift for a square, Option to grow from the center. The readout shows the real-world size while you drag; type exact values in the W and H fields afterwards.',
  },
  roundRect: {
    name: 'Rounded rectangle',
    hint: 'Drag to draw a rectangle with rounded corners; set Radius in the options bar.',
    how: 'Works like Rectangle. The Radius field in the options bar sets the corner radius in points before you draw.',
  },
  ellipse: {
    name: 'Ellipse',
    hint: 'Drag to draw an ellipse. Shift for a circle, Option from the center.',
    how: 'Drag a box; the ellipse fills it. Hold Shift for a circle, Option to grow from the center.',
  },
  polygon: {
    name: 'Polygon',
    hint: 'Drag to draw a polygon; set the number of sides in the options bar.',
    how: 'Drag a box; the polygon fills it. Sides in the options bar sets how many sides (3 or more) before you draw.',
  },
  star: {
    name: 'Star',
    hint: 'Drag to draw a star; set Points and Inner % in the options bar.',
    how: 'Drag a box; the star fills it. Points sets how many points, Inner % sets how deep the notches go (a small number makes a spiky star).',
  },
  text: {
    name: 'Text',
    hint: 'Click for a text label, drag for a wrapping text box, click existing text to edit.',
    how: 'Click to place point text, or drag to draw an area text box that wraps. Click any existing text to edit it in place; Escape finishes. The options bar sets font, size, and alignment; while editing, select letters and press B, I, or U to style just those. The Appearance pane adds color, spacing, and Place on path.',
  },
  eraser: {
    name: 'Eraser',
    hint: 'Drag across shapes to cut them apart along your stroke.',
    how: 'Drag through one or more shapes. Everything under the stroke is removed and the remaining pieces become separate shapes. The options bar sets the eraser width.',
  },
  scissors: {
    name: 'Scissors',
    hint: 'Click on a path edge to split it there.',
    how: 'Click on the edge of a path (select it first if several overlap). A closed shape becomes an open path; an open path becomes two paths.',
  },
  addAnchor: {
    name: 'Add anchor',
    hint: 'Click on a path edge to insert a point there.',
    how: 'Click on the edge of a path to add an anchor point at that spot, then move it with Direct select.',
  },
  gradient: {
    name: 'Gradient',
    hint: 'Drag across a selected shape to set the gradient direction.',
    how: 'Select a shape, then drag across it: the start and end of your drag become the gradient start and end. The Appearance pane switches the fill between linear, radial, and angle gradients and edits the color stops.',
  },
  hand: {
    name: 'Hand',
    hint: 'Drag to pan the view. Hold Space with any tool to pan.',
    how: 'Drag to scroll the drawing. With any other tool, hold the Space bar and drag, or use two fingers on a trackpad.',
  },
  zoom: {
    name: 'Zoom',
    hint: 'Click to zoom in, Option-click to zoom out. Pinch or Ctrl-scroll also zooms.',
    how: 'Click to zoom in on that spot; hold Option and click to zoom out. The Zoom menu in the options bar has Fit, 100%, and zoom to selection. Pinch on a trackpad or hold Ctrl while scrolling to zoom anywhere.',
  },
}

export interface ToolEntry extends ToolInfo {
  /** Single key that selects the tool, from the keyboard map. */
  shortcut?: string
}

export const TOOL_INFO: Record<Tool, ToolEntry> = Object.fromEntries(
  (Object.entries(INFO) as [Tool, ToolInfo][]).map(([tool, info]) => [tool, { ...info, shortcut: shortcutFor(tool) }]),
) as Record<Tool, ToolEntry>

export const TOOL_NAMES: Record<Tool, string> = Object.fromEntries(Object.entries(INFO).map(([tool, info]) => [tool, info.name])) as Record<Tool, string>
