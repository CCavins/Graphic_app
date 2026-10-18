import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { cssColor, fromHex, hsbToRgb, rgb, rgbToCmyk, rgbToHsb, toHex, toRgb } from '../model/color'
import { splitShade } from '../model/shading'
import type { Cmd, Color } from '../model/types'

/** Text field that commits on Enter or blur and shows the current value otherwise. */
export function Field({
  value,
  onCommit,
  label,
  testId,
  width = 72,
  disabled,
  title,
  validate,
  suffix,
}: {
  value: string
  onCommit: (raw: string) => void
  label?: string
  testId?: string
  width?: number
  disabled?: boolean
  title?: string
  /** Returns a message when the typed text is not acceptable; the field then stays open with the text so it can be corrected. */
  validate?: (raw: string) => string | null
  /** A unit shown after the box, so the box itself holds only the number. */
  suffix?: string
}) {
  const [draft, setDraft] = useState(value)
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Enter and Escape blur the box themselves; that blur must not commit (or re-commit) the draft.
  const skipBlur = useRef(false)
  useEffect(() => {
    if (!editing) setDraft(value)
  }, [value, editing])
  /** Validates, commits, and reports; returns false when the value was refused. */
  const commit = (raw: string): boolean => {
    const message = validate?.(raw) ?? null
    if (message) {
      setError(message)
      reportFieldError(message)
      return false
    }
    try {
      onCommit(raw)
      setError(null)
      return true
    } catch (caught) {
      const text = caught instanceof Error ? caught.message : 'That value is not valid'
      setError(text)
      reportFieldError(text)
      return false
    }
  }
  return (
    <label className="field" title={error ?? title} data-suffix={suffix ? true : undefined}>
      {label && <span>{label}</span>}
      <input
        data-testid={testId}
        value={editing ? draft : value}
        disabled={disabled}
        style={{ width }}
        aria-invalid={error ? true : undefined}
        aria-label={label ? undefined : title}
        onFocus={() => {
          setDraft(value)
          setEditing(true)
        }}
        onChange={(event) => {
          setDraft(event.target.value)
          if (error) setError(null)
        }}
        onBlur={() => {
          if (skipBlur.current) {
            skipBlur.current = false
            return
          }
          if (draft !== value && !commit(draft)) {
            // Keep the draft visible with the red outline so the user sees what was refused.
            setEditing(true)
            return
          }
          setEditing(false)
        }}
        onKeyDown={(event) => {
          event.stopPropagation()
          if (event.key === 'Enter') {
            if (commit(draft)) {
              setEditing(false)
              skipBlur.current = true
              event.currentTarget.blur()
            }
          }
          if (event.key === 'Escape') {
            setDraft(value)
            setError(null)
            setEditing(false)
            skipBlur.current = true
            event.currentTarget.blur()
          }
        }}
      />
      {suffix && <span className="suffix" aria-hidden="true">{suffix}</span>}
    </label>
  )
}

/** Where field errors go; the app points this at the banner. */
export let reportFieldError: (message: string) => void = () => {}
export function setFieldErrorReporter(reporter: (message: string) => void): void {
  reportFieldError = reporter
}

/** Validator for a number typed without a unit, for boxes that have a unit menu or suffix beside them. */
export function plainNumber(label: string, { min, max }: { min?: number; max?: number } = {}): (raw: string) => string | null {
  return (raw) => {
    const text = raw.trim()
    if (!text) return `Enter ${label}`
    if (/[a-z"']/i.test(text)) return `Type just the number for ${label}; the unit is set by the menu beside it`
    const n = parseFraction(text)
    if (n == null) return `${label} must be a number like 8.5 or 1/4`
    if (min != null && n < min) return `${label} must be at least ${min}`
    if (max != null && n > max) return `${label} must be at most ${max}`
    return null
  }
}

/** "1/4" → 0.25, "8.5" → 8.5, "1 1/2" → 1.5; null when not a number. */
export function parseFraction(text: string): number | null {
  const match = text.trim().match(/^(-?\d+(?:\.\d+)?)?(?:\s+)?(?:(\d+)\s*\/\s*(\d+))?$/)
  if (!match || (!match[1] && !match[2])) return null
  const whole = match[1] ? Number(match[1]) : 0
  const frac = match[2] ? Number(match[2]) / Number(match[3]) : 0
  if (match[2] && Number(match[3]) === 0) return null
  const sign = whole < 0 || match[1]?.startsWith('-') ? -1 : 1
  return whole + sign * frac
}

/** Validator for a plain number with optional bounds; a unit suffix is allowed when `units` is set. */
export function numberIn({ min, max, integer, label, allowEmpty }: { min?: number; max?: number; integer?: boolean; label: string; allowEmpty?: boolean }): (raw: string) => string | null {
  return (raw) => {
    const text = raw.trim()
    if (!text) return allowEmpty ? null : `Enter ${label}`
    const n = Number(text.replace(/[°%]$/, ''))
    if (!Number.isFinite(n)) return `${label} must be a number`
    if (integer && !Number.isInteger(n)) return `${label} must be a whole number`
    if (min != null && n < min) return `${label} must be at least ${min}`
    if (max != null && n > max) return `${label} must be at most ${max}`
    return null
  }
}

/**
 * A name that turns into a text box on double-click (or via the rename button) and commits on Enter or blur.
 * Replaces window.prompt, which some embedded browsers block and which gave no hint that double-click renames.
 */
export function InlineName({
  value,
  onRename,
  onClick,
  children,
  className,
  testId,
  label,
}: {
  value: string
  onRename: (name: string) => void
  onClick?: (event: ReactMouseEvent<HTMLButtonElement>) => void
  children?: ReactNode
  className?: string
  testId?: string
  label: string
}) {
  const [editing, setEditing] = useState(false)
  if (editing) {
    return (
      <input
        className={className ? `${className} inline-name` : 'inline-name'}
        data-testid={testId ? `${testId}-input` : undefined}
        aria-label={`Rename ${label}`}
        autoFocus
        defaultValue={value}
        onFocus={(event) => event.currentTarget.select()}
        onKeyDown={(event) => {
          event.stopPropagation()
          if (event.key === 'Enter') {
            const next = event.currentTarget.value.trim()
            if (next && next !== value) onRename(next)
            setEditing(false)
          }
          if (event.key === 'Escape') setEditing(false)
        }}
        onBlur={(event) => {
          const next = event.currentTarget.value.trim()
          if (next && next !== value) onRename(next)
          setEditing(false)
        }}
      />
    )
  }
  return (
    <button className={className} data-testid={testId} title="Double-click to rename" onClick={onClick} onDoubleClick={() => setEditing(true)}>
      {children ?? value}
    </button>
  )
}

export function Slider({ label, value, min, max, step = 1, onChange, testId }: { label: string; value: number; min: number; max: number; step?: number; onChange: (value: number) => void; testId?: string }) {
  return (
    <label className="slider">
      <span>{label}</span>
      <input data-testid={testId} type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
      <output>{Number.isInteger(step) ? Math.round(value) : value.toFixed(2)}</output>
    </label>
  )
}

export function Section({ title, children, defaultOpen = true, testId, right }: { title: string; children: ReactNode; defaultOpen?: boolean; testId?: string; right?: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className="section" data-open={open}>
      <header>
        <button className="section-toggle" data-testid={testId} aria-expanded={open} onClick={() => setOpen((value) => !value)}>
          <span className="chev" aria-hidden="true">{open ? '▾' : '▸'}</span>
          {title}
        </button>
        {right}
      </header>
      {open && <div className="section-body">{children}</div>}
    </section>
  )
}

export function Row({ children, wrap }: { children: ReactNode; wrap?: boolean }) {
  return <div className={wrap ? 'row wrap' : 'row'}>{children}</div>
}

/** Color swatch that opens an inline editor with hex, RGB, HSB, and alpha. */
export function ColorWell({ color, onChange, label, testId, cmyk, size = 22 }: { color: Color | null; onChange: (color: Color) => void; label?: string; testId?: string; cmyk?: boolean; size?: number }) {
  const [open, setOpen] = useState(false)
  const [box, setBox] = useState<{ left: number; top: number } | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const place = () => {
    const rect = ref.current?.getBoundingClientRect()
    if (!rect) return
    const width = 250
    const height = 460
    let left = rect.right + 8
    let top = Math.min(rect.top, window.innerHeight - height - 8)
    if (left + width > window.innerWidth - 8) left = rect.left - width - 8
    setBox({ left: Math.max(8, left), top: Math.max(8, top) })
  }
  useEffect(() => {
    if (!open) return
    const close = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false)
    }
    window.addEventListener('pointerdown', close)
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('resize', place)
    }
  }, [open])
  const current = color ?? rgb(0, 0, 0, 0)
  return (
    <div className="color-well" ref={ref}>
      <button
        type="button"
        className="swatch"
        data-testid={testId}
        aria-label={label ?? 'Color'}
        title={label}
        style={{ width: size, height: size, background: current.a === 0 ? 'repeating-linear-gradient(45deg, #fff 0 4px, #ccc 4px 8px)' : cssColor(current) }}
        onClick={() => {
          place()
          setOpen((value) => !value)
        }}
      />
      {open && box && (
        <div className="popover" data-testid={testId ? `${testId}-editor` : undefined} style={{ position: 'fixed', left: box.left, top: box.top, bottom: 'auto', width: 250, zIndex: 30 }}>
          <ColorEditor color={current} onChange={onChange} cmyk={cmyk} />
        </div>
      )}
    </div>
  )
}

export function ColorEditor({ color, onChange, cmyk }: { color: Color; onChange: (color: Color) => void; cmyk?: boolean }) {
  const rgbColor = toRgb(color)
  const hsb = rgbToHsb(rgbColor)
  const [hex, setHex] = useState(toHex(color))
  const field = useRef<HTMLDivElement>(null)
  useEffect(() => setHex(toHex(color)), [color])
  const cmykColor = cmyk ? rgbToCmyk(rgbColor) : null
  const update = (patch: Partial<{ r: number; g: number; b: number; a: number }>) => onChange({ ...rgbColor, ...patch })
  const commitHex = () => {
    const parsed = fromHex(hex, rgbColor.a)
    if (parsed) onChange(parsed)
  }
  const pickField = (event: ReactPointerEvent<HTMLDivElement>) => {
    const bounds = field.current?.getBoundingClientRect()
    if (!bounds) return
    const saturation = Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width))
    const brightness = Math.min(1, Math.max(0, 1 - (event.clientY - bounds.top) / bounds.height))
    onChange(hsbToRgb(hsb.h, saturation, brightness, rgbColor.a))
  }
  const eyedrop = async () => {
    const Ctor = (window as unknown as { EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> } }).EyeDropper
    if (!Ctor) return
    try {
      const result = await new Ctor().open()
      const parsed = fromHex(result.sRGBHex, rgbColor.a)
      if (parsed) onChange(parsed)
    } catch {
      /* the user cancelled the eyedropper */
    }
  }
  const hue = `hsl(${Math.round(hsb.h)} 100% 50%)`
  return (
    <div className="color-editor">
      <div
        ref={field}
        className="color-field"
        data-testid="color-field"
        style={{ background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${hue})` }}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId)
          pickField(event)
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) pickField(event)
        }}
      >
        <span className="color-knob" style={{ left: `${hsb.s * 100}%`, top: `${(1 - hsb.b) * 100}%` }} />
      </div>
      <label className="field">
        <span>Hex</span>
        <input
          data-testid="color-hex"
          value={hex}
          onChange={(event) => setHex(event.target.value)}
          onKeyDown={(event) => {
            event.stopPropagation()
            if (event.key === 'Enter') commitHex()
          }}
          onBlur={commitHex}
        />
        <button type="button" data-testid="color-eyedropper" title="Pick a color from the screen" onClick={() => void eyedrop()}>
          Dropper
        </button>
      </label>
      <Slider label="R" min={0} max={255} value={rgbColor.r} onChange={(r) => update({ r })} />
      <Slider label="G" min={0} max={255} value={rgbColor.g} onChange={(g) => update({ g })} />
      <Slider label="B" min={0} max={255} value={rgbColor.b} onChange={(b) => update({ b })} />
      <Slider label="H" min={0} max={360} value={Math.round(hsb.h)} onChange={(h) => onChange(hsbToRgb(h, hsb.s, hsb.b, rgbColor.a))} />
      <Slider label="S" min={0} max={100} value={Math.round(hsb.s * 100)} onChange={(s) => onChange(hsbToRgb(hsb.h, s / 100, hsb.b, rgbColor.a))} />
      <Slider label="Br" min={0} max={100} value={Math.round(hsb.b * 100)} onChange={(b) => onChange(hsbToRgb(hsb.h, hsb.s, b / 100, rgbColor.a))} />
      <Slider label="Alpha" min={0} max={100} value={Math.round(rgbColor.a * 100)} onChange={(a) => update({ a: a / 100 })} />
      {cmykColor && cmykColor.space === 'cmyk' && (
        <p className="hint">
          CMYK {Math.round(cmykColor.c * 100)} {Math.round(cmykColor.m * 100)} {Math.round(cmykColor.y * 100)} {Math.round(cmykColor.k * 100)}
        </p>
      )}
      <div className="swatches">
        {['#000000', '#ffffff', '#1d4e89', '#d64545', '#e7a33e', '#3f9d5a', '#8a5bd6', '#8d9aab'].map((item) => (
          <button key={item} type="button" className="swatch mini" style={{ background: item }} aria-label={item} onClick={() => onChange(fromHex(item, rgbColor.a)!)} />
        ))}
      </div>
    </div>
  )
}

/** Run a UI action; typed-input errors land in the banner instead of the console. */
export function guarded(fn: () => void, onError: (message: string) => void): void {
  try {
    fn()
  } catch (error) {
    onError(error instanceof Error ? error.message : String(error))
  }
}

export function commandsToPath(commands: Cmd[]): string {
  const n = (value: number) => Number(value.toFixed(2)).toString()
  return commands
    .map((command) => {
      if (command.c === 'M' || command.c === 'L') return `${command.c}${n(command.x)} ${n(command.y)}`
      if (command.c === 'C') return `C${n(command.x1)} ${n(command.y1)} ${n(command.x2)} ${n(command.y2)} ${n(command.x)} ${n(command.y)}`
      return 'Z'
    })
    .join(' ')
}

/** Tiny SVG preview of a shape's commands, fit into a square. */
export function ShapePreview({ commands, shade, ink, size = 28, filled }: { commands: Cmd[]; shade?: Cmd[]; ink?: Cmd[]; size?: number; filled?: boolean }) {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const command of commands) {
    if (command.c === 'Z') continue
    minX = Math.min(minX, command.x)
    minY = Math.min(minY, command.y)
    maxX = Math.max(maxX, command.x)
    maxY = Math.max(maxY, command.y)
  }
  if (!Number.isFinite(minX)) return <svg width={size} height={size} />
  const w = maxX - minX || 1
  const h = maxY - minY || 1
  const pad = Math.max(w, h) * 0.08
  const tones = shade?.length ? splitShade(shade) : { body: [], inset: [] }
  const stroke = Math.max(w, h) / 28
  return (
    <svg width={size} height={size} viewBox={`${minX - pad} ${minY - pad} ${w + pad * 2} ${h + pad * 2}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      {tones.body.length ? <path d={commandsToPath(tones.body)} fill="#d6e0ec" stroke="none" /> : null}
      {tones.inset.length ? <path d={commandsToPath(tones.inset)} fill="#8ea0b5" stroke="none" /> : null}
      <path d={commandsToPath(commands)} fill={!shade?.length && filled ? '#dde6f3' : 'none'} stroke="#1c2430" strokeWidth={stroke} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      {ink?.length ? <path d={commandsToPath(ink)} fill="#1c2430" stroke="none" /> : null}
    </svg>
  )
}
