import { useState } from 'react'
import type { BaseUnit, CanvasStyle, LabelKind, LabelLocation, LabelUnit, ObjectLabel, TransformOrigin, TransformStep } from '../../model/types'
import { applyCanvasStyle } from '../../model/factory'
import { inchesPerBaseUnit, parseLength } from '../../model/units'
import { IDENTITY_STEP } from '../../model/transform'
import { editor } from '../instance'
import { ColorWell, Field, guarded, Row, Section } from '../ui'

const LABEL_UNITS: LabelUnit[] = ['px', 'in', 'ft', 'ft-in', 'yd', 'mi', 'mm', 'cm', 'm', 'km']
const BASE_UNITS: BaseUnit[] = ['px', 'in', 'cm', 'mm']
const ORIGINS: TransformOrigin[] = ['nw', 'n', 'ne', 'w', 'c', 'e', 'sw', 's', 'se']

function baseLength(points: number, unit: BaseUnit): string {
  const value = points / (72 * inchesPerBaseUnit(unit))
  return `${Number(value.toFixed(unit === 'px' ? 0 : 3))} ${unit}`
}

function safe(fn: () => void): void {
  guarded(fn, (message) => {
    editor.banner = message
    editor.emit()
  })
}

/** Paper points for a typed canvas size; bare numbers are in the base unit. */
function paperPoints(raw: string, unit: BaseUnit): number {
  const text = /[a-z]/i.test(raw) ? raw : `${raw} ${unit}`
  return parseLength(text, 1 / 72) * 72
}

export function PropertiesPanel() {
  const canvas = editor.doc.canvas
  const node = editor.one()
  const labels = node ? editor.labelsOf(node) : []
  return (
    <>
      <Section title="Canvas" testId="section-canvas">
        <Row>
          <Field label="Width" testId="canvas-width" value={baseLength(canvas.width, canvas.baseUnit)} onCommit={(raw) => safe(() => editor.setCanvasSize(paperPoints(raw, canvas.baseUnit), canvas.height))} />
          <Field label="Height" testId="canvas-height" value={baseLength(canvas.height, canvas.baseUnit)} onCommit={(raw) => safe(() => editor.setCanvasSize(canvas.width, paperPoints(raw, canvas.baseUnit)))} />
          <button className="icon-button" title="Swap orientation" data-testid="orientation" onClick={() => editor.setCanvasSize(canvas.height, canvas.width)}>⟲</button>
        </Row>
        <Row>
          <label className="field">
            <span>Units</span>
            <select data-testid="base-unit" value={canvas.baseUnit} onChange={(event) => editor.setCanvas({ baseUnit: event.target.value as BaseUnit })}>
              {BASE_UNITS.map((unit) => <option key={unit}>{unit}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Style</span>
            <select
              data-testid="canvas-style"
              value={canvas.style}
              onChange={(event) => {
                editor.snapshot()
                applyCanvasStyle(editor.doc.canvas, event.target.value as CanvasStyle)
                editor.emit()
              }}
            >
              <option value="plain">Plain</option>
              <option value="graph">Graph paper</option>
              <option value="notebook">Notebook</option>
              <option value="blueprint">Blueprint</option>
            </select>
          </label>
          <label className="field">
            <span>Color</span>
            <select data-testid="color-mode" value={canvas.colorMode} onChange={(event) => editor.setCanvas({ colorMode: event.target.value as 'rgb' | 'cmyk' })}>
              <option value="rgb">RGB</option>
              <option value="cmyk">CMYK</option>
            </select>
          </label>
        </Row>
        <ScaleRow />
        <Row wrap>
          <label className="check"><input type="checkbox" data-testid="show-rulers" checked={canvas.showRulers} onChange={(event) => editor.setCanvas({ showRulers: event.target.checked })} /> Rulers</label>
          <label className="check"><input type="checkbox" data-testid="smart-guides" checked={canvas.smartGuides} onChange={(event) => editor.setCanvas({ smartGuides: event.target.checked })} /> Smart guides</label>
          <label className="check"><input type="checkbox" checked={canvas.pixelAlignStrokes} onChange={(event) => editor.setCanvas({ pixelAlignStrokes: event.target.checked })} /> Pixel-align</label>
        </Row>
        <Row>
          <label className="field">
            <span>View</span>
            <select data-testid="view-mode" value={canvas.viewMode} onChange={(event) => editor.setCanvas({ viewMode: event.target.value as typeof canvas.viewMode })}>
              <option value="vector">Vector</option>
              <option value="pixels">Pixels</option>
              <option value="outline">Outline</option>
            </select>
          </label>
          <label className="field">
            <span>Background</span>
            <ColorWell testId="canvas-background" color={canvas.background} cmyk={canvas.colorMode === 'cmyk'} onChange={(color) => editor.setCanvas({ background: color })} />
          </label>
          <label className="field">
            <span>Selection</span>
            <input type="color" data-testid="selection-color" value={canvas.selectionColor} onChange={(event) => editor.setCanvas({ selectionColor: event.target.value })} />
          </label>
        </Row>
        <ResizeRow />
      </Section>
      <Section title="Grid" testId="section-grid" defaultOpen={false}>
        <Row wrap>
          <label className="check"><input type="checkbox" data-testid="grid-show" checked={canvas.grid.show} onChange={(event) => editor.setGrid({ show: event.target.checked })} /> Show grid</label>
          <label className="check"><input type="checkbox" data-testid="grid-snap" checked={canvas.grid.snap} onChange={(event) => editor.setGrid({ snap: event.target.checked })} /> Snap to grid</label>
          <label className="check"><input type="checkbox" checked={canvas.grid.snapPoints} onChange={(event) => editor.setGrid({ snapPoints: event.target.checked })} /> Snap to points</label>
        </Row>
        <Row>
          <Field label="Spacing X" width={56} value={String(Number(canvas.grid.spacingX.toFixed(2)))} onCommit={(raw) => editor.setGrid({ spacingX: Math.max(0, Number(raw) || 0) })} />
          <Field label="Spacing Y" width={56} value={String(Number(canvas.grid.spacingY.toFixed(2)))} onCommit={(raw) => editor.setGrid({ spacingY: Math.max(0, Number(raw) || 0) })} />
          <Field label="Subdivisions" width={48} value={String(canvas.grid.subdivisions)} onCommit={(raw) => editor.setGrid({ subdivisions: Math.max(1, Math.round(Number(raw) || 1)) })} />
        </Row>
        <Row>
          {(['top', 'right', 'bottom', 'left'] as const).map((side) => (
            <Field key={side} label={`Margin ${side}`} width={48} value={String(canvas.grid.margins[side])} onCommit={(raw) => editor.setGrid({ margins: { ...canvas.grid.margins, [side]: Math.max(0, Number(raw) || 0) } })} />
          ))}
        </Row>
        <Row wrap>
          <label className="check"><input type="checkbox" checked={canvas.grid.extend} onChange={(event) => editor.setGrid({ extend: event.target.checked })} /> Extend past margins</label>
          <label className="check"><input type="checkbox" checked={canvas.grid.originFromMargin} onChange={(event) => editor.setGrid({ originFromMargin: event.target.checked })} /> Origin at margin</label>
        </Row>
        <Row>
          <button data-testid="clear-guides" onClick={() => editor.clearGuides()}>Clear guides ({editor.doc.guides.length})</button>
        </Row>
      </Section>
      <Section title="Label" testId="section-label">
        <Row wrap>
          {(['width', 'height', 'size', 'area', 'length'] as LabelKind[]).map((kind) => (
            <button key={kind} data-testid={`label-${kind}`} disabled={!editor.selection.length} onClick={() => editor.addLabel(kind)}>
              {kind[0].toUpperCase() + kind.slice(1)}
            </button>
          ))}
          <button data-testid="label-text" disabled={!editor.selection.length} onClick={() => editor.addLabel('text', 'Note')}>Text</button>
          <button data-testid="label-clear" disabled={!editor.selection.length} onClick={() => editor.clearLabels()}>Clear</button>
        </Row>
        <Row>
          <label className="field">
            <span>Unit</span>
            <select data-testid="label-unit" value={canvas.labelUnit} onChange={(event) => editor.setLabelUnit(event.target.value as LabelUnit)}>
              {LABEL_UNITS.map((unit) => <option key={unit}>{unit}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Precision</span>
            <select
              data-testid="precision"
              value={canvas.precision.mode === 'fraction' ? `f${canvas.precision.denominator}` : `d${canvas.precision.decimals}`}
              onChange={(event) => {
                const value = event.target.value
                if (value.startsWith('f')) editor.setPrecision({ mode: 'fraction', denominator: Number(value.slice(1)) as 2 | 4 | 8 | 16 | 32 })
                else editor.setPrecision({ mode: 'decimal', decimals: Number(value.slice(1)) })
              }}
            >
              {[0, 1, 2, 3, 4].map((d) => <option key={d} value={`d${d}`}>{d} decimals</option>)}
              {[2, 4, 8, 16, 32].map((f) => <option key={f} value={`f${f}`}>1/{f}</option>)}
            </select>
          </label>
          <label className="check"><input type="checkbox" data-testid="trim-zeros" checked={canvas.precision.trimZeros} onChange={(event) => editor.setPrecision({ trimZeros: event.target.checked })} /> Trim zeros</label>
          <label className="check"><input type="checkbox" data-testid="show-units" checked={canvas.showUnits} onChange={(event) => editor.setCanvas({ showUnits: event.target.checked })} /> Units</label>
        </Row>
        {node && labels.length > 0 && (
          <div className="label-list" data-testid="label-list">
            {labels.map((label, index) => (
              <LabelRow key={index} index={index} label={label} text={editor.labelText(node, label)} />
            ))}
          </div>
        )}
        {node && !labels.length && <p className="hint">Select an object and add a label. Width sits above, height on the left, size on top.</p>}
      </Section>
      <Section title="Align" testId="section-align" defaultOpen={false}>
        <Row wrap>
          {(['left', 'center', 'right', 'top', 'middle', 'bottom'] as const).map((mode) => (
            <button key={mode} data-testid={`align-${mode}`} onClick={() => editor.align(mode)}>{mode}</button>
          ))}
        </Row>
        <Row wrap>
          <button data-testid="distribute" onClick={() => editor.distribute('h')}>Distribute H</button>
          <button onClick={() => editor.distribute('v')}>Distribute V</button>
          <button data-testid="flip" onClick={() => editor.flip('h')}>Flip H</button>
          <button onClick={() => editor.flip('v')}>Flip V</button>
        </Row>
        <Row wrap>
          <button onClick={() => editor.arrange('front')}>To front</button>
          <button onClick={() => editor.arrange('forward')}>Forward</button>
          <button onClick={() => editor.arrange('backward')}>Backward</button>
          <button onClick={() => editor.arrange('back')}>To back</button>
        </Row>
      </Section>
      <Section title="Transform" testId="section-transform" defaultOpen={false}>
        <TransformPanel />
      </Section>
    </>
  )
}

function ScaleRow() {
  const canvas = editor.doc.canvas
  const [paper, setPaper] = useState('1 in')
  const [real, setReal] = useState('1 ft')
  const apply = (p: string, r: string) => {
    const paperMatch = p.trim().match(/^([\d./]+)\s*(px|in|cm|mm)$/i)
    const realMatch = r.trim().match(/^([\d./]+)\s*([a-z-]+)$/i)
    if (!paperMatch || !realMatch) {
      editor.banner = 'Enter a scale like "1/4 in = 1 ft"'
      editor.emit()
      return
    }
    const num = (text: string) => (text.includes('/') ? Number(text.split('/')[0]) / Number(text.split('/')[1]) : Number(text))
    editor.setScaleStatement(num(paperMatch[1]), paperMatch[2].toLowerCase() as BaseUnit, num(realMatch[1]), realMatch[2].toLowerCase() as LabelUnit)
  }
  return (
    <Row>
      <Field label="Paper" testId="scale-paper" width={56} value={paper} onCommit={(raw) => { setPaper(raw); apply(raw, real) }} />
      <span className="eq">=</span>
      <Field label="Real" testId="scale-real" width={56} value={real} onCommit={(raw) => { setReal(raw); apply(paper, raw) }} />
      <span className="hint" data-testid="scale-readout">{canvas.realInchesPerPoint === 1 / 72 ? '1:1' : `1 pt = ${Number(canvas.realInchesPerPoint.toFixed(4))} in`}</span>
    </Row>
  )
}

function ResizeRow() {
  const [amount, setAmount] = useState('1 in')
  return (
    <Row wrap>
      <Field label="Add" width={52} value={amount} onCommit={setAmount} />
      {(['left', 'right', 'top', 'bottom'] as const).map((side) => (
        <button key={side} data-testid={`resize-${side}`} onClick={() => safe(() => editor.resizeCanvas(side, editor.pointsFor(amount)))}>{side}</button>
      ))}
      <button data-testid="resize-artwork" onClick={() => editor.resizeArtwork(2, true)}>Artwork ×2</button>
      <button onClick={() => editor.resizeArtwork(0.5, true)}>Artwork ×½</button>
    </Row>
  )
}

function LabelRow({ index, label, text }: { index: number; label: ObjectLabel; text: string }) {
  return (
    <div className="label-row" data-testid="label-row">
      <div className="label-head">
        <strong>{label.kind}</strong>
        <span data-testid="label-preview">{text}</span>
        <button className="icon-button" aria-label="Remove label" onClick={() => editor.removeLabel(index)}>×</button>
      </div>
      <Row wrap>
        <label className="field">
          <span>Location</span>
          <select data-testid="label-location" value={label.location} onChange={(event) => editor.updateLabel(index, { location: event.target.value as LabelLocation })}>
            {(['top', 'bottom', 'left', 'right', 'center'] as const).map((location) => <option key={location}>{location}</option>)}
          </select>
        </label>
        <Field label="Offset" testId="label-offset" width={44} value={String(label.offset)} onCommit={(raw) => editor.updateLabel(index, { offset: Number(raw) || 0 })} />
        <label className="field">
          <span>Align</span>
          <select value={label.align} onChange={(event) => editor.updateLabel(index, { align: event.target.value as ObjectLabel['align'] })}>
            {(['horizontal', 'vertical', 'parallel', 'perpendicular', 'centered'] as const).map((align) => <option key={align}>{align}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Precision</span>
          <select
            data-testid="label-precision"
            value={label.precision.mode === 'fraction' ? `f${label.precision.denominator}` : `d${label.precision.decimals}`}
            onChange={(event) => {
              const value = event.target.value
              if (value.startsWith('f')) editor.updateLabel(index, { precision: { mode: 'fraction', denominator: Number(value.slice(1)) as 2 | 4 | 8 | 16 | 32 } })
              else editor.updateLabel(index, { precision: { mode: 'decimal', decimals: Number(value.slice(1)) } })
            }}
          >
            {[0, 1, 2, 3, 4].map((d) => <option key={d} value={`d${d}`}>{d} dec</option>)}
            {[2, 4, 8, 16, 32].map((f) => <option key={f} value={`f${f}`}>1/{f}</option>)}
          </select>
        </label>
        <label className="check"><input type="checkbox" checked={label.precision.trimZeros} onChange={(event) => editor.updateLabel(index, { precision: { trimZeros: event.target.checked } })} /> Trim</label>
        <label className="check"><input type="checkbox" data-testid="label-units" checked={label.showUnits} onChange={(event) => editor.updateLabel(index, { showUnits: event.target.checked })} /> Units</label>
        {label.kind === 'text' && <Field label="Text" value={label.text} width={120} onCommit={(raw) => editor.updateLabel(index, { text: raw })} />}
      </Row>
    </div>
  )
}

function TransformPanel() {
  const [step, setStep] = useState<TransformStep>({ ...IDENTITY_STEP })
  const [copy, setCopy] = useState(false)
  const [scaleStyles, setScaleStyles] = useState(false)
  const patch = (next: Partial<TransformStep>) => setStep((current) => ({ ...current, ...next }))
  const num = (raw: string, fallback: number) => (Number.isFinite(Number(raw)) && raw.trim() !== '' ? Number(raw) : fallback)
  const pts = (raw: string) => {
    if (!raw.trim()) return 0
    try {
      return editor.pointsFor(raw)
    } catch (error) {
      editor.banner = error instanceof Error ? error.message : 'Enter a length'
      editor.emit()
      return 0
    }
  }
  return (
    <div className="stack" data-testid="transform-panel">
      <Row>
        <Field label="Move X" testId="tf-dx" width={56} value={String(step.dx)} onCommit={(raw) => patch({ dx: pts(raw) })} />
        <Field label="Move Y" testId="tf-dy" width={56} value={String(step.dy)} onCommit={(raw) => patch({ dy: pts(raw) })} />
        <Field label="Rotate °" testId="tf-rotate" width={52} value={String(Number(((step.rotate * 180) / Math.PI).toFixed(2)))} onCommit={(raw) => patch({ rotate: (num(raw, 0) * Math.PI) / 180 })} />
      </Row>
      <Row>
        <Field label="Scale X %" testId="tf-scale-x" width={52} value={String(Math.round(step.scaleX * 100))} onCommit={(raw) => patch({ scaleX: num(raw, 100) / 100 })} />
        <Field label="Scale Y %" testId="tf-scale-y" width={52} value={String(Math.round(step.scaleY * 100))} onCommit={(raw) => patch({ scaleY: num(raw, 100) / 100 })} />
        <Field label="Shear X °" testId="tf-shear-x" width={52} value={String(Number(((step.shearX * 180) / Math.PI).toFixed(2)))} onCommit={(raw) => patch({ shearX: (num(raw, 0) * Math.PI) / 180 })} />
        <Field label="Shear Y °" width={52} value={String(Number(((step.shearY * 180) / Math.PI).toFixed(2)))} onCommit={(raw) => patch({ shearY: (num(raw, 0) * Math.PI) / 180 })} />
      </Row>
      <Row>
        <div className="origin-grid" role="group" aria-label="Origin">
          {ORIGINS.map((origin) => (
            <button key={origin} data-testid={`origin-${origin}`} data-active={step.origin === origin} aria-label={origin} onClick={() => patch({ origin })} />
          ))}
        </div>
        <div className="stack">
          <label className="check"><input type="checkbox" data-testid="tf-copy" checked={copy} onChange={(event) => setCopy(event.target.checked)} /> Copy</label>
          <label className="check"><input type="checkbox" data-testid="tf-scale-styles" checked={scaleStyles} onChange={(event) => setScaleStyles(event.target.checked)} /> Scale styles</label>
        </div>
      </Row>
      <Row>
        <button data-testid="tf-apply" disabled={!editor.selection.length} onClick={() => editor.transform(step, { copy, scaleStyles })}>Apply</button>
        <button onClick={() => setStep({ ...IDENTITY_STEP })}>Reset</button>
        <button data-testid="smart-duplicate" disabled={!editor.selection.length} onClick={() => editor.smartDuplicate()}>Smart duplicate ⌘D</button>
      </Row>
    </div>
  )
}
