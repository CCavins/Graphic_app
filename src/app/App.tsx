import { useEffect, useMemo, useRef, useState } from 'react'
import { CATALOG } from '../catalog/catalog'
import { Editor, LIMITATIONS, type Tool } from '../editor/editor'
import { canvasRenderer } from '../render/draw'
import { BLEND_MODES, APPROXIMATE_BLEND } from '../model/types'
import { PRESETS } from '../model/factory'
import { quarterInchFootScale } from '../model/units'
import { SHORTCUTS } from '../input/shortcuts'
import { download, loadAutosave, saveAutosave, saveWithPicker } from '../storage/files'
import { exportPsd, exportTiff } from '../model/export'
import './styles.css'

const TOOLS: { id: Tool; label: string }[] = [
  { id: 'select', label: 'Move' },
  { id: 'pathSelect', label: 'Path' },
  { id: 'pen', label: 'Pen' },
  { id: 'pencil', label: 'Pencil' },
  { id: 'brush', label: 'Brush' },
  { id: 'line', label: 'Line' },
  { id: 'arc', label: 'Arc' },
  { id: 'rect', label: 'Rect' },
  { id: 'roundRect', label: 'Round' },
  { id: 'ellipse', label: 'Ellipse' },
  { id: 'polygon', label: 'Polygon' },
  { id: 'star', label: 'Star' },
  { id: 'text', label: 'Text' },
  { id: 'hand', label: 'Hand' },
  { id: 'zoom', label: 'Zoom' },
]

const editor = new Editor()

export function App() {
  const [, setTick] = useState(0)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [panel, setPanel] = useState<'Canvas' | 'Appearance' | 'Label' | 'Layers' | 'Libraries' | 'Plugins'>('Canvas')
  const [query, setQuery] = useState('')
  const [scroll, setScroll] = useState(0)
  const [exportOpen, setExportOpen] = useState(false)
  const [format, setFormat] = useState('svg')
  const [include, setInclude] = useState<'canvas' | 'objects' | 'selection'>('canvas')
  const [pluginCode, setPluginCode] = useState('api.createRect(40, 40, 80, 50)')
  const fileRef = useRef<HTMLInputElement>(null)
  const results = useMemo(() => editor.search(query), [query, editor.customLibrary.length])

  useEffect(() => editor.subscribe(() => setTick((value) => value + 1)), [])

  useEffect(() => {
    const media = window.matchMedia('(max-width: 1023px)')
    const update = () => setNarrow(media.matches)
    media.addEventListener('change', update)
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return
      editor.key(event.key, { shift: event.shiftKey, alt: event.altKey, meta: event.metaKey || event.ctrlKey })
      if (event.key === ' ') event.preventDefault()
    }
    const onKeyUp = (event: KeyboardEvent) => editor.keyUp(event.key)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      media.removeEventListener('change', update)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [])

  useEffect(() => {
    void loadAutosave().then((json) => {
      if (!json) return
      try {
        editor.loadText(json)
      } catch {
        editor.banner = null
      }
    })
    const timer = window.setInterval(() => {
      void saveAutosave(editor.serialize())
    }, 2000)
    const api = {
      editor,
      seed(count: number) {
        editor.seedRects(count)
      },
      frames() {
        return performance.getEntriesByName('pointer-move').map((entry) => entry.duration)
      },
    }
    window.__measured = api
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const draw = () => {
      const rect = canvas.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      canvas.width = Math.max(1, Math.floor(rect.width * dpr))
      canvas.height = Math.max(1, Math.floor(rect.height * dpr))
      canvas.dataset.originX = String(editor.view.panX)
      canvas.dataset.originY = String(editor.view.panY)
      canvas.dataset.zoom = String(editor.view.zoom)
      const ctx = canvas.getContext('2d')
      if (ctx) canvasRenderer.render(ctx, rect.width, rect.height, dpr, editor)
    }
    draw()
    const fromPointer = (event: PointerEvent) => {
      const bounds = canvas.getBoundingClientRect()
      return {
        cx: event.clientX - bounds.left,
        cy: event.clientY - bounds.top,
        type: (event.pointerType || 'mouse') as 'mouse' | 'touch' | 'pen',
        button: event.button,
        shift: event.shiftKey,
        alt: event.altKey,
        meta: event.metaKey || event.ctrlKey,
        pressure: event.pressure,
        pointerId: event.pointerId,
      }
    }
    const onDown = (event: PointerEvent) => {
      try {
        canvas.setPointerCapture(event.pointerId)
      } catch {
        /* synthetic events have no capture target */
      }
      editor.pointerDown(fromPointer(event))
    }
    const onMove = (event: PointerEvent) => {
      performance.mark('pm-start')
      editor.pointerMove(fromPointer(event))
      performance.mark('pm-end')
      performance.measure('pointer-move', 'pm-start', 'pm-end')
    }
    const onUp = (event: PointerEvent) => editor.pointerUp(fromPointer(event))
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const bounds = canvas.getBoundingClientRect()
      editor.wheel(event.deltaX, event.deltaY, event.ctrlKey, event.clientX - bounds.left, event.clientY - bounds.top)
    }
    const onContext = (event: MouseEvent) => {
      event.preventDefault()
      const bounds = canvas.getBoundingClientRect()
      editor.context = { x: event.clientX - bounds.left, y: event.clientY - bounds.top }
      editor.emit()
    }
    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerup', onUp)
    canvas.addEventListener('pointercancel', () => editor.cancel())
    canvas.addEventListener('wheel', onWheel, { passive: false })
    canvas.addEventListener('contextmenu', onContext)
    const observer = new ResizeObserver(draw)
    observer.observe(canvas)
    const stop = editor.subscribe(draw)
    return () => {
      stop()
      observer.disconnect()
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerup', onUp)
      canvas.removeEventListener('wheel', onWheel)
      canvas.removeEventListener('contextmenu', onContext)
    }
  }, [])

  const [narrow, setNarrow] = useState(() => window.matchMedia('(max-width: 1023px)').matches)
  const selected = editor.selection[0]
  const rowHeight = 36
  const start = Math.floor(scroll / rowHeight)
  const visible = results.slice(start, start + 12)

  return (
    <div className="app">
      <header className="topbar">
        <strong>Measured</strong>
        <div className="doc-tabs" data-testid="doc-tabs">
          {editor.docs.map((doc, index) => (
            <button key={doc.id} data-testid="doc-tab" data-active={index === editor.active} onClick={() => editor.selectTab(index)}>
              {doc.name}
            </button>
          ))}
        </div>
        <button data-testid="new-doc" onClick={() => editor.newDocument('letter')}>New</button>
        <button data-testid="undo" onClick={() => editor.undo()}>Undo</button>
        <button data-testid="redo" onClick={() => editor.redo()}>Redo</button>
        <button data-testid="save-file" onClick={() => void saveWithPicker(`${editor.doc.name}.measured`, editor.serialize())}>Save</button>
        <button data-testid="open-file" onClick={() => fileRef.current?.click()}>Open</button>
        <button data-testid="export-open" onClick={() => setExportOpen(true)}>Export</button>
        <input ref={fileRef} data-testid="file-input" hidden type="file" accept=".measured,application/json,.psd" onChange={(event) => {
          const file = event.target.files?.[0]
          if (!file) return
          if (file.name.endsWith('.psd')) {
            void file.arrayBuffer().then((buffer) => editor.importPsd(new Uint8Array(buffer)))
            return
          }
          void file.text().then((text) => editor.loadText(text))
        }} />
      </header>
      <aside className="toolbar" data-testid="toolbar">
        {TOOLS.map((tool) => (
          <button key={tool.id} data-testid={`tool-${tool.id}`} data-active={editor.tool === tool.id} onClick={() => editor.setTool(tool.id)}>
            {tool.label}
          </button>
        ))}
      </aside>
      <div className="stage">
        <canvas ref={canvasRef} data-testid="canvas" />
        <div className="readout" data-testid="readout" style={{ left: 12, top: 12 }}>{editor.readout}</div>
        {editor.context && (
          <div className="menu" data-testid="context-menu" style={{ left: editor.context.x, top: editor.context.y }}>
            <button onClick={() => editor.align('left')}>Align left</button>
            <button onClick={() => editor.duplicate()}>Duplicate</button>
            <button onClick={() => editor.toggleLock(selected)}>Lock</button>
          </div>
        )}
      </div>
      <aside className="inspector" data-testid="inspector">
        {editor.banner && <div className="banner" data-testid="banner">{editor.banner}</div>}
        {(narrow || editor.lastPointer?.type === 'touch') && (
          <div className="chips" data-testid="modifier-chips">
            <button className="chip" data-active={editor.touchMods.constrain} onClick={() => { editor.touchMods.constrain = !editor.touchMods.constrain; editor.emit() }}>Constrain</button>
            <button className="chip" data-active={editor.touchMods.fromCenter} onClick={() => { editor.touchMods.fromCenter = !editor.touchMods.fromCenter; editor.emit() }}>From center</button>
            <button className="chip" data-active={editor.touchMods.duplicate} onClick={() => { editor.touchMods.duplicate = !editor.touchMods.duplicate; editor.emit() }}>Duplicate</button>
          </div>
        )}
        <div className="tabs">
          {(['Canvas', 'Appearance', 'Label', 'Layers', 'Libraries', 'Plugins'] as const).map((name) => (
            <button key={name} data-testid={`tab-${name}`} data-active={panel === name} onClick={() => setPanel(name)}>{name}</button>
          ))}
        </div>
        {panel === 'Canvas' && (
          <div className="stack">
            <label>Preset
              <select data-testid="preset" onChange={(event) => editor.newDocument(event.target.value)}>
                {PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}
              </select>
            </label>
            <label>Scale
              <button data-testid="scale-quarter" onClick={() => editor.setScale(quarterInchFootScale())}>1/4 in = 1 ft</button>
            </label>
            <label>Label unit
              <select data-testid="label-unit" value={editor.doc.canvas.labelUnit} onChange={(event) => editor.setLabelUnit(event.target.value as typeof editor.doc.canvas.labelUnit)}>
                {['px', 'in', 'ft', 'ft-in', 'yd', 'mi', 'mm', 'cm', 'm', 'km'].map((unit) => <option key={unit}>{unit}</option>)}
              </select>
            </label>
            <label>View
              <select data-testid="view-mode" value={editor.doc.canvas.viewMode} onChange={(event) => { editor.doc.canvas.viewMode = event.target.value as typeof editor.doc.canvas.viewMode; editor.emit() }}>
                <option value="vector">Vector</option>
                <option value="pixels">Pixels</option>
                <option value="outline">Outline</option>
              </select>
            </label>
            <button data-testid="zoom-fit" onClick={() => editor.zoomCommand('fit', { width: 1200, height: 800 })}>Zoom to fit</button>
            <p data-testid="limitations">{Object.values(LIMITATIONS).join(' ')}</p>
            <div data-testid="shortcuts">
              {SHORTCUTS.map((item) => <div key={item.keys}>{item.keys}: {item.action}</div>)}
            </div>
          </div>
        )}
        {panel === 'Appearance' && (
          <div className="stack">
            <button data-testid="add-shadow" onClick={() => editor.enableEffect('dropShadow')}>Drop shadow</button>
            <button onClick={() => editor.enableEffect('innerShadow')}>Inner shadow</button>
            <button onClick={() => editor.enableEffect('outerGlow')}>Outer glow</button>
            <button onClick={() => editor.enableEffect('innerGlow')}>Inner glow</button>
            <button onClick={() => editor.enableEffect('blur')}>Blur</button>
            <label>Blend
              <select data-testid="blend" onChange={(event) => editor.setBlend(event.target.value as (typeof BLEND_MODES)[number])}>
                {BLEND_MODES.map((mode) => <option key={mode} value={mode}>{mode}{APPROXIMATE_BLEND.has(mode) ? ' (approx)' : ''}</option>)}
              </select>
            </label>
            <button data-testid="copy-style" onClick={() => editor.copyStyle()}>Copy style</button>
            <button data-testid="paste-style" onClick={() => editor.pasteStyle()}>Paste style</button>
            <button data-testid="gradient" onClick={() => editor.setGradient()}>Gradient</button>
            <button data-testid="pattern" onClick={() => editor.setPattern('stripes')}>Stripes</button>
            <button data-testid="select-similar" onClick={() => editor.selectSimilar('fill-color', 'all')}>Select similar</button>
            <button data-testid="recolor" onClick={() => editor.recolor('hue', 0.1)}>Recolor</button>
          </div>
        )}
        {panel === 'Label' && (
          <div className="stack">
            <button data-testid="label-width" onClick={() => editor.setLabel('width')}>Width label</button>
            <button onClick={() => editor.setLabel('height')}>Height label</button>
            <button onClick={() => editor.setLabel('area')}>Area label</button>
            <button onClick={() => editor.setLabel('text', 'Note')}>Text label</button>
          </div>
        )}
        {panel === 'Layers' && (
          <div className="stack" data-testid="layers">
            <button data-testid="add-layer" onClick={() => editor.addLayer()}>Add layer</button>
            {editor.doc.layers.map((layer) => (
              <div key={layer.id}>
                <button data-testid="layer" data-active={layer.id === editor.doc.activeLayerId} onClick={() => { editor.doc.activeLayerId = layer.id; editor.emit() }}>{layer.name}</button>
                <button onClick={() => editor.toggleLock(layer.id)}>{layer.locked ? 'Unlock' : 'Lock'}</button>
              </div>
            ))}
            <button data-testid="group" onClick={() => editor.group()}>Group</button>
            <button data-testid="align-left" onClick={() => editor.align('left')}>Align left</button>
            <button data-testid="distribute" onClick={() => editor.distribute('h')}>Distribute</button>
            <button data-testid="flip" onClick={() => editor.flip('h')}>Flip</button>
            <button data-testid="union" onClick={() => editor.boolean('union')}>Union</button>
          </div>
        )}
        {panel === 'Libraries' && (
          <div className="stack">
            <input data-testid="library-search" value={query} placeholder="Search shapes" onChange={(event) => { setQuery(event.target.value); setScroll(0) }} />
            <div className="library" data-testid="library-list" onScroll={(event) => setScroll(event.currentTarget.scrollTop)}>
              <div style={{ height: results.length * rowHeight }}>
                {visible.map((item, index) => (
                  <button key={item.id} data-testid="symbol-item" style={{ top: (start + index) * rowHeight }} onClick={() => editor.placeSymbol(item.id)}>
                    {item.name}
                  </button>
                ))}
              </div>
            </div>
            <p data-testid="catalog-count">{CATALOG.length} shapes</p>
          </div>
        )}
        {panel === 'Plugins' && (
          <div className="stack">
            <textarea data-testid="plugin-code" value={pluginCode} onChange={(event) => setPluginCode(event.target.value)} rows={6} />
            <button data-testid="plugin-run" onClick={() => editor.runPlugin(pluginCode)}>Run</button>
            <button data-testid="plugin-save" onClick={() => editor.savePlugin('Plugin', pluginCode)}>Save</button>
          </div>
        )}
      </aside>
      {exportOpen && (
        <dialog className="dialog" open data-testid="export-dialog">
          <div className="stack">
            <label>Format
              <select data-testid="export-format" value={format} onChange={(event) => setFormat(event.target.value)}>
                {['svg', 'png', 'jpeg', 'pdf', 'gif', 'tiff', 'psd'].map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
            <label>Include
              <select data-testid="export-include" value={include} onChange={(event) => setInclude(event.target.value as typeof include)}>
                <option value="canvas">Entire canvas</option>
                <option value="objects">All objects</option>
                <option value="selection">Selection</option>
              </select>
            </label>
            <label>JPEG quality <input data-testid="jpeg-quality" type="number" defaultValue={0.9} min={0.1} max={1} step={0.1} /></label>
            <button data-testid="export-confirm" onClick={() => void confirmExport(editor, format, include)}>Download</button>
            <button onClick={() => setExportOpen(false)}>Close</button>
          </div>
        </dialog>
      )}
    </div>
  )
}

async function confirmExport(editor: Editor, format: string, include: 'canvas' | 'objects' | 'selection'): Promise<void> {
  try {
    if (format === 'svg') {
      download(`${editor.doc.name}.svg`, editor.exportSvg({ include }), 'image/svg+xml')
      return
    }
    if (format === 'pdf') {
      const bytes = await editor.exportPdf({ include })
      download(`${editor.doc.name}.pdf`, new Blob([bytes.slice()]), 'application/pdf')
      return
    }
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(editor.doc.canvas.width))
    canvas.height = Math.max(1, Math.round(editor.doc.canvas.height))
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const view = { ...editor.view }
    editor.view = { zoom: 1, panX: 0, panY: 0 }
    canvasRenderer.render(ctx, canvas.width, canvas.height, 1, editor)
    editor.view = view
    if (format === 'psd') {
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data
      download(`${editor.doc.name}.psd`, new Blob([new Uint8Array(exportPsd(canvas.width, canvas.height, pixels))]), 'image/vnd.adobe.photoshop')
      return
    }
    if (format === 'tiff') {
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data
      download(`${editor.doc.name}.tiff`, new Blob([new Uint8Array(exportTiff(canvas.width, canvas.height, pixels))]), 'image/tiff')
      return
    }
    const mime = format === 'jpeg' ? 'image/jpeg' : format === 'gif' ? 'image/gif' : 'image/png'
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mime === 'image/gif' ? 'image/png' : mime, 0.9))
    if (blob) download(`${editor.doc.name}.${format}`, blob, mime)
  } catch (error) {
    editor.banner = error instanceof Error ? error.message : 'Export failed'
    editor.emit()
  }
}

declare global {
  interface Window {
    __measured?: {
      editor: Editor
      seed: (count: number) => void
      frames: () => number[]
    }
  }
}
