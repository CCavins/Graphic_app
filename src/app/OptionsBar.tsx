import { dashPresetOf, type ArcMode, type DashPreset, type LineMode } from '../editor/editor'
import { editor } from './instance'
import { unitSystem } from '../model/scale'
import { TOOL_NAMES } from './toolInfo'
import { Field, numberIn } from './ui'

const FONTS = ['Georgia, serif', 'Helvetica Neue, Helvetica, Arial, sans-serif', 'Avenir Next, Segoe UI, sans-serif', 'Times New Roman, serif', 'Courier New, monospace', 'Futura, Trebuchet MS, sans-serif']

/** The strip under the document tabs: typed geometry for the selection plus options for the active tool. */
export function OptionsBar() {
  const rect = editor.selectionRect()
  const node = editor.one()
  const stroke = node ? editor.strokeOf(node) : undefined
  const tool = editor.tool
  const isLine = node ? node.kind === 'dimension' || (node.kind === 'path' && node.commands.filter((c) => c.c !== 'Z').length === 2) : false
  const dashValue: DashPreset = stroke ? dashPresetOf(stroke.dash) : editor.dashPreset
  const lineModeValue: LineMode = node?.kind === 'dimension' ? 'dimension' : node && stroke ? (stroke.arrows !== 'none' ? 'arrow' : 'plain') : editor.lineMode
  const text = node?.text
  const showText = tool === 'text' || !!text
  const showLine = tool === 'line' || isLine || (!!node && node.kind === 'path')
  const commit = (field: 'width' | 'height' | 'x' | 'y' | 'rotation') => (raw: string) => editor.setNumber(field, raw)
  const grid = editor.doc.canvas.grid

  return (
    <div className="options-bar" data-testid="options-bar">
      <span className="active-tool" data-testid="active-tool">{TOOL_NAMES[tool]}</span>
      <span className="divider" />
      <Field label="X" testId="field-x" value={rect ? editor.formatPoints(rect.x) : '–'} disabled={!rect} onCommit={commit('x')} />
      <Field label="Y" testId="field-y" value={rect ? editor.formatPoints(rect.y) : '–'} disabled={!rect} onCommit={commit('y')} />
      <Field label="W" testId="field-w" value={rect ? editor.formatPoints(rect.w) : '–'} disabled={!rect} onCommit={commit('width')} />
      <Field label="H" testId="field-h" value={rect ? editor.formatPoints(rect.h) : '–'} disabled={!rect} onCommit={commit('height')} />
      <Field label="∠" testId="field-rotation" width={52} value={node ? `${Math.round((node.rotation * 180) / Math.PI)}°` : '–'} disabled={!node} onCommit={commit('rotation')} />
      <span className="divider" />
      {showLine && (
        <>
          <label className="field">
            <span>Line</span>
            <select data-testid="dash" value={dashValue} onChange={(event) => editor.setDash(event.target.value as DashPreset)}>
              <option value="solid">Solid</option>
              <option value="dotted">Dotted</option>
              <option value="dashed">Dashed</option>
            </select>
          </label>
          {(tool === 'line' || isLine) && (
            <label className="field">
              <span>Type</span>
              <select data-testid="line-mode" value={lineModeValue} onChange={(event) => editor.setLineMode(event.target.value as LineMode)}>
                <option value="plain">Plain</option>
                <option value="arrow">Arrow</option>
                <option value="dimension">Dimension</option>
              </select>
            </label>
          )}
        </>
      )}
      {tool === 'roundRect' && (
        <Field label="Radius" testId="corner-radius" width={56} title="Corner radius in points" value={String(editor.cornerRadius)} validate={numberIn({ min: 0, max: 1000, label: 'Radius' })} onCommit={(raw) => { editor.cornerRadius = Number(raw); editor.emit() }} />
      )}
      {tool === 'polygon' && (
        <Field label="Sides" testId="polygon-sides" width={48} title="Number of sides, 3 to 100" value={String(editor.polygonSides)} validate={numberIn({ min: 3, max: 100, integer: true, label: 'Sides' })} onCommit={(raw) => { editor.polygonSides = Number(raw); editor.emit() }} />
      )}
      {tool === 'star' && (
        <>
          <Field label="Points" testId="star-points" width={48} title="Number of points, 3 to 100" value={String(editor.starPoints)} validate={numberIn({ min: 3, max: 100, integer: true, label: 'Points' })} onCommit={(raw) => { editor.starPoints = Number(raw); editor.emit() }} />
          <Field label="Inner %" testId="star-inner" width={56} title="Inner radius as a percentage of the outer radius, 5 to 95" value={String(Math.round(editor.starInnerRadius * 100))} validate={numberIn({ min: 5, max: 95, label: 'Inner %' })} onCommit={(raw) => { editor.starInnerRadius = Number(raw.replace(/%$/, '')) / 100; editor.emit() }} />
        </>
      )}
      {tool === 'arc' && (
        <label className="field">
          <span>Arc</span>
          <select data-testid="arc-mode" value={editor.arcMode} onChange={(event) => { editor.arcMode = event.target.value as ArcMode; editor.emit() }}>
            <option value="open">Open</option>
            <option value="pie">Pie</option>
            <option value="chord">Chord</option>
          </select>
        </label>
      )}
      {tool === 'brush' && (
        <>
          <Field label="Diameter" testId="brush-diameter" width={52} title="Brush diameter in points" value={String(editor.brushSettings.diameter)} validate={numberIn({ min: 1, max: 500, label: 'Diameter' })} onCommit={(raw) => { editor.brushSettings.diameter = Number(raw); editor.emit() }} />
          <Field label="Angle" width={48} title="Nib angle in degrees" value={String(editor.brushSettings.angle)} validate={numberIn({ min: -360, max: 360, label: 'Angle' })} onCommit={(raw) => { editor.brushSettings.angle = Number(raw.replace(/°$/, '')); editor.emit() }} />
          <Field label="Round %" width={56} title="Nib roundness, 5 to 100" value={String(Math.round(editor.brushSettings.roundness * 100))} validate={numberIn({ min: 5, max: 100, label: 'Roundness' })} onCommit={(raw) => { editor.brushSettings.roundness = Number(raw.replace(/%$/, '')) / 100; editor.emit() }} />
          <Field label="Min %" width={52} title="Thinnest stroke under light pressure, as a percentage of the diameter" value={String(Math.round(editor.brushSettings.minWidth * 100))} validate={numberIn({ min: 0, max: 100, label: 'Minimum width' })} onCommit={(raw) => { editor.brushSettings.minWidth = Number(raw.replace(/%$/, '')) / 100; editor.emit() }} />
        </>
      )}
      {tool === 'eraser' && (
        <Field label="Eraser" testId="eraser-width" width={48} title="Eraser width in points" value={String(editor.eraserWidth)} validate={numberIn({ min: 1, max: 500, label: 'Eraser width' })} onCommit={(raw) => { editor.eraserWidth = Number(raw); editor.emit() }} />
      )}
      {showText && (
        <>
          <label className="field">
            <span>Font</span>
            <select
              data-testid="text-font"
              value={text?.fontFamily ?? editor.textDefaults.fontFamily}
              onChange={(event) => {
                editor.textDefaults.fontFamily = event.target.value
                if (text) editor.setTextProp({ fontFamily: event.target.value })
                else editor.emit()
              }}
            >
              {FONTS.map((font) => (
                <option key={font} value={font}>{font.split(',')[0]}</option>
              ))}
            </select>
          </label>
          <Field
            label="Size"
            testId="text-size"
            width={48}
            value={String(text?.fontSize ?? editor.textDefaults.fontSize)}
            validate={numberIn({ min: 1, max: 1000, label: 'Size' })}
            onCommit={(raw) => {
              const size = Number(raw)
              editor.textDefaults.fontSize = size
              if (text) editor.setTextProp({ fontSize: size })
              else editor.emit()
            }}
          />
          <div className="segmented" role="group" aria-label="Alignment">
            {(['left', 'center', 'right'] as const).map((align) => (
              <button
                key={align}
                data-testid={`text-align-${align}`}
                data-active={(text?.align ?? editor.textDefaults.align) === align}
                onClick={() => {
                  editor.textDefaults.align = align
                  if (text) editor.setTextProp({ align })
                  else editor.emit()
                }}
              >
                {align === 'left' ? '⇤' : align === 'center' ? '↔' : '⇥'}
              </button>
            ))}
          </div>
          {editor.editingTextId && (
            <div className="segmented" role="group" aria-label="Style">
              <button data-testid="span-bold" onClick={() => editor.styleTextRange(editor.textSelection.start, editor.textSelection.end, { bold: true })}><b>B</b></button>
              <button data-testid="span-italic" onClick={() => editor.styleTextRange(editor.textSelection.start, editor.textSelection.end, { italic: true })}><i>I</i></button>
              <button data-testid="span-underline" onClick={() => editor.styleTextRange(editor.textSelection.start, editor.textSelection.end, { underline: true })}><u>U</u></button>
            </div>
          )}
        </>
      )}
      <span className="spacer" />
      <label className="field">
        <span>Snap</span>
        <select
          data-testid="snap"
          title="Snap drawn points to a real-world step, or to the grid spacing set in Properties"
          value={!grid.snap ? 'off' : grid.snapWorldInches ? String(grid.snapWorldInches) : 'grid'}
          onChange={(event) => {
            const value = event.target.value
            if (value === 'grid') editor.setGrid({ snap: true, snapWorldInches: null })
            else editor.setSnap(value === 'off' ? null : Number(value))
          }}
        >
          <option value="off">Off</option>
          <option value="grid">Grid spacing</option>
          {snapSteps(editor.doc.canvas.baseUnit).map((step) => (
            <option key={step.inches} value={String(step.inches)}>{step.label}</option>
          ))}
          {grid.snap && grid.snapWorldInches && !snapSteps(editor.doc.canvas.baseUnit).some((step) => step.inches === grid.snapWorldInches) && (
            <option value={String(grid.snapWorldInches)}>{grid.snapWorldInches} in</option>
          )}
        </select>
      </label>
      <label className="field">
        <span>Zoom</span>
        <select
          data-testid="zoom"
          value=""
          onChange={(event) => {
            const value = event.target.value
            const stage = document.querySelector('[data-testid=canvas]')?.getBoundingClientRect()
            const viewport = { width: stage?.width ?? 1200, height: stage?.height ?? 800 }
            if (value === 'in' || value === 'out' || value === 'fit' || value === 'actual' || value === 'selection') editor.zoomCommand(value, viewport)
          }}
        >
          <option value="">{Math.round(editor.view.zoom * 100)}%</option>
          <option value="in">Zoom in</option>
          <option value="out">Zoom out</option>
          <option value="fit">Fit</option>
          <option value="actual">100%</option>
          <option value="selection">Selection</option>
        </select>
      </label>
    </div>
  )
}

/** Real-world snap steps in the unit system of the page: inches and feet, millimetres and metres, or pixels. */
export function snapSteps(unit: 'px' | 'in' | 'cm' | 'mm'): { inches: number; label: string }[] {
  const system = unitSystem(unit)
  if (system === 'metric') {
    return [
      { inches: 1 / 25.4, label: '1 mm' },
      { inches: 5 / 25.4, label: '5 mm' },
      { inches: 10 / 25.4, label: '1 cm' },
      { inches: 50 / 25.4, label: '5 cm' },
      { inches: 100 / 25.4, label: '10 cm' },
      { inches: 1000 / 25.4, label: '1 m' },
    ]
  }
  if (system === 'px') {
    return [1, 5, 10, 25, 50, 100].map((px) => ({ inches: px / 72, label: `${px} px` }))
  }
  return [
    { inches: 0.125, label: '1/8 in' },
    { inches: 0.25, label: '1/4 in' },
    { inches: 0.5, label: '1/2 in' },
    { inches: 1, label: '1 in' },
    { inches: 6, label: '6 in' },
    { inches: 12, label: '1 ft' },
  ]
}
