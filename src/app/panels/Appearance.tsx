import { useState } from 'react'
import type { DashPreset } from '../../editor/editor'
import { dashPresetOf } from '../../editor/editor'
import { rgb } from '../../model/color'
import { APPROXIMATE_BLEND, BLEND_MODES, type BlendMode, type EffectKind, type Gradient, type StrokeAttr, type TextData } from '../../model/types'
import { editor } from '../instance'
import { ColorWell, Field, Row, Section, Slider } from '../ui'

const EFFECTS: { kind: EffectKind; name: string }[] = [
  { kind: 'dropShadow', name: 'Drop shadow' },
  { kind: 'innerShadow', name: 'Inner shadow' },
  { kind: 'outerGlow', name: 'Outer glow' },
  { kind: 'innerGlow', name: 'Inner glow' },
  { kind: 'blur', name: 'Blur' },
]

export function AppearancePanel({ onRecolor, onSelectSimilar }: { onRecolor: () => void; onSelectSimilar: () => void }) {
  const node = editor.one()
  const fill = node ? editor.fillOf(node) : undefined
  const stroke = node ? editor.strokeOf(node) : undefined
  const cmyk = editor.doc.canvas.colorMode === 'cmyk'
  const fillColor = fill?.color ?? editor.paint.fill
  const strokeColor = stroke?.color ?? editor.paint.stroke
  const fillType = fill?.gradient ? fill.gradient.kind : fill?.patternId ? 'pattern' : fill?.imageId ? 'image' : 'solid'
  const [styleName, setStyleName] = useState('Style')
  const [patternName, setPatternName] = useState('Pattern')
  const [customDash, setCustomDash] = useState('')

  return (
    <>
      <Section title="Fill" testId="section-fill">
        <Row>
          <label className="check">
            <input type="checkbox" data-testid="fill-enabled" checked={fill ? fill.enabled : true} disabled={!fill} onChange={(event) => editor.setFill({ enabled: event.target.checked })} /> On
          </label>
          <ColorWell testId="fill-color" label="Fill color" color={fillColor} cmyk={cmyk} onChange={(color) => editor.setFill({ color, enabled: true })} />
          <Field label="Hex" testId="fill-hex" width={76} value={editor.hexOf(fillColor)} onCommit={(raw) => editor.setFillHex(raw)} />
          <label className="field">
            <span>Type</span>
            <select
              data-testid="fill-type"
              value={fillType}
              disabled={!fill}
              onChange={(event) => {
                const value = event.target.value
                if (value === 'solid') editor.setFill({ color: structuredClone(fillColor) })
                else if (value === 'pattern') editor.setPattern(editor.doc.patterns[0]?.id ?? 'stripes')
                else if (value === 'image') {
                  const id = Object.keys(editor.doc.images)[0]
                  if (id) editor.setImageFill(id)
                  else {
                    editor.banner = 'Import an image first, then use it as a fill'
                    editor.emit()
                  }
                } else editor.setGradient(value as Gradient['kind'])
              }}
            >
              <option value="solid">Solid</option>
              <option value="linear">Linear gradient</option>
              <option value="radial">Radial gradient</option>
              <option value="angle">Angle gradient</option>
              <option value="pattern">Pattern</option>
              <option value="image">Image</option>
            </select>
          </label>
        </Row>
        {fill && <Slider label="Opacity" testId="fill-opacity" min={0} max={100} value={Math.round(fill.opacity * 100)} onChange={(value) => editor.setFill({ opacity: value / 100 })} />}
        {fill?.gradient && (
          <div className="stack" data-testid="gradient-stops">
            {fill.gradient.stops.map((stop, index) => (
              <Row key={index}>
                <ColorWell color={stop.color} cmyk={cmyk} onChange={(color) => editor.setGradientStop(index, { color })} />
                <Slider label={`Stop ${index + 1}`} min={0} max={100} value={Math.round(stop.offset * 100)} onChange={(value) => editor.setGradientStop(index, { offset: value / 100 })} />
              </Row>
            ))}
            <p className="hint">Use the Gradient tool (G) to drag the handles on the canvas.</p>
          </div>
        )}
        {fill?.patternId && (
          <Row wrap>
            {['stripes', 'dots', 'grid', 'crosshatch', ...editor.doc.patterns.map((pattern) => pattern.id)].map((id) => (
              <button key={id} data-testid={`pattern-${id}`} data-active={fill.patternId === id} onClick={() => editor.setPattern(id)}>
                {editor.doc.patterns.find((pattern) => pattern.id === id)?.name ?? id}
              </button>
            ))}
          </Row>
        )}
        <Row>
          <Field label="Save selection as pattern" width={90} value={patternName} onCommit={setPatternName} />
          <button data-testid="save-pattern" disabled={!editor.selection.length} onClick={() => editor.savePattern(patternName)}>Save pattern</button>
        </Row>
      </Section>
      <Section title="Stroke" testId="section-stroke">
        <Row>
          <label className="check">
            <input type="checkbox" data-testid="stroke-enabled" checked={stroke ? stroke.enabled : true} disabled={!stroke} onChange={(event) => editor.setStroke({ enabled: event.target.checked })} /> On
          </label>
          <ColorWell testId="stroke-color" label="Stroke color" color={strokeColor} cmyk={cmyk} onChange={(color) => editor.setStroke({ color, enabled: true })} />
          <Field label="Hex" testId="stroke-hex" width={76} value={editor.hexOf(strokeColor)} onCommit={(raw) => editor.setStrokeHex(raw)} />
          <Field label="Width" testId="stroke-width" width={52} value={String(stroke?.width ?? editor.paint.strokeWidth)} onCommit={(raw) => editor.setStroke({ width: Number(raw), enabled: true })} />
        </Row>
        <Row>
          <label className="field">
            <span>Dash</span>
            <select data-testid="stroke-dash" value={stroke ? dashPresetOf(stroke.dash) : editor.dashPreset} onChange={(event) => editor.setDash(event.target.value as DashPreset)}>
              <option value="solid">Solid</option>
              <option value="dotted">Dotted</option>
              <option value="dashed">Dashed</option>
            </select>
          </label>
          <Field
            label="Custom"
            testId="stroke-custom-dash"
            width={72}
            value={customDash || (stroke?.dash.join(' ') ?? '')}
            onCommit={(raw) => {
              setCustomDash(raw)
              const dash = raw.split(/[\s,]+/).map(Number).filter((n) => Number.isFinite(n) && n >= 0)
              editor.setStroke({ dash, enabled: true })
            }}
          />
          <label className="field">
            <span>Align</span>
            <select data-testid="stroke-align" value={stroke?.align ?? 'center'} disabled={!stroke} onChange={(event) => editor.setStroke({ align: event.target.value as StrokeAttr['align'] })}>
              <option value="center">Center</option>
              <option value="inner">Inside</option>
              <option value="outer">Outside</option>
            </select>
          </label>
          <label className="field">
            <span>Arrows</span>
            <select data-testid="stroke-arrows" value={stroke?.arrows ?? 'none'} disabled={!stroke} onChange={(event) => editor.setStroke({ arrows: event.target.value as StrokeAttr['arrows'] })}>
              <option value="none">None</option>
              <option value="start">Start</option>
              <option value="end">End</option>
              <option value="both">Both</option>
            </select>
          </label>
        </Row>
        {stroke && <Slider label="Opacity" min={0} max={100} value={Math.round(stroke.opacity * 100)} onChange={(value) => editor.setStroke({ opacity: value / 100 })} />}
      </Section>
      <Section title="Effects" testId="section-effects">
        {node && <Slider label="Object opacity" testId="object-opacity" min={0} max={100} value={Math.round(node.opacity * 100)} onChange={(value) => editor.setOpacity(value / 100)} />}
        <Row>
          <label className="field">
            <span>Blend</span>
            <select data-testid="blend" value={node?.blendMode ?? 'normal'} disabled={!node} onChange={(event) => editor.setBlend(event.target.value as BlendMode)}>
              {BLEND_MODES.map((mode) => (
                <option key={mode} value={mode}>{mode}{APPROXIMATE_BLEND.has(mode) ? ' (approx)' : ''}</option>
              ))}
            </select>
          </label>
        </Row>
        {EFFECTS.map(({ kind, name }) => {
          const effect = node ? editor.effectOf(node, kind) : undefined
          return (
            <div className="effect" key={kind} data-testid={`effect-${kind}`} data-active={!!effect?.enabled}>
              <label className="check">
                <input type="checkbox" data-testid={`toggle-${kind}`} checked={!!effect?.enabled} disabled={!node} onChange={(event) => editor.toggleEffect(kind, event.target.checked)} /> {name}
              </label>
              {effect?.enabled && (
                <Row wrap>
                  {kind !== 'blur' && <ColorWell color={effect.color} cmyk={cmyk} onChange={(color) => editor.setEffect(kind, { color })} />}
                  <Slider label="Blur" min={0} max={60} value={effect.blur} onChange={(blur) => editor.setEffect(kind, { blur })} />
                  {(kind === 'dropShadow' || kind === 'innerShadow') && (
                    <>
                      <Slider label="X" min={-40} max={40} value={effect.dx} onChange={(dx) => editor.setEffect(kind, { dx })} />
                      <Slider label="Y" min={-40} max={40} value={effect.dy} onChange={(dy) => editor.setEffect(kind, { dy })} />
                    </>
                  )}
                  {kind !== 'blur' && <Slider label="Opacity" min={0} max={100} value={Math.round(effect.opacity * 100)} onChange={(value) => editor.setEffect(kind, { opacity: value / 100 })} />}
                </Row>
              )}
            </div>
          )
        })}
      </Section>
      {node?.text && <TextSection text={node.text} />}
      <Section title="Styles" testId="section-styles" defaultOpen={false}>
        <Row wrap>
          <button data-testid="copy-style" disabled={!node} onClick={() => editor.copyStyle()}>Copy style</button>
          <button data-testid="paste-style" disabled={!editor.clipboard} onClick={() => editor.pasteStyle()}>Paste style</button>
          <Field label="Name" width={72} value={styleName} onCommit={setStyleName} />
          <button data-testid="save-style" disabled={!node} onClick={() => editor.saveStyle(styleName)}>Save style</button>
        </Row>
        {editor.doc.styles.length > 0 && (
          <div className="style-list" data-testid="style-list">
            {editor.doc.styles.map((style) => (
              <Row key={style.id}>
                <button className="grow" data-testid="saved-style" onClick={() => editor.applySavedStyle(style.id)}>{style.name}</button>
                <button className="icon-button" aria-label={`Delete ${style.name}`} onClick={() => editor.deleteStyle(style.id)}>×</button>
              </Row>
            ))}
          </div>
        )}
        <Row wrap>
          <button data-testid="select-similar" disabled={!node} onClick={onSelectSimilar}>Select similar…</button>
          <button data-testid="recolor" disabled={!editor.selection.length} onClick={onRecolor}>Recolor artwork…</button>
        </Row>
      </Section>
    </>
  )
}

function TextSection({ text }: { text: TextData }) {
  const cmyk = editor.doc.canvas.colorMode === 'cmyk'
  return (
    <Section title="Text" testId="section-text">
      <Row>
        <ColorWell testId="text-color" label="Text color" color={text.color ?? rgb(28, 36, 48, 1)} cmyk={cmyk} onChange={(color) => editor.setTextProp({ color })} />
        <label className="field">
          <span>Style</span>
          <select data-testid="text-style" value={text.fontStyle} onChange={(event) => editor.setTextProp({ fontStyle: event.target.value })}>
            <option value="normal">Regular</option>
            <option value="bold">Bold</option>
            <option value="italic">Italic</option>
            <option value="bold italic">Bold italic</option>
          </select>
        </label>
        <label className="field">
          <span>Mode</span>
          <select data-testid="text-mode" value={text.mode} onChange={(event) => editor.setTextProp({ mode: event.target.value as TextData['mode'] })}>
            <option value="box">Point text</option>
            <option value="field">Area text</option>
          </select>
        </label>
      </Row>
      <Row>
        <Slider label="Line" testId="line-spacing" min={0.6} max={3} step={0.05} value={text.lineSpacing} onChange={(lineSpacing) => editor.setTextProp({ lineSpacing })} />
        <Slider label="Char" testId="char-spacing" min={-5} max={30} step={0.5} value={text.charSpacing} onChange={(charSpacing) => editor.setTextProp({ charSpacing })} />
      </Row>
      {text.mode === 'field' && <Field label="Field width" width={64} value={String(Math.round(text.fieldWidth))} onCommit={(raw) => editor.setTextProp({ fieldWidth: Math.max(10, Number(raw) || 10) })} />}
      <Row wrap>
        {!text.onPath && <button data-testid="text-on-path" onClick={() => editor.placeTextOnPath()}>Place on path</button>}
        {text.onPath && (
          <>
            <Field label="Path offset" testId="text-path-offset" width={56} value={String(Math.round(text.pathOffset))} onCommit={(raw) => editor.setTextPathOffset(Number(raw) || 0)} />
            <button data-testid="text-release" onClick={() => editor.releaseText()}>Release</button>
            <button onClick={() => editor.reverseSelected()}>Reverse</button>
          </>
        )}
        <button data-testid="text-outline" onClick={() => editor.convertText()}>Create outlines</button>
      </Row>
    </Section>
  )
}
