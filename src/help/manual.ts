import { LIMITATIONS } from '../editor/editor'
import { SHORTCUTS } from '../input/shortcuts'
import { TOOL_INFO, TOOLS } from '../app/toolInfo'

export interface HelpTopic {
  id: string
  title: string
  /** Short answer or summary, one or two sentences. */
  summary: string
  /** Plain-text paragraphs or steps. Lines starting with "- " render as a list. */
  body: string[]
  /** Extra words that should match in search but are not shown. */
  keywords?: string
}

export interface HelpSection {
  id: string
  title: string
  topics: HelpTopic[]
}

const gettingStarted: HelpTopic[] = [
  {
    id: 'start-layout',
    title: 'What is where',
    summary: 'Tools on the left, the drawing in the middle, panels on the right, file buttons at the top.',
    body: [
      '- Top bar: one tab per open document, plus Undo, Redo, Open, Save, Export, Plugins, and this Help.',
      '- Options bar (under the tabs): the active tool name, exact X / Y / W / H / angle fields for the selection, options for the current tool, snapping, and zoom.',
      '- Left toolbar: the drawing tools. Hover (or long-press on touch) any tool to see its name, key, and what it does. The two squares at the bottom are the Fill and Stroke colors.',
      '- Canvas: rulers along the top and left, the paper in the middle. Right-click a ruler to add guides or change units; right-click the drawing for cut, copy, arrange, and more.',
      '- Right panel: Properties (canvas, grid, transform, align, labels), Appearance (fill, stroke, text, effects, saved styles), Layers (layers, objects, path operations), Libraries (symbols you can drag onto the canvas).',
      'On tablets and phones the toolbar moves to the bottom and the panels become tabs above it; tap a tab to open its sheet, tap again to close it.',
    ],
    keywords: 'where find toolbar panel inspector layout overview',
  },
  {
    id: 'start-first-drawing',
    title: 'Your first drawing',
    summary: 'Pick a shape tool, drag on the paper, then adjust it with the fields in the options bar.',
    body: [
      '1. Press R (or click Rectangle in the toolbar) and drag on the paper. The readout shows the real-world size while you drag.',
      '2. Press V (Select) and drag the shape to move it, or drag a corner handle to resize. Shift keeps proportions.',
      '3. Type exact values into X, Y, W, and H in the options bar. Units follow the document (in, cm, mm, px); you can also type "3 cm" or "2 ft" directly.',
      '4. Open Appearance on the right to change the fill and stroke colors, stroke width, and dash.',
      '5. Everything you do is saved in this browser automatically every few seconds. Use Save to keep a .measured file you can open anywhere.',
    ],
    keywords: 'tutorial begin new draw shape',
  },
  {
    id: 'start-scale',
    title: 'Drawing to scale',
    summary: 'Set Paper = Real in Properties > Canvas, and every size you see is the real-world size.',
    body: [
      'Measured is built for drawings that represent real objects: a floor plan, a garden, a part.',
      '1. In Properties > Canvas pick a common scale from the Scale menu (1/4 in = 1 ft, 1:50, 1 px = 1 ft...), or set your own: type the Paper number, pick its unit, then the Real number and its unit, for example 1 in = 1 ft. The readout shows the statement and the ratio.',
      '2. The rulers, the readout while you draw, the W / H fields, and dimension lines all report real-world sizes.',
      '3. The Unit menu beside Width and Height sets the page unit (in, cm, mm, px). Changing it converts the page size and restates the scale in that system; the real-world unit menu then offers that system\'s units.',
      '4. Measurement labels follow the scale (feet become feet-and-inches) unless you choose a label unit yourself in Properties > Label.',
      '5. Right-click an object and choose Add size label, or use Properties > Label, to print its measurements beside it.',
    ],
    keywords: 'ratio measurement real world architectural plan feet inches',
  },
  {
    id: 'start-save',
    title: 'Saving, opening, and autosave',
    summary: 'Your work is autosaved in this browser; Save writes a .measured file; Open reads .measured, SVG, PDF, PSD, and images.',
    body: [
      'Autosave keeps every open tab, your custom libraries, and saved plugins in this browser. Reloading brings them back. Clearing site data removes them.',
      'Save downloads (or, in Chrome and Edge, lets you pick a location for) a .measured file of the current document.',
      'Open accepts .measured, .svg, .pdf, .psd, and image files. SVG is converted to editable paths; PDF and PSD are placed as frames; images become image objects.',
      'Closing a tab that has content asks for confirmation first.',
      'Export writes SVG, PDF, PNG, JPEG, GIF, TIFF, or PSD, with a scope (selection, layer, or canvas) and a resolution for raster formats.',
    ],
    keywords: 'file download upload import export measured json',
  },
]

const toolTopics: HelpTopic[] = TOOLS.map((tool) => {
  const info = TOOL_INFO[tool]
  return {
    id: `tool-${tool}`,
    title: info.shortcut ? `${info.name} (${info.shortcut})` : info.name,
    summary: info.hint,
    body: [info.how],
    keywords: tool,
  }
})

const optionsBar: HelpTopic[] = [
  {
    id: 'options-geometry',
    title: 'X, Y, W, H, and angle fields',
    summary: 'Type exact position, size, and rotation for the selection. Units are optional.',
    body: [
      'The fields show the selection\'s bounding box in document units. Type a number and press Enter or Tab to apply it; Escape restores the old value.',
      'Units are accepted: "2 in", "5 cm", "30 mm", "100 px", "3 ft" all work and are converted. When the document has a scale, the values are real-world sizes.',
      'The ∠ field rotates around the center of the selection.',
    ],
    keywords: 'width height position rotate numeric exact',
  },
  {
    id: 'options-snap',
    title: 'Snap',
    summary: 'Snap to a fixed real-world step or to the grid spacing, or turn it off.',
    body: [
      'Off lets corners follow the cursor exactly. Grid spacing snaps to the grid set in Properties > Grid. The other choices snap to that many real-world units regardless of the grid.',
      'Smart guides (Properties > Canvas) are separate: they align edges and centers with nearby objects while you drag.',
    ],
    keywords: 'snapping grid align magnet',
  },
  {
    id: 'options-zoom',
    title: 'Zoom and the view',
    summary: 'Use the Zoom menu in the options bar, pinch, Ctrl-scroll, or the Zoom tool.',
    body: [
      'The Zoom menu has Fit (whole page), 100%, and fixed steps. Pinch on a trackpad or hold Ctrl and scroll to zoom at the cursor. Two-finger scroll pans; Space-drag pans with any tool.',
      'Properties > Canvas > View switches between Vector (what you drew), Outline (wireframe), and Pixels (how it rasterizes).',
    ],
    keywords: 'magnify fit page pan scroll',
  },
  {
    id: 'options-line',
    title: 'Line type, arrows, and dashes',
    summary: 'When the Line tool or a line is active, choose Plain, Arrow, or Dimension and a dash pattern.',
    body: [
      'Plain is a straight stroke. Arrow puts an arrowhead at the end. Dimension draws an engineering-style measured line that shows its real-world length and updates when you move its ends.',
      'Solid, Dotted, and Dashed set the dash. Appearance > Stroke > Dash lets you type a custom pattern.',
    ],
    keywords: 'arrowhead dimension measure dotted dashed',
  },
  {
    id: 'options-text',
    title: 'Text options',
    summary: 'Font, size, and alignment for the Text tool and selected text.',
    body: [
      'Choose a font family and size and left / center / right alignment. While editing text, select letters and press B, I, or U, or use the Appearance > Text buttons, to style part of the text.',
    ],
    keywords: 'font family size bold italic underline',
  },
]

const properties: HelpTopic[] = [
  {
    id: 'props-canvas',
    title: 'Properties > Canvas',
    summary: 'Page size, units, scale, paper style, color mode, rulers, guides, view mode, and background.',
    body: [
      '- Width / Height are plain numbers in the Unit chosen beside them; the swap button flips orientation. Changing Unit converts the numbers, nothing moves.',
      '- Style changes the paper look (Plain, Graph paper, Notebook, Blueprint). Color switches the document between RGB and CMYK.',
      '- Scale: pick a common scale, or type Paper and Real amounts and choose each unit from its menu (see Drawing to scale).',
      '- Rulers, Smart guides, and Pixel-align toggle those helpers.',
      '- View switches Vector / Outline / Pixels. Background and Selection set the canvas color and the selection highlight color.',
      '- Grow page by adds the chosen amount to the edge you click. Artwork ×2 and Artwork ×½ resize the page around the drawing.',
    ],
    keywords: 'page size orientation landscape portrait units cmyk rgb rulers background',
  },
  {
    id: 'props-grid',
    title: 'Properties > Grid',
    summary: 'Grid spacing, subdivisions, and origin.',
    body: ['Spacing X / Y set the major grid in the page unit; Subdivisions splits each cell. Margins keep the grid off the page edges. Choose Grid spacing in the Snap menu to snap to it.'],
    keywords: 'graph lines spacing subdivisions',
  },
  {
    id: 'props-transform',
    title: 'Properties > Transform',
    summary: 'Move, scale, rotate, and shear the selection by typed amounts.',
    body: ['Enter a value and press Apply. Move X / Y are in the page unit shown beside them. Scale X / Y are percentages; Rotate and Shear are degrees. Reset clears the fields without changing anything.'],
    keywords: 'resize percent degrees skew',
  },
  {
    id: 'props-align',
    title: 'Properties > Align',
    summary: 'Align edges or centers, distribute evenly, flip, group, and change stacking order.',
    body: [
      'Select two or more objects and click an Align button to line up their left, center, right, top, middle, or bottom. Distribute spaces three or more objects evenly.',
      'Flip horizontal / vertical mirror the selection. Group / Ungroup make objects move together. Order has bring to front, forward, backward, and send to back.',
      'The buttons stay dimmed until enough objects are selected.',
    ],
    keywords: 'arrange distribute flip mirror order front back',
  },
  {
    id: 'props-label',
    title: 'Properties > Label',
    summary: 'Attach a size or location label that updates with the object.',
    body: [
      'With an object selected choose Style (size, location, or text), the Unit, Precision, Offset, and the label Text. Labels follow the object and the document scale. Remove label takes it off.',
    ],
    keywords: 'dimension annotation caption measurement',
  },
]

const appearance: HelpTopic[] = [
  {
    id: 'app-fill',
    title: 'Appearance > Fill',
    summary: 'Solid color, linear / radial / angle gradients, patterns, and images for the inside of a shape.',
    body: [
      'Choose a Type. For a solid, pick a color from the swatch or type a hex value. For gradients, add and drag stops, then use the Gradient tool (G) to set the direction on the canvas. Pattern fills a shape with a saved pattern (Save pattern stores the current selection as one). Image fills with a picture.',
      'Opacity is per fill; Object opacity (in Effects) is for the whole object.',
    ],
    keywords: 'color gradient pattern hex swatch opacity',
  },
  {
    id: 'app-stroke',
    title: 'Appearance > Stroke',
    summary: 'Line color, width, alignment, dash, and arrowheads.',
    body: [
      'Width is in points. Align puts the stroke Inside, Center, or Outside the path. Dash sets Solid, Dotted, Dashed, or a Custom pattern. Arrows adds heads at Start, End, or Both.',
    ],
    keywords: 'outline border line width dash arrows',
  },
  {
    id: 'app-text',
    title: 'Appearance > Text',
    summary: 'Color, letter and line spacing, style, outlines, and text on a path.',
    body: [
      'Text color, Char (letter spacing), and Line (line height) apply to the selected text. Bold, Italic, and Bold italic set the style. Point text / Area text switch between a single line that grows and a box that wraps (Field width sets the box).',
      'Place on path attaches text to the selected path; Path offset slides it along, Reverse flips the side, Release detaches it. Create outlines turns the text into editable shapes.',
    ],
    keywords: 'letter spacing kerning leading on path outlines',
  },
  {
    id: 'app-effects',
    title: 'Appearance > Effects',
    summary: 'Blur, blend mode, object opacity, and shadow offset.',
    body: ['Blur softens the object. Blend mode changes how it mixes with what is behind. Object opacity fades the whole object. X / Y offset a drop shadow.'],
    keywords: 'shadow blur blend multiply screen opacity',
  },
  {
    id: 'app-styles',
    title: 'Appearance > Styles',
    summary: 'Save the current look and apply it elsewhere; copy and paste styles; recolor or select similar.',
    body: [
      'Save style names the current fill, stroke, and effects so you can apply them with one click later. Copy style / Paste style move the look between objects.',
      'Recolor artwork… shifts hue, saturation, and lightness of everything selected. Select similar… selects objects that share fill, stroke, or kind with the current one.',
    ],
    keywords: 'swatches presets graphic style recolor hue',
  },
]

const layers: HelpTopic[] = [
  {
    id: 'layers-layers',
    title: 'Layers',
    summary: 'Add, reorder, hide, lock, merge, and set opacity or blend per layer.',
    body: [
      'Click a layer to make it active; new shapes land there. The eye hides it; the lock prevents edits (the app tells you if you try to draw on a locked layer). Move up / down change the order. Duplicate, Merge down, and Delete manage layers. Layer opacity and Blend apply to everything on it. Unlock all clears every lock.',
    ],
    keywords: 'visibility hide lock opacity blend merge',
  },
  {
    id: 'layers-objects',
    title: 'Objects in the Layers list',
    summary: 'Every shape appears under its layer; click to select, double-click to rename.',
    body: ['Click an object row to select it on the canvas; Shift-click adds to the selection. Groups and masks show their children. The lock and eye work per object too.'],
    keywords: 'rename select object row group',
  },
  {
    id: 'layers-path',
    title: 'Path and shape operations',
    summary: 'Boolean ops, masks, compound paths, join, close, reverse, outline stroke, and anchor conversion.',
    body: [
      '- Unite / Subtract / Intersect / Exclude / Divide combine two or more overlapping shapes.',
      '- Mask hides everything outside the front shape; Release mask shows it again.',
      '- Compound turns overlapping areas into holes; Release compound splits it back.',
      '- Join connects two open paths; Connect links the start of a path to its end; Close closes an open path; Reverse flips its direction.',
      '- Outline stroke turns a stroke into a filled shape. Convert anchor switches the selected point between corner and curve.',
    ],
    keywords: 'boolean unite subtract intersect exclude divide mask clip compound join close reverse outline anchor',
  },
]

const libraries: HelpTopic[] = [
  {
    id: 'lib-browse',
    title: 'Libraries: finding and placing symbols',
    summary: 'Search thousands of symbols and drag or click to place them.',
    body: [
      'Type in the search box to filter. Click a symbol to place it in the middle of your view, or drag it onto the canvas where you want it. Symbols are ordinary shapes once placed, so you can recolor and resize them.',
      'Symbol sources and licenses lists where the built-in sets come from.',
    ],
    keywords: 'symbols icons clipart search drag place',
  },
  {
    id: 'lib-custom',
    title: 'My libraries',
    summary: 'Save your own shapes as reusable symbols.',
    body: [
      'New library creates a named set. Select something on the canvas and use Add selection as to store it. Export library downloads it; Import… loads one. Libraries are autosaved with your documents.',
    ],
    keywords: 'custom symbol save reuse export import',
  },
  {
    id: 'lib-styles',
    title: 'Saved styles',
    summary: 'Styles saved in Appearance appear here too for quick application.',
    body: ['Click a saved style to apply it to the selection.'],
    keywords: 'presets',
  },
]

const files: HelpTopic[] = [
  {
    id: 'files-export',
    title: 'Export',
    summary: 'SVG, PDF, PNG, JPEG, GIF, TIFF, PSD; choose scope, resolution, and quality.',
    body: [
      'Format picks the file type. Scope exports the Selection, the Current layer, or the Entire canvas. Resolution (dpi) and Scale control raster size; Quality applies to JPEG. Copy as SVG / Copy as CSS put code on the clipboard instead of downloading.',
      LIMITATIONS['cmyk-pdf'],
      LIMITATIONS.psd,
    ],
    keywords: 'download png jpeg pdf svg psd tiff gif dpi',
  },
  {
    id: 'files-import',
    title: 'Open and import',
    summary: 'Open .measured files, SVG, PDF, PSD, or images from the Open button or by dropping them onto the canvas.',
    body: ['Drop a file on the canvas or use Open…. SVG becomes editable paths.', LIMITATIONS['pdf-import'], LIMITATIONS.eps],
    keywords: 'drag drop svg pdf psd image photo',
  },
  {
    id: 'files-plugins',
    title: 'Plugins',
    summary: 'Small JavaScript scripts that draw for you.',
    body: [
      'Plugins get an api object with createRect, createEllipse, createText, placeSymbol, setFill, setStroke, move, select, getSelection, getDocument, setScale, and alert. Run executes the code; Save keeps it by name in this browser.',
    ],
    keywords: 'script javascript automate api',
  },
  {
    id: 'files-context-menu',
    title: 'Right-click menus',
    summary: 'Cut, copy, paste, duplicate, group, arrange, lock, size labels, and this Help.',
    body: [
      'Right-click (or long-press) the drawing for the object menu. Right-click a ruler to add a guide at that spot, clear guides, change the ruler unit, or hide rulers.',
    ],
    keywords: 'context menu guides rulers',
  },
]

const faq: HelpTopic[] = [
  {
    id: 'faq-cannot-draw',
    title: 'I drag but nothing appears',
    summary: 'The active layer is probably locked or hidden, or a selection tool is active.',
    body: [
      'Check the toolbar: Select (V) and Direct select (A) do not draw. Open Layers and make sure the highlighted layer is unlocked and visible. A banner at the bottom explains when a layer is locked.',
    ],
    keywords: 'nothing happens blank not working',
  },
  {
    id: 'faq-pen-finish',
    title: 'How do I finish a pen path?',
    summary: 'Press Enter or Escape, or switch tools.',
    body: ['The path is committed when you press Enter or Escape or pick another tool. To close it, select it and use Layers > Path > Close.'],
    keywords: 'end stop pen path commit',
  },
  {
    id: 'faq-shortcut-browser',
    title: 'Why do Command-W and Command-T not work?',
    summary: LIMITATIONS.shortcut,
    body: ['Browsers reserve these for tabs. Use Option-N for a new document and Option-W to close the current one.'],
    keywords: 'keyboard reserved new close tab',
  },
  {
    id: 'faq-units',
    title: 'How do I change units?',
    summary: 'The Unit menu in Properties > Canvas, or right-click a ruler.',
    body: ['The page unit sets the rulers, page size, grid, and the paper side of the scale; numbers are converted, nothing moves. The real-world unit is chosen in the scale row, and the unit printed on measurement labels in Properties > Label.'],
    keywords: 'inches centimeters millimeters pixels',
  },
  {
    id: 'faq-lost-work',
    title: 'Where did my drawing go?',
    summary: 'Autosave is per browser. Reload the same browser, or open the .measured file you saved.',
    body: [
      'Open tabs, libraries, and plugins are stored in this browser\'s storage and restored on reload. They are not shared between browsers or devices; use Save and Open to move a file.',
      LIMITATIONS.icloud,
    ],
    keywords: 'recover missing autosave storage',
  },
  {
    id: 'faq-not-available',
    title: 'What is not available in the browser?',
    summary: 'A few desktop-only features: EPS/AI import, iCloud, Handoff, Dropbox, Quick Look, Core Graphics source.',
    body: Object.values(LIMITATIONS),
    keywords: 'limitations missing desktop',
  },
]

export const MANUAL: HelpSection[] = [
  { id: 'getting-started', title: 'Getting started', topics: gettingStarted },
  { id: 'tools', title: 'Tools', topics: toolTopics },
  { id: 'options-bar', title: 'Options bar', topics: optionsBar },
  { id: 'properties', title: 'Properties pane', topics: properties },
  { id: 'appearance', title: 'Appearance pane', topics: appearance },
  { id: 'layers', title: 'Layers pane', topics: layers },
  { id: 'libraries', title: 'Libraries pane', topics: libraries },
  { id: 'files', title: 'Files, export, and menus', topics: files },
  {
    id: 'shortcuts',
    title: 'Keyboard shortcuts',
    topics: [
      {
        id: 'shortcuts-tools',
        title: 'Tool keys',
        summary: 'One letter picks a tool.',
        body: TOOLS.map((tool) => `- ${TOOL_INFO[tool].shortcut ?? '–'}: ${TOOL_INFO[tool].name}`),
        keywords: 'keys keyboard',
      },
      {
        id: 'shortcuts-editing',
        title: 'Editing keys',
        summary: 'Undo, copy, paste, group, arrange, and modifiers.',
        body: SHORTCUTS.map((item) => `- ${item.keys}: ${item.action}`),
        keywords: 'keys keyboard command modifier',
      },
    ],
  },
  { id: 'faq', title: 'FAQ', topics: faq },
]

/** Case-insensitive match on title, summary, body, and keywords; returns sections with only the matching topics. */
export function searchManual(query: string): HelpSection[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (terms.length === 0) return MANUAL
  return MANUAL.map((section) => ({
    ...section,
    topics: section.topics.filter((topic) => {
      const text = `${section.title} ${topic.title} ${topic.summary} ${topic.body.join(' ')} ${topic.keywords ?? ''}`.toLowerCase()
      return terms.every((term) => text.includes(term))
    }),
  })).filter((section) => section.topics.length > 0)
}

export function findTopic(id: string): HelpTopic | undefined {
  for (const section of MANUAL) {
    const topic = section.topics.find((item) => item.id === id)
    if (topic) return topic
  }
  return undefined
}
