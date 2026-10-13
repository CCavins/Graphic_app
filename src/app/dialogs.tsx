import { useEffect, useState, type ReactNode } from 'react'
import { LIMITATIONS } from '../editor/editor'
import { SHORTCUTS } from '../input/shortcuts'
import type { AdjustMethod } from '../model/color'
import { exportPsd, exportTiff } from '../model/export'
import { PRESETS, type NewDocumentOptions } from '../model/factory'
import type { SimilarKey } from '../model/ops'
import type { BaseUnit, CanvasStyle } from '../model/types'
import { canvasRenderer } from '../render/draw'
import { download } from '../storage/files'
import { editor } from './instance'
import { Field, Row, Slider } from './ui'

export function Dialog({ title, onClose, children, testId, wide }: { title: string; onClose: () => void; children: ReactNode; testId?: string; wide?: boolean }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="scrim" onPointerDown={(event) => event.target === event.currentTarget && onClose()}>
      <dialog className={wide ? 'dialog wide' : 'dialog'} open data-testid={testId} onKeyDown={(event) => event.stopPropagation()}>
        <header className="dialog-head">
          <strong>{title}</strong>
          <button className="icon-button" aria-label="Close" onClick={onClose}>×</button>
        </header>
        <div className="stack">{children}</div>
      </dialog>
    </div>
  )
}

const STYLES: { id: CanvasStyle; name: string }[] = [
  { id: 'plain', name: 'Plain' },
  { id: 'graph', name: 'Graph paper' },
  { id: 'notebook', name: 'Notebook' },
  { id: 'blueprint', name: 'Blueprint' },
]

export function NewDocumentDialog({ onClose }: { onClose: () => void }) {
  const [options, setOptions] = useState<Required<NewDocumentOptions>>({ preset: 'letter', name: 'Untitled', width: 11 * 72, height: 8.5 * 72, baseUnit: 'in', orientation: 'landscape', style: 'plain', colorMode: 'rgb' })
  const patch = (next: Partial<NewDocumentOptions>) => setOptions((current) => ({ ...current, ...next }) as Required<NewDocumentOptions>)
  const groups = ['Print', 'Screen', 'Other'] as const
  const per = options.baseUnit === 'px' ? 1 : options.baseUnit === 'in' ? 72 : options.baseUnit === 'cm' ? 72 / 2.54 : 72 / 25.4
  const show = (points: number) => String(Number((points / per).toFixed(options.baseUnit === 'px' ? 0 : 2)))
  return (
    <Dialog title="New Document" onClose={onClose} testId="new-document">
      <Field label="Name" testId="new-name" width={200} value={options.name} onCommit={(name) => patch({ name })} />
      <label className="field">
        <span>Preset</span>
        <select
          data-testid="new-preset"
          value={options.preset}
          onChange={(event) => {
            const preset = PRESETS.find((item) => item.id === event.target.value)
            if (!preset) return
            const landscape = preset.width >= preset.height
            patch({ preset: preset.id, width: preset.width, height: preset.height, baseUnit: preset.baseUnit, orientation: landscape ? 'landscape' : 'portrait' })
          }}
        >
          {groups.map((group) => (
            <optgroup key={group} label={group}>
              {PRESETS.filter((preset) => preset.group === group).map((preset) => (
                <option key={preset.id} value={preset.id}>{preset.name}</option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      <Row>
        <Field label="Width" testId="new-width" width={64} value={show(options.width)} onCommit={(raw) => patch({ preset: 'custom', width: Math.max(1, Number(raw) || 1) * per })} />
        <Field label="Height" testId="new-height" width={64} value={show(options.height)} onCommit={(raw) => patch({ preset: 'custom', height: Math.max(1, Number(raw) || 1) * per })} />
        <label className="field">
          <span>Units</span>
          <select data-testid="new-unit" value={options.baseUnit} onChange={(event) => patch({ baseUnit: event.target.value as BaseUnit })}>
            {(['px', 'in', 'cm', 'mm'] as BaseUnit[]).map((unit) => <option key={unit}>{unit}</option>)}
          </select>
        </label>
      </Row>
      <Row>
        <div className="segmented" role="group" aria-label="Orientation">
          <button data-testid="new-portrait" data-active={options.orientation === 'portrait'} onClick={() => patch({ orientation: 'portrait' })}>Portrait</button>
          <button data-testid="new-landscape" data-active={options.orientation === 'landscape'} onClick={() => patch({ orientation: 'landscape' })}>Landscape</button>
        </div>
        <div className="segmented" role="group" aria-label="Color mode">
          <button data-active={options.colorMode === 'rgb'} onClick={() => patch({ colorMode: 'rgb' })}>RGB</button>
          <button data-testid="new-cmyk" data-active={options.colorMode === 'cmyk'} onClick={() => patch({ colorMode: 'cmyk' })}>CMYK</button>
        </div>
      </Row>
      <div className="style-grid" role="group" aria-label="Canvas style">
        {STYLES.map((style) => (
          <button key={style.id} data-testid={`style-${style.id}`} data-active={options.style === style.id} className={`style-card ${style.id}`} onClick={() => patch({ style: style.id })}>
            <span className="style-thumb" aria-hidden="true" />
            {style.name}
          </button>
        ))}
      </div>
      <Row>
        <button
          className="primary"
          data-testid="new-create"
          onClick={() => {
            editor.newDocument(options)
            onClose()
          }}
        >
          Create
        </button>
        <button onClick={onClose}>Cancel</button>
      </Row>
    </Dialog>
  )
}

type Include = 'canvas' | 'objects' | 'selection'

export function ExportDialog({ onClose }: { onClose: () => void }) {
  const [format, setFormat] = useState('svg')
  const [include, setInclude] = useState<Include>('canvas')
  const [scale, setScale] = useState(1)
  const [quality, setQuality] = useState(0.9)
  const [resolution, setResolution] = useState(72)
  const slices = editor.slices()
  const layers = editor.layerExports()
  const raster = !['svg', 'pdf'].includes(format)
  return (
    <Dialog title="Export" onClose={onClose} testId="export-dialog">
      <Row>
        <label className="field">
          <span>Format</span>
          <select data-testid="export-format" value={format} onChange={(event) => setFormat(event.target.value)}>
            {['svg', 'pdf', 'png', 'jpeg', 'gif', 'tiff', 'psd'].map((item) => <option key={item} value={item}>{item.toUpperCase()}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Include</span>
          <select data-testid="export-include" value={include} onChange={(event) => setInclude(event.target.value as Include)}>
            <option value="canvas">Entire canvas</option>
            <option value="objects">All objects</option>
            <option value="selection">Selection</option>
          </select>
        </label>
      </Row>
      <Row>
        <div className="segmented" role="group" aria-label="Scale">
          {[1, 2, 3].map((factor) => (
            <button key={factor} data-testid={`export-${factor}x`} data-active={scale === factor} onClick={() => setScale(factor)}>{factor}x</button>
          ))}
        </div>
        {raster && <Field label="Resolution (dpi)" width={56} value={String(resolution)} onCommit={(raw) => setResolution(Math.max(36, Number(raw) || 72))} />}
        {format === 'jpeg' && <Slider label="Quality" testId="jpeg-quality" min={0.1} max={1} step={0.1} value={quality} onChange={setQuality} />}
      </Row>
      <Row wrap>
        <button className="primary" data-testid="export-confirm" onClick={() => void confirmExport(format, include, scale * (raster ? resolution / 72 : 1), quality)}>Download</button>
        <button data-testid="copy-svg" onClick={() => void navigator.clipboard?.writeText(editor.copyAsSvg()).catch(() => undefined)}>Copy as SVG</button>
        <button data-testid="copy-css" onClick={() => void navigator.clipboard?.writeText(editor.copyAsCss()).catch(() => undefined)}>Copy as CSS</button>
      </Row>
      <Row wrap>
        <button data-testid="export-slices" disabled={!slices.length} onClick={() => editor.sliceExports().forEach((item) => download(item.filename, item.svg, 'image/svg+xml'))}>
          Export slices ({slices.length})
        </button>
        <button data-testid="export-layers" disabled={!layers.length} onClick={() => layers.forEach((item) => download(item.filename, item.svg, 'image/svg+xml'))}>
          Export layers ({layers.length})
        </button>
      </Row>
      <p className="hint">Name an object “@slice:icon.svg” to export it on its own. {LIMITATIONS['cmyk-pdf']}</p>
    </Dialog>
  )
}

async function confirmExport(format: string, include: Include, scale: number, quality: number): Promise<void> {
  try {
    if (format === 'svg') {
      download(`${editor.doc.name}.svg`, editor.exportSvg({ include, scale }), 'image/svg+xml')
      return
    }
    if (format === 'pdf') {
      const bytes = await editor.exportPdf({ include, scale })
      download(`${editor.doc.name}.pdf`, new Blob([bytes.slice()]), 'application/pdf')
      return
    }
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(editor.doc.canvas.width * scale))
    canvas.height = Math.max(1, Math.round(editor.doc.canvas.height * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const view = { ...editor.view }
    const rulers = editor.doc.canvas.showRulers
    const selection = editor.selection
    editor.view = { zoom: scale, panX: 0, panY: 0 }
    editor.doc.canvas.showRulers = false
    editor.selection = []
    canvasRenderer.render(ctx, canvas.width, canvas.height, 1, editor)
    editor.view = view
    editor.doc.canvas.showRulers = rulers
    editor.selection = selection
    if (format === 'psd' || format === 'tiff') {
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data
      const bytes = format === 'psd' ? exportPsd(canvas.width, canvas.height, pixels) : exportTiff(canvas.width, canvas.height, pixels)
      download(`${editor.doc.name}.${format}`, new Blob([new Uint8Array(bytes)]), format === 'psd' ? 'image/vnd.adobe.photoshop' : 'image/tiff')
      return
    }
    const mime = format === 'jpeg' ? 'image/jpeg' : 'image/png'
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mime, quality))
    if (blob) download(`${editor.doc.name}.${format}`, blob, format === 'gif' ? 'image/gif' : mime)
  } catch (error) {
    editor.banner = error instanceof Error ? error.message : 'Export failed'
    editor.emit()
  }
}

const METHODS: { id: AdjustMethod; name: string; min: number; max: number }[] = [
  { id: 'hue', name: 'Hue', min: -0.5, max: 0.5 },
  { id: 'saturation', name: 'Saturation', min: -1, max: 1 },
  { id: 'brightness', name: 'Brightness', min: -1, max: 1 },
  { id: 'contrast', name: 'Contrast', min: -1, max: 1 },
  { id: 'balance', name: 'Color balance', min: -1, max: 1 },
]

export function RecolorDialog({ onClose }: { onClose: () => void }) {
  const [values, setValues] = useState<Partial<Record<AdjustMethod, number>>>({})
  useEffect(() => {
    editor.beginRecolor()
  }, [])
  const update = (id: AdjustMethod, value: number) => {
    const next = { ...values, [id]: value }
    setValues(next)
    editor.previewRecolor(next)
  }
  const cancel = () => {
    editor.resetRecolor()
    onClose()
  }
  return (
    <Dialog title="Recolor Artwork" onClose={cancel} testId="recolor-dialog">
      {METHODS.map((method) => (
        <Slider key={method.id} label={method.name} testId={`recolor-${method.id}`} min={method.min} max={method.max} step={0.01} value={values[method.id] ?? 0} onChange={(value) => update(method.id, value)} />
      ))}
      <Row>
        <button className="primary" data-testid="recolor-apply" onClick={() => { editor.commitRecolor(); onClose() }}>Apply</button>
        <button data-testid="recolor-reset" onClick={() => { setValues({}); editor.resetRecolor(); editor.beginRecolor() }}>Reset</button>
        <button onClick={cancel}>Cancel</button>
      </Row>
    </Dialog>
  )
}

const SIMILAR: { id: SimilarKey; name: string }[] = [
  { id: 'appearance', name: 'Appearance' },
  { id: 'fill-stroke', name: 'Fill & stroke' },
  { id: 'fill', name: 'Fill' },
  { id: 'fill-color', name: 'Fill color' },
  { id: 'fill-type', name: 'Fill type' },
  { id: 'stroke', name: 'Stroke' },
  { id: 'stroke-color', name: 'Stroke color' },
  { id: 'stroke-type', name: 'Stroke type' },
  { id: 'stroke-width', name: 'Stroke width' },
  { id: 'opacity', name: 'Opacity' },
]

export function SelectSimilarDialog({ onClose }: { onClose: () => void }) {
  const [scope, setScope] = useState<'layer' | 'all'>('all')
  return (
    <Dialog title="Select Similar" onClose={onClose} testId="similar-dialog">
      <div className="segmented" role="group" aria-label="Scope">
        <button data-active={scope === 'all'} onClick={() => setScope('all')}>All layers</button>
        <button data-testid="similar-layer" data-active={scope === 'layer'} onClick={() => setScope('layer')}>Current layer</button>
      </div>
      <Row wrap>
        {SIMILAR.map((item) => (
          <button key={item.id} data-testid={`similar-${item.id}`} onClick={() => { editor.selectSimilar(item.id, scope); onClose() }}>{item.name}</button>
        ))}
      </Row>
    </Dialog>
  )
}

export function PluginsDialog({ onClose }: { onClose: () => void }) {
  const [code, setCode] = useState('api.createRect(40, 40, 80, 50)\napi.setFill("#3f9d5a")')
  const [name, setName] = useState('My plugin')
  return (
    <Dialog title="Plugins" onClose={onClose} testId="plugins-dialog" wide>
      <textarea data-testid="plugin-code" value={code} rows={6} spellCheck={false} onChange={(event) => setCode(event.target.value)} />
      <Row>
        <button className="primary" data-testid="plugin-run" onClick={() => { try { editor.runPlugin(code) } catch { /* banner shows the error */ } }}>Run</button>
        <Field label="Name" width={120} value={name} onCommit={setName} />
        <button data-testid="plugin-save" onClick={() => editor.savePlugin(name, code)}>Save</button>
      </Row>
      {editor.plugins.map((plugin) => (
        <Row key={plugin.id}>
          <button className="grow" data-testid="saved-plugin" onClick={() => { try { editor.runPlugin(plugin.code) } catch { /* banner */ } }}>{plugin.name}</button>
          <button onClick={() => setCode(plugin.code)}>Edit</button>
          <button className="icon-button" aria-label={`Delete ${plugin.name}`} onClick={() => editor.deletePlugin(plugin.id)}>×</button>
        </Row>
      ))}
      <p className="hint">Plugins get an <code>api</code> with createRect, createEllipse, createText, placeSymbol, setFill, setStroke, move, select, getSelection, getDocument, setScale, and alert.</p>
    </Dialog>
  )
}

export function HelpDialog({ onClose }: { onClose: () => void }) {
  return (
    <Dialog title="Shortcuts and browser limits" onClose={onClose} testId="help-dialog" wide>
      <div className="two-col">
        <div data-testid="shortcuts">
          <h4>Shortcuts</h4>
          {SHORTCUTS.map((item) => (
            <div key={item.keys} className="shortcut" data-reserved={item.reserved}>
              <kbd>{item.keys}</kbd> {item.action}
            </div>
          ))}
          {[
            ['⌘A', 'Select all'],
            ['⌘C / ⌘X / ⌘V', 'Copy, cut, paste'],
            ['⌘⇧V', 'Paste in place'],
            ['⌘D', 'Smart duplicate'],
            ['⌘G / ⌘⇧G', 'Group, ungroup'],
            ['⌘] / ⌘[', 'Bring forward, send backward'],
            ['⌘J', 'Connect endpoints'],
            ['⌘8', 'Compound path'],
            ['E / C / + / G', 'Eraser, scissors, add anchor, gradient'],
            ['Arrows', 'Nudge (Shift ×10)'],
          ].map(([keys, action]) => (
            <div key={keys} className="shortcut"><kbd>{keys}</kbd> {action}</div>
          ))}
        </div>
        <div data-testid="limitations">
          <h4>Not available in the browser</h4>
          {Object.entries(LIMITATIONS).map(([key, text]) => (
            <p key={key}>{text}</p>
          ))}
        </div>
      </div>
    </Dialog>
  )
}
