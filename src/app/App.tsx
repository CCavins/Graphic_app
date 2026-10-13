import { useEffect, useRef, useState } from 'react'
import { RULER_SIZE, type Editor, type Tool } from '../editor/editor'
import { canvasRenderer } from '../render/draw'
import { findNode } from '../model/factory'
import { textFrame } from '../model/geometry'
import type { BaseUnit } from '../model/types'
import { loadAutosave, saveAutosave, saveWithPicker } from '../storage/files'
import { ExportDialog, HelpDialog, NewDocumentDialog, PluginsDialog, RecolorDialog, SelectSimilarDialog } from './dialogs'
import { OrgIcon, ToolIcon } from './icons'
import { editor } from './instance'
import { OptionsBar, TOOL_NAMES } from './OptionsBar'
import { AppearancePanel } from './panels/Appearance'
import { LayersPanel } from './panels/Layers'
import { LibrariesPanel } from './panels/Libraries'
import { PropertiesPanel } from './panels/Properties'
import { ColorWell } from './ui'
import './styles.css'

const TOOLS: Tool[] = ['select', 'pathSelect', 'pen', 'pencil', 'brush', 'line', 'arc', 'rect', 'roundRect', 'ellipse', 'polygon', 'star', 'text', 'eraser', 'scissors', 'addAnchor', 'gradient', 'hand', 'zoom']
const PANES = ['Properties', 'Appearance', 'Layers', 'Libraries'] as const
type Pane = (typeof PANES)[number]
type DialogName = 'new' | 'export' | 'recolor' | 'similar' | 'plugins' | 'help' | null

export function App() {
  const [, setTick] = useState(0)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const textRef = useRef<HTMLTextAreaElement>(null)
  const [narrow, setNarrow] = useState(() => window.matchMedia('(max-width: 1023px)').matches)
  const [open, setOpen] = useState<Record<Pane, boolean>>({ Properties: true, Appearance: true, Layers: false, Libraries: false })
  const [sheet, setSheet] = useState<Pane | null>(null)
  const [dialog, setDialog] = useState<DialogName>(null)

  useEffect(() => editor.subscribe(() => setTick((value) => value + 1)), [])

  useEffect(() => {
    const field = textRef.current
    if (!field) return
    field.focus()
    if (field.value === 'Text') field.select()
  }, [editor.editingTextId])

  useEffect(() => {
    const media = window.matchMedia('(max-width: 1023px)')
    const update = () => setNarrow(media.matches)
    media.addEventListener('change', update)
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable) return
      if (dialog) return
      const stage = stageRef.current?.getBoundingClientRect()
      editor.key(event.key, { shift: event.shiftKey, alt: event.altKey, meta: event.metaKey || event.ctrlKey }, stage ? { width: stage.width, height: stage.height } : undefined)
      if (event.key === ' ' || ((event.metaKey || event.ctrlKey) && ['a', 'd', 'g', 'j', '8', '[', ']', 'z'].includes(event.key.toLowerCase()))) event.preventDefault()
    }
    const onKeyUp = (event: KeyboardEvent) => editor.keyUp(event.key)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      media.removeEventListener('change', update)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [dialog])

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
    window.__measured = {
      editor,
      seed(count: number) {
        editor.seedRects(count)
      },
      frames() {
        return performance.getEntriesByName('pointer-move').map((entry) => entry.duration)
      },
    }
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
      editor.context = null
      editor.pointerDown(fromPointer(event))
      if (editor.editingTextId) event.preventDefault()
    }
    const onMove = (event: PointerEvent) => {
      const coalesced = event.getCoalescedEvents?.() ?? []
      const drawing = editor.tool === 'pen' || editor.tool === 'pencil' || editor.tool === 'brush' || editor.tool === 'eraser'
      const samples = drawing && coalesced.length ? coalesced : [event]
      samples.forEach((sample, index) => {
        const input = fromPointer(sample)
        performance.mark('pm-start')
        editor.pointerMove(input, index === samples.length - 1)
        performance.mark('pm-end')
        performance.measure('pointer-move', 'pm-start', 'pm-end')
      })
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
      const x = event.clientX - bounds.left
      const y = event.clientY - bounds.top
      const rulers = editor.doc.canvas.showRulers
      if (rulers && (x < RULER_SIZE || y < RULER_SIZE)) editor.context = { x, y, kind: 'ruler', axis: y < RULER_SIZE ? 'v' : 'h' }
      else editor.context = { x, y, kind: 'canvas' }
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

  const editing = editor.editingTextId ? findNode(editor.doc, editor.editingTextId) : undefined
  const editingFrame = editing ? textFrame(editing) : null
  const editingOrigin = editing ? editor.toClient({ x: editing.x, y: editing.y }) : null
  const selected = editor.one()
  const fillColor = selected ? editor.fillOf(selected)?.color ?? null : editor.paint.fill
  const strokeColor = selected ? editor.strokeOf(selected)?.color ?? null : editor.paint.stroke
  const togglePane = (pane: Pane) => {
    if (narrow) setSheet((current) => (current === pane ? null : pane))
    else setOpen((current) => ({ ...current, [pane]: !current[pane] }))
  }
  const paneOpen = (pane: Pane) => (narrow ? sheet === pane : open[pane])
  const closeDialog = () => setDialog(null)

  return (
    <div className="app" data-narrow={narrow}>
      <header className="doc-bar">
        <strong className="brand">Measured</strong>
        <div className="doc-tabs" data-testid="doc-tabs">
          {editor.docs.map((doc, index) => (
            <button
              key={doc.id}
              className="doc-tab"
              data-testid="doc-tab"
              data-active={index === editor.active}
              onClick={() => editor.selectTab(index)}
              onDoubleClick={() => {
                const name = window.prompt('Document name', doc.name)
                if (name) {
                  editor.selectTab(index)
                  editor.renameDocument(name)
                }
              }}
            >
              {doc.name}
              {index === editor.active && editor.docs.length > 1 && (
                <span className="close" role="button" aria-label="Close document" onClick={(event) => { event.stopPropagation(); editor.closeDocument() }}>×</span>
              )}
            </button>
          ))}
          <button className="doc-tab add" data-testid="new-doc" aria-label="New document" onClick={() => setDialog('new')}>+</button>
        </div>
        <div className="doc-actions">
          <button data-testid="undo" onClick={() => editor.undo()} title="Undo ⌘Z">Undo</button>
          <button data-testid="redo" onClick={() => editor.redo()} title="Redo ⌘⇧Z">Redo</button>
          <button data-testid="open-file" onClick={() => fileRef.current?.click()}>Open…</button>
          <button data-testid="save-file" onClick={() => void saveWithPicker(`${editor.doc.name}.measured`, editor.serialize())}>Save</button>
          <button data-testid="export-open" onClick={() => setDialog('export')}>Export…</button>
          <button data-testid="plugins-open" onClick={() => setDialog('plugins')}>Plugins</button>
          <button data-testid="help-open" onClick={() => setDialog('help')} aria-label="Shortcuts and limits">?</button>
          <input
            ref={fileRef}
            data-testid="file-input"
            hidden
            type="file"
            accept=".measured,.json,.svg,.psd,.pdf,image/*"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void importFile(editor, file)
              event.target.value = ''
            }}
          />
        </div>
      </header>
      <OptionsBar />
      <aside className="toolbar" data-testid="toolbar">
        <span className="tool-name" aria-hidden="true">{TOOL_NAMES[editor.tool]}</span>
        <div className="tools">
          {TOOLS.map((tool) => (
            <button key={tool} className="tool" data-testid={`tool-${tool}`} data-active={editor.tool === tool} aria-label={TOOL_NAMES[tool]} onClick={() => editor.setTool(tool)}>
              <ToolIcon name={tool} />
              <span className="tip" aria-hidden="true">{TOOL_NAMES[tool]}</span>
            </button>
          ))}
        </div>
        <div className="wells" data-testid="color-wells">
          <ColorWell testId="well-fill" label="Fill" color={fillColor} size={26} cmyk={editor.doc.canvas.colorMode === 'cmyk'} onChange={(color) => editor.setFill({ color, enabled: true })} />
          <ColorWell testId="well-stroke" label="Stroke" color={strokeColor} size={26} cmyk={editor.doc.canvas.colorMode === 'cmyk'} onChange={(color) => editor.setStroke({ color, enabled: true })} />
        </div>
      </aside>
      <div className="stage" ref={stageRef}>
        <canvas
          ref={canvasRef}
          data-testid="canvas"
          onDragOver={(event) => {
            const types = [...event.dataTransfer.types]
            if (types.includes('Files') || (!types.includes('application/x-measured-symbol') && !types.includes('text/plain'))) return
            event.preventDefault()
            event.dataTransfer.dropEffect = 'copy'
          }}
          onDrop={(event) => {
            const id = event.dataTransfer.getData('application/x-measured-symbol') || event.dataTransfer.getData('text/plain').replace(/^symbol:/, '')
            if (!id || id.includes('\n')) return
            event.preventDefault()
            const bounds = event.currentTarget.getBoundingClientRect()
            const paper = editor.toPaper({ cx: event.clientX - bounds.left, cy: event.clientY - bounds.top })
            editor.placeSymbol(id, paper.x, paper.y, true)
          }}
        />
        {editing?.text && editingFrame && editingOrigin && (
          <textarea
            ref={textRef}
            data-testid="text-editor"
            className="text-editor"
            value={editing.text.content}
            style={{
              left: editingOrigin.x,
              top: editingOrigin.y,
              width: Math.max(80, editingFrame.w * editor.view.zoom + 8),
              height: Math.max(32, editingFrame.h * editor.view.zoom + 8),
              fontSize: editing.text.fontSize * editor.view.zoom,
              fontFamily: editing.text.fontFamily,
              textAlign: editing.text.align === 'justify' ? 'left' : editing.text.align,
            }}
            onChange={(event) => editor.setTextContent(event.target.value)}
            onSelect={(event) => {
              editor.textSelection = { start: event.currentTarget.selectionStart, end: event.currentTarget.selectionEnd }
            }}
            onBlur={() => editor.stopTextEdit()}
            onKeyDown={(event) => {
              if (event.key === 'Escape') event.currentTarget.blur()
              event.stopPropagation()
            }}
          />
        )}
        <div className="readout" data-testid="readout" style={{ left: RULER_SIZE + 8, top: RULER_SIZE + 8 }}>{editor.readout}</div>
        {editor.banner && (
          <div className="banner" data-testid="banner" role="status">
            {editor.banner}
            <button className="icon-button" aria-label="Dismiss" onClick={() => { editor.banner = null; editor.emit() }}>×</button>
          </div>
        )}
        {(narrow || editor.lastPointer?.type === 'touch') && (
          <div className="chips" data-testid="modifier-chips">
            <button className="chip" data-active={editor.touchMods.constrain} onClick={() => { editor.touchMods.constrain = !editor.touchMods.constrain; editor.emit() }}>Constrain</button>
            <button className="chip" data-active={editor.touchMods.fromCenter} onClick={() => { editor.touchMods.fromCenter = !editor.touchMods.fromCenter; editor.emit() }}>From center</button>
            <button className="chip" data-active={editor.touchMods.duplicate} onClick={() => { editor.touchMods.duplicate = !editor.touchMods.duplicate; editor.emit() }}>Duplicate</button>
          </div>
        )}
        {editor.context && <ContextMenu stage={stageRef.current} />}
      </div>
      <aside className="inspector" data-testid="inspector" data-sheet={narrow ? (sheet ? 'open' : 'closed') : undefined}>
        <div className="pane-tabs">
          {PANES.map((pane) => (
            <button key={pane} className="pane-tab" data-testid={`tab-${pane}`} data-active={paneOpen(pane)} aria-expanded={paneOpen(pane)} onClick={() => togglePane(pane)}>
              {pane}
            </button>
          ))}
        </div>
        <div className="panes">
          {PANES.map((pane) => (
            <section key={pane} className="pane" data-testid={`pane-${pane}`} data-open={paneOpen(pane)}>
              {!narrow && (
                <button className="pane-head" onClick={() => togglePane(pane)} aria-expanded={paneOpen(pane)}>
                  <span className="chev">{paneOpen(pane) ? '▾' : '▸'}</span> {pane}
                </button>
              )}
              {paneOpen(pane) && (
                <div className="pane-body">
                  {pane === 'Properties' && <PropertiesPanel />}
                  {pane === 'Appearance' && <AppearancePanel onRecolor={() => setDialog('recolor')} onSelectSimilar={() => setDialog('similar')} />}
                  {pane === 'Layers' && <LayersPanel />}
                  {pane === 'Libraries' && <LibrariesPanel />}
                </div>
              )}
            </section>
          ))}
        </div>
      </aside>
      {dialog === 'new' && <NewDocumentDialog onClose={closeDialog} />}
      {dialog === 'export' && <ExportDialog onClose={closeDialog} />}
      {dialog === 'recolor' && <RecolorDialog onClose={closeDialog} />}
      {dialog === 'similar' && <SelectSimilarDialog onClose={closeDialog} />}
      {dialog === 'plugins' && <PluginsDialog onClose={closeDialog} />}
      {dialog === 'help' && <HelpDialog onClose={closeDialog} />}
    </div>
  )
}

function ContextMenu({ stage }: { stage: HTMLDivElement | null }) {
  const context = editor.context
  if (!context) return null
  const close = () => {
    editor.context = null
    editor.emit()
  }
  const run = (fn: () => void) => () => {
    fn()
    close()
  }
  const width = stage?.clientWidth ?? 800
  const height = stage?.clientHeight ?? 600
  const style = { left: Math.min(context.x, width - 190), top: Math.min(context.y, height - 240) }
  if (context.kind === 'ruler') {
    const paper = editor.toPaper({ cx: context.x, cy: context.y })
    return (
      <div className="menu" data-testid="context-menu" style={style}>
        <button data-testid="ruler-guide" onClick={run(() => editor.addGuide(context.axis ?? 'h', context.axis === 'v' ? paper.x : paper.y))}>Add guide here</button>
        <button onClick={run(() => editor.clearGuides())}>Clear guides</button>
        <hr />
        {(['px', 'in', 'cm', 'mm'] as BaseUnit[]).map((unit) => (
          <button key={unit} data-testid={`ruler-unit-${unit}`} data-active={editor.doc.canvas.baseUnit === unit} onClick={run(() => editor.setCanvas({ baseUnit: unit }))}>
            Ruler in {unit}
          </button>
        ))}
        <button onClick={run(() => editor.setCanvas({ showRulers: false }))}>Hide rulers</button>
      </div>
    )
  }
  const has = editor.selection.length > 0
  const viewport = { width, height }
  return (
    <div className="menu" data-testid="context-menu" style={style}>
      <button disabled={!has} onClick={run(() => editor.cut())}>Cut</button>
      <button disabled={!has} onClick={run(() => editor.copy())}>Copy</button>
      <button disabled={!editor.clipboardNodes} onClick={run(() => editor.paste(viewport))}>Paste</button>
      <button disabled={!editor.clipboardNodes} onClick={run(() => editor.pasteInPlace())}>Paste in place</button>
      <button disabled={!has} data-testid="menu-duplicate" onClick={run(() => editor.duplicate())}>Duplicate</button>
      <hr />
      <button className="menu-item" disabled={editor.selection.length < 2} onClick={run(() => editor.group())}><OrgIcon name="group" /> Group</button>
      <button className="menu-item" disabled={editor.one()?.kind !== 'group'} onClick={run(() => editor.ungroup())}><OrgIcon name="ungroup" /> Ungroup</button>
      <button className="menu-item" disabled={!has} onClick={run(() => editor.arrange('front'))}><OrgIcon name="front" /> Bring to front</button>
      <button className="menu-item" disabled={!has} onClick={run(() => editor.arrange('forward'))}><OrgIcon name="forward" /> Bring forward</button>
      <button className="menu-item" disabled={!has} onClick={run(() => editor.arrange('backward'))}><OrgIcon name="backward" /> Send backward</button>
      <button className="menu-item" disabled={!has} onClick={run(() => editor.arrange('back'))}><OrgIcon name="back" /> Send to back</button>
      <button disabled={!has} onClick={run(() => editor.selection.forEach((id) => editor.toggleLock(id)))}>Lock / unlock</button>
      <hr />
      <button disabled={!has} onClick={run(() => editor.addLabel('size'))}>Add size label</button>
      <button disabled={!has} onClick={run(() => editor.deleteSelection())}>Delete</button>
      <button onClick={run(() => editor.selectAll())}>Select all</button>
    </div>
  )
}

async function importFile(target: Editor, file: File): Promise<void> {
  const name = file.name.toLowerCase()
  try {
    if (name.endsWith('.svg')) {
      target.importSvg(await file.text(), file.name.replace(/\.svg$/i, ''))
    } else if (name.endsWith('.psd')) {
      target.importPsd(new Uint8Array(await file.arrayBuffer()), file.name)
    } else if (name.endsWith('.pdf')) {
      target.importPdfPage(612, 792, file.name)
    } else if (file.type.startsWith('image/')) {
      const href = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result))
        reader.onerror = () => reject(new Error('Could not read the image'))
        reader.readAsDataURL(file)
      })
      const size = await new Promise<{ width: number; height: number }>((resolve, reject) => {
        const img = new Image()
        img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
        img.onerror = () => reject(new Error('Could not decode the image'))
        img.src = href
      })
      target.importImage(href, size.width, size.height, file.name)
    } else {
      const text = await file.text()
      if (/"library"\s*:/.test(text) && !/"document"\s*:/.test(text)) target.importLibrary(text)
      else target.loadText(text)
    }
  } catch (error) {
    target.banner = error instanceof Error ? error.message : 'Import failed'
    target.emit()
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
