import { useState } from 'react'
import type { BaseUnit, CanvasStyle, LabelKind, LabelLocation, LabelUnit, ObjectLabel, TransformOrigin, TransformStep } from '../../model/types'
import { applyCanvasStyle } from '../../model/factory'
import { inchesPerBaseUnit } from '../../model/units'
import { formatRatio, formatScale, formatScaleAmount, matchingPreset, parseScaleAmount, ratioFromInchesPerPoint, realUnitsFor, scalePresets, unitSystem } from '../../model/scale'
import { IDENTITY_STEP } from '../../model/transform'
import { editor } from '../instance'
import { OrgIcon } from '../icons'
import { ColorWell, Field, guarded, numberIn, parseFraction, plainNumber, Row, Section } from '../ui'

const LABEL_UNITS: LabelUnit[] = ['px', 'in', 'ft', 'ft-in', 'yd', 'mi', 'mm', 'cm', 'm', 'km']
const BASE_UNITS: BaseUnit[] = ['px', 'in', 'cm', 'mm']
const UNIT_NAMES: Record<BaseUnit, string> = { px: 'px (pixels)', in: 'in (inches)', cm: 'cm', mm: 'mm' }
const ORIGINS: TransformOrigin[] = ['nw', 'n', 'ne', 'w', 'c', 'e', 'sw', 's', 'se']

/** A length in points shown as a bare number in the page unit; the unit itself is shown beside the box. */
function baseNumber(points: number, unit: BaseUnit): string {
  const value = points / (72 * inchesPerBaseUnit(unit))
  return String(Number(value.toFixed(unit === 'px' ? 0 : 3)))
}

/** Points for a bare number (or fraction) typed in the page unit. */
function basePoints(raw: string, unit: BaseUnit): number {
  const value = parseFraction(raw)
  if (value == null) throw new Error('Enter a number')
  return value * 72 * inchesPerBaseUnit(unit)
}

function safe(fn: () => void): void {
  guarded(fn, (message) => {
    editor.banner = message
    editor.emit()
  })
}


export function PropertiesPanel() {
  const canvas = editor.doc.canvas
  const node = editor.one()
  const labels = node ? editor.labelsOf(node) : []
  return (
    <>
      <Section title="Canvas" testId="section-canvas">
        <Row>
          <Field label="Width" testId="canvas-width" width={78} suffix={canvas.baseUnit} title="Page width, in the unit chosen beside it" value={baseNumber(canvas.width, canvas.baseUnit)} validate={plainNumber('Width', { min: 0.001 })} onCommit={(raw) => editor.setCanvasSize(basePoints(raw, canvas.baseUnit), canvas.height)} />
          <Field label="Height" testId="canvas-height" width={78} suffix={canvas.baseUnit} title="Page height, in the unit chosen beside it" value={baseNumber(canvas.height, canvas.baseUnit)} validate={plainNumber('Height', { min: 0.001 })} onCommit={(raw) => editor.setCanvasSize(canvas.width, basePoints(raw, canvas.baseUnit))} />
          <label className="field" title="Unit for the page size, rulers, grid, and the paper side of the scale. Changing it converts the numbers; nothing moves.">
            <span>Unit</span>
            <select data-testid="base-unit" value={canvas.baseUnit} onChange={(event) => editor.setBaseUnit(event.target.value as BaseUnit)}>
              {BASE_UNITS.map((unit) => <option key={unit} value={unit}>{UNIT_NAMES[unit]}</option>)}
            </select>
          </label>
          <button className="icon-button" title="Swap width and height" aria-label="Swap orientation" data-testid="orientation" onClick={() => editor.setCanvasSize(canvas.height, canvas.width)}>⟲</button>
        </Row>
        <Row>
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
          <Field label="Spacing X" width={64} suffix={canvas.baseUnit} title="Distance between major grid lines on the page" value={baseNumber(canvas.grid.spacingX, canvas.baseUnit)} validate={plainNumber('Spacing', { min: 0.001 })} onCommit={(raw) => editor.setGrid({ spacingX: basePoints(raw, canvas.baseUnit) })} />
          <Field label="Spacing Y" width={64} suffix={canvas.baseUnit} title="Distance between major grid lines on the page" value={baseNumber(canvas.grid.spacingY, canvas.baseUnit)} validate={plainNumber('Spacing', { min: 0.001 })} onCommit={(raw) => editor.setGrid({ spacingY: basePoints(raw, canvas.baseUnit) })} />
          <Field label="Subdivisions" width={48} title="Lines between major grid lines" value={String(canvas.grid.subdivisions)} validate={numberIn({ min: 1, max: 100, integer: true, label: 'Subdivisions' })} onCommit={(raw) => editor.setGrid({ subdivisions: Number(raw) })} />
        </Row>
        <Row>
          {(['top', 'right', 'bottom', 'left'] as const).map((side) => (
            <Field key={side} label={`Margin ${side}`} width={60} suffix={canvas.baseUnit} title="Grid margin from the page edge" value={baseNumber(canvas.grid.margins[side], canvas.baseUnit)} validate={plainNumber('Margin', { min: 0 })} onCommit={(raw) => editor.setGrid({ margins: { ...canvas.grid.margins, [side]: basePoints(raw, canvas.baseUnit) } })} />
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
        {editor.selection.length < 2 && <p className="hint" data-testid="align-hint">Select two or more objects to align them; three or more to distribute.</p>}
        <div className="org-bar" role="group" aria-label="Align">
          {([
            ['left', 'align-left', 'Align left'],
            ['center', 'align-center', 'Align center'],
            ['right', 'align-right', 'Align right'],
            ['top', 'align-top', 'Align top'],
            ['middle', 'align-middle', 'Align middle'],
            ['bottom', 'align-bottom', 'Align bottom'],
          ] as const).map(([mode, icon, label]) => (
            <button key={mode} className="org" data-testid={`align-${mode}`} disabled={editor.selection.length < 2} title={editor.selection.length < 2 ? `${label}: select two or more objects first` : label} aria-label={label} onClick={() => editor.align(mode)}>
              <OrgIcon name={icon} />
            </button>
          ))}
        </div>
        <div className="org-bar" role="group" aria-label="Distribute, flip, and group">
          <button className="org" data-testid="distribute" disabled={editor.selection.length < 3} title={editor.selection.length < 3 ? 'Distribute horizontally: select three or more objects first' : 'Distribute horizontally'} aria-label="Distribute horizontally" onClick={() => editor.distribute('h')}><OrgIcon name="distribute-h" /></button>
          <button className="org" disabled={editor.selection.length < 3} title={editor.selection.length < 3 ? 'Distribute vertically: select three or more objects first' : 'Distribute vertically'} aria-label="Distribute vertically" onClick={() => editor.distribute('v')}><OrgIcon name="distribute-v" /></button>
          <button className="org" data-testid="flip" disabled={!editor.selection.length} title="Flip horizontal" aria-label="Flip horizontal" onClick={() => editor.flip('h')}><OrgIcon name="flip-h" /></button>
          <button className="org" disabled={!editor.selection.length} title="Flip vertical" aria-label="Flip vertical" onClick={() => editor.flip('v')}><OrgIcon name="flip-v" /></button>
          <button className="org" disabled={editor.selection.length < 2} title={editor.selection.length < 2 ? 'Group: select two or more objects first' : 'Group (⌘G)'} aria-label="Group" onClick={() => editor.group()}><OrgIcon name="group" /></button>
          <button className="org" disabled={editor.one()?.kind !== 'group'} title={editor.one()?.kind !== 'group' ? 'Ungroup: select a group first' : 'Ungroup (⌘⇧G)'} aria-label="Ungroup" onClick={() => editor.ungroup()}><OrgIcon name="ungroup" /></button>
        </div>
        <div className="org-bar" role="group" aria-label="Order">
          {([
            ['front', 'Bring to front'],
            ['forward', 'Bring forward'],
            ['backward', 'Send backward'],
            ['back', 'Send to back'],
          ] as const).map(([direction, label]) => (
            <button key={direction} className="org" disabled={!editor.selection.length} title={label} aria-label={label} onClick={() => editor.arrange(direction)}>
              <OrgIcon name={direction} />
            </button>
          ))}
        </div>
      </Section>
      <Section title="Transform" testId="section-transform" defaultOpen={false}>
        <TransformPanel />
      </Section>
    </>
  )
}

function ScaleRow() {
  const canvas = editor.doc.canvas
  const scale = editor.scaleStatement()
  const ratio = ratioFromInchesPerPoint(canvas.realInchesPerPoint)
  const presets = scalePresets(scale.paperUnit)
  const match = matchingPreset(scale.paperUnit, canvas.realInchesPerPoint)
  const realUnits = realUnitsFor(scale.paperUnit)
  if (!realUnits.includes(scale.realUnit)) realUnits.push(scale.realUnit)
  const changePaperUnit = (unit: BaseUnit) => {
    // Keep the numbers the user typed; only swap the real-world unit when it no longer fits the new system.
    const allowed = realUnitsFor(unit)
    const realUnit: LabelUnit = allowed.includes(scale.realUnit) ? scale.realUnit : unit === 'px' ? 'px' : unitSystem(unit) === 'metric' ? 'm' : 'ft'
    editor.applyScale({ ...scale, paperUnit: unit, realUnit })
  }
  return (
    <div className="stack" data-testid="scale-row">
      <Row>
        <label className="field" title="Pick a common drawing scale, or set your own below">
          <span>Scale</span>
          <select data-testid="scale-preset" value={match ?? 'custom'} onChange={(event) => { const preset = presets.find((item) => item.id === event.target.value); if (preset) editor.applyScale(preset.scale) }}>
            {presets.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
            {!match && <option value="custom">Custom</option>}
          </select>
        </label>
        <span className="hint" data-testid="scale-readout" title="Paper length = real-world length. Everything you draw is measured at this scale.">{match ? '' : `${formatScale(scale)} · ${formatRatio(ratio)}`}</span>
      </Row>
      <Row>
        <Field label="Paper" testId="scale-paper" width={48} title="Length on the page, as a number or fraction (1/4)" value={formatScaleAmount(scale.paperAmount, scale.paperUnit)} validate={plainNumber('Paper', { min: 0.0001 })} onCommit={(raw) => editor.applyScale({ ...scale, paperAmount: parseScaleAmount(raw) })} />
        <label className="field" title="Page unit for the paper side; follows the Unit menu above">
          <span>&nbsp;</span>
          <select data-testid="scale-paper-unit" aria-label="Paper unit" value={scale.paperUnit} onChange={(event) => changePaperUnit(event.target.value as BaseUnit)}>
            {BASE_UNITS.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
          </select>
        </label>
        <span className="eq">=</span>
        <Field label="Real" testId="scale-real" width={48} title="What that length stands for in the real world" value={formatScaleAmount(scale.realAmount, scale.realUnit)} validate={plainNumber('Real', { min: 0.0001 })} onCommit={(raw) => editor.applyScale({ ...scale, realAmount: parseScaleAmount(raw) })} />
        <label className="field" title="Real-world unit; the choices match the paper unit's system">
          <span>&nbsp;</span>
          <select data-testid="scale-real-unit" aria-label="Real-world unit" value={scale.realUnit} onChange={(event) => editor.applyScale({ ...scale, realUnit: event.target.value as LabelUnit })}>
            {realUnits.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
          </select>
        </label>
      </Row>
    </div>
  )
}

function ResizeRow() {
  const unit = editor.doc.canvas.baseUnit
  const [amount, setAmount] = useState('1')
  const add = (side: 'left' | 'right' | 'top' | 'bottom') => safe(() => editor.resizeCanvas(side, basePoints(amount, unit)))
  return (
    <div className="stack">
      <Row wrap>
        <Field label="Grow page by" width={60} suffix={unit} title="How much to add to the page on the side you click" value={amount} validate={plainNumber('Amount', { min: 0.001 })} onCommit={setAmount} />
        {(['left', 'right', 'top', 'bottom'] as const).map((side) => (
          <button key={side} data-testid={`resize-${side}`} title={`Add ${amount} ${unit} to the ${side} edge`} onClick={() => add(side)}>{side[0].toUpperCase() + side.slice(1)}</button>
        ))}
      </Row>
      <p className="hint" style={{ margin: '6px 0 2px' }}>Fit the page to the drawing</p>
      <Row wrap>
        <button data-testid="resize-artwork" title="Make the page twice the size of the drawing, centred on it" onClick={() => editor.resizeArtwork(2, true)}>Twice the drawing</button>
        <button title="Make the page half the size of the drawing, centred on it" onClick={() => editor.resizeArtwork(0.5, true)}>Half the drawing</button>
      </Row>
    </div>
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
        <Field label="Offset" testId="label-offset" width={44} title="Distance from the object in points" value={String(label.offset)} validate={numberIn({ min: -500, max: 500, label: 'Offset' })} onCommit={(raw) => editor.updateLabel(index, { offset: Number(raw) })} />
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
  const num = (raw: string) => Number(raw.trim().replace(/[°%]$/, ''))
  const unit = editor.doc.canvas.baseUnit
  const pts = (raw: string) => (raw.trim() ? basePoints(raw, unit) : 0)
  const degrees = numberIn({ min: -3600, max: 3600, label: 'Angle' })
  const percent = numberIn({ min: -10000, max: 10000, label: 'Scale' })
  return (
    <div className="stack" data-testid="transform-panel">
      <Row>
        <Field label="Move X" testId="tf-dx" width={64} suffix={unit} title="Distance to move right, on the page" value={baseNumber(step.dx, unit)} validate={plainNumber('Move X')} onCommit={(raw) => patch({ dx: pts(raw) })} />
        <Field label="Move Y" testId="tf-dy" width={64} suffix={unit} title="Distance to move down, on the page" value={baseNumber(step.dy, unit)} validate={plainNumber('Move Y')} onCommit={(raw) => patch({ dy: pts(raw) })} />
        <Field label="Rotate °" testId="tf-rotate" width={52} value={String(Number(((step.rotate * 180) / Math.PI).toFixed(2)))} validate={degrees} onCommit={(raw) => patch({ rotate: (num(raw) * Math.PI) / 180 })} />
      </Row>
      <Row>
        <Field label="Scale X %" testId="tf-scale-x" width={52} value={String(Math.round(step.scaleX * 100))} validate={percent} onCommit={(raw) => patch({ scaleX: num(raw) / 100 })} />
        <Field label="Scale Y %" testId="tf-scale-y" width={52} value={String(Math.round(step.scaleY * 100))} validate={percent} onCommit={(raw) => patch({ scaleY: num(raw) / 100 })} />
        <Field label="Shear X °" testId="tf-shear-x" width={52} value={String(Number(((step.shearX * 180) / Math.PI).toFixed(2)))} validate={degrees} onCommit={(raw) => patch({ shearX: (num(raw) * Math.PI) / 180 })} />
        <Field label="Shear Y °" width={52} value={String(Number(((step.shearY * 180) / Math.PI).toFixed(2)))} validate={degrees} onCommit={(raw) => patch({ shearY: (num(raw) * Math.PI) / 180 })} />
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
