import { dashPresetOf, type ArcMode, type DashPreset, type LineMode, type Tool } from '../editor/editor'
import { editor } from './instance'
import { Field } from './ui'

export const TOOL_NAMES: Record<Tool, string> = {
  select: 'Move',
  pathSelect: 'Path',
  convert: 'Convert',
  pen: 'Pen',
  pencil: 'Pencil',
  brush: 'Brush',
  line: 'Line',
  arc: 'Arc',
  rect: 'Rect',
  roundRect: 'Round',
  ellipse: 'Ellipse',
  polygon: 'Polygon',
  star: 'Star',
  text: 'Text',
  eraser: 'Eraser',
  scissors: 'Scissors',
  addAnchor: 'Add anchor',
  gradient: 'Gradient',
  hand: 'Hand',
  zoom: 'Zoom',
  scale: 'Scale',
  rotate: 'Rotate',
  slant: 'Slant',
  pattern: 'Pattern',
  image: 'Image',
}

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
        <Field label="Radius" testId="corner-radius" width={56} value={String(editor.cornerRadius)} onCommit={(raw) => { editor.cornerRadius = Math.max(0, Number(raw) || 0); editor.emit() }} />
      )}
      {tool === 'polygon' && (
        <Field label="Sides" testId="polygon-sides" width={48} value={String(editor.polygonSides)} onCommit={(raw) => { editor.polygonSides = Math.max(3, Math.round(Number(raw) || 3)); editor.emit() }} />
      )}
      {tool === 'star' && (
        <>
          <Field label="Points" testId="star-points" width={48} value={String(editor.starPoints)} onCommit={(raw) => { editor.starPoints = Math.max(3, Math.round(Number(raw) || 3)); editor.emit() }} />
          <Field label="Inner %" testId="star-inner" width={56} value={String(Math.round(editor.starInnerRadius * 100))} onCommit={(raw) => { editor.starInnerRadius = Math.min(0.95, Math.max(0.05, (Number(raw) || 40) / 100)); editor.emit() }} />
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
          <Field label="Diameter" testId="brush-diameter" width={52} value={String(editor.brushSettings.diameter)} onCommit={(raw) => { editor.brushSettings.diameter = Math.max(1, Number(raw) || 1); editor.emit() }} />
          <Field label="Angle" width={48} value={String(editor.brushSettings.angle)} onCommit={(raw) => { editor.brushSettings.angle = Number(raw) || 0; editor.emit() }} />
          <Field label="Round %" width={56} value={String(Math.round(editor.brushSettings.roundness * 100))} onCommit={(raw) => { editor.brushSettings.roundness = Math.min(1, Math.max(0.05, (Number(raw) || 50) / 100)); editor.emit() }} />
          <Field label="Min %" width={52} value={String(Math.round(editor.brushSettings.minWidth * 100))} onCommit={(raw) => { editor.brushSettings.minWidth = Math.min(1, Math.max(0, (Number(raw) || 0) / 100)); editor.emit() }} />
        </>
      )}
      {tool === 'eraser' && (
        <Field label="Eraser" testId="eraser-width" width={48} value={String(editor.eraserWidth)} onCommit={(raw) => { editor.eraserWidth = Math.max(1, Number(raw) || 1); editor.emit() }} />
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
            onCommit={(raw) => {
              const size = Math.max(1, Number(raw) || 12)
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
          value={String(grid.snapWorldInches ?? 'off')}
          onChange={(event) => {
            const value = event.target.value
            editor.setSnap(value === 'off' ? null : Number(value))
          }}
        >
          <option value="off">Off</option>
          <option value="0.125">1/8 in</option>
          <option value="0.25">1/4 in</option>
          <option value="0.5">1/2 in</option>
          <option value="1">1 in</option>
          <option value="6">6 in</option>
          <option value="12">1 ft</option>
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
