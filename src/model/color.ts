import type { Color, RGB } from './types'

export function rgb(r: number, g: number, b: number, a = 1): RGB {
  return { space: 'rgb', r, g, b, a }
}

export function cmyk(c: number, m: number, y: number, k: number, a = 1): Color {
  return { space: 'cmyk', c, m, y, k, a }
}

export function noneColor(): RGB {
  return rgb(0, 0, 0, 0)
}

export function toRgb(color: Color): RGB {
  if (color.space === 'rgb') return color
  const { c, m, y, k, a } = color
  return {
    space: 'rgb',
    r: Math.round(255 * (1 - c) * (1 - k)),
    g: Math.round(255 * (1 - m) * (1 - k)),
    b: Math.round(255 * (1 - y) * (1 - k)),
    a,
  }
}

export function cssColor(color: Color): string {
  const c = toRgb(color)
  return `rgba(${c.r}, ${c.g}, ${c.b}, ${c.a})`
}

export function rgbToHsl(color: RGB): { h: number; s: number; l: number; a: number } {
  const r = color.r / 255
  const g = color.g / 255
  const b = color.b / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  let h = 0
  let s = 0
  const d = max - min
  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0)
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h /= 6
  }
  return { h, s, l, a: color.a }
}

export function hslToRgb(h: number, s: number, l: number, a = 1): RGB {
  const hue = (p: number, q: number, t: number) => {
    let tt = t
    if (tt < 0) tt += 1
    if (tt > 1) tt -= 1
    if (tt < 1 / 6) return p + (q - p) * 6 * tt
    if (tt < 1 / 2) return q
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6
    return p
  }
  let r: number
  let g: number
  let b: number
  if (s === 0) {
    r = g = b = l
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s
    const p = 2 * l - q
    r = hue(p, q, h + 1 / 3)
    g = hue(p, q, h)
    b = hue(p, q, h - 1 / 3)
  }
  return rgb(Math.round(r * 255), Math.round(g * 255), Math.round(b * 255), a)
}

export type AdjustMethod = 'hue' | 'saturation' | 'balance' | 'brightness' | 'contrast'

const clamp = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, value))

export function adjustColor(color: Color, method: AdjustMethod, amount: number): Color {
  const base = toRgb(color)
  let next: RGB
  if (method === 'balance') {
    // Warm (positive) or cool (negative) shift.
    next = rgb(clamp(Math.round(base.r + amount * 80), 0, 255), base.g, clamp(Math.round(base.b - amount * 80), 0, 255), base.a)
  } else if (method === 'contrast') {
    const k = 1 + amount
    next = rgb(
      clamp(Math.round(128 + (base.r - 128) * k), 0, 255),
      clamp(Math.round(128 + (base.g - 128) * k), 0, 255),
      clamp(Math.round(128 + (base.b - 128) * k), 0, 255),
      base.a,
    )
  } else {
    const hsl = rgbToHsl(base)
    if (method === 'hue') hsl.h = (((hsl.h + amount) % 1) + 1) % 1
    if (method === 'saturation') hsl.s = clamp(hsl.s + amount)
    if (method === 'brightness') hsl.l = clamp(hsl.l + amount)
    next = hslToRgb(hsl.h, hsl.s, hsl.l, base.a)
  }
  return color.space === 'cmyk' ? rgbToCmyk(next) : next
}

export function rgbToCmyk(color: RGB): Color {
  const r = color.r / 255
  const g = color.g / 255
  const b = color.b / 255
  const k = 1 - Math.max(r, g, b)
  if (k >= 1) return cmyk(0, 0, 0, 1, color.a)
  return cmyk((1 - r - k) / (1 - k), (1 - g - k) / (1 - k), (1 - b - k) / (1 - k), k, color.a)
}

export function toHex(color: Color): string {
  const c = toRgb(color)
  const part = (value: number) => clamp(Math.round(value), 0, 255).toString(16).padStart(2, '0')
  return `#${part(c.r)}${part(c.g)}${part(c.b)}`
}

export function fromHex(hex: string, alpha = 1): RGB | null {
  const clean = hex.trim().replace(/^#/, '')
  const full = clean.length === 3 ? clean.split('').map((ch) => ch + ch).join('') : clean
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null
  return rgb(parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16), alpha)
}

export function rgbToHsb(color: RGB): { h: number; s: number; b: number } {
  const r = color.r / 255
  const g = color.g / 255
  const b = color.b / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  let h = 0
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h = ((h * 60) % 360 + 360) % 360
  }
  return { h, s: max === 0 ? 0 : d / max, b: max }
}

export function hsbToRgb(h: number, s: number, b: number, alpha = 1): RGB {
  const c = b * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = b - c
  let [r, g, bl] = [0, 0, 0]
  if (h < 60) [r, g, bl] = [c, x, 0]
  else if (h < 120) [r, g, bl] = [x, c, 0]
  else if (h < 180) [r, g, bl] = [0, c, x]
  else if (h < 240) [r, g, bl] = [0, x, c]
  else if (h < 300) [r, g, bl] = [x, 0, c]
  else [r, g, bl] = [c, 0, x]
  return rgb(Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((bl + m) * 255), alpha)
}

export function colorsEqual(a: Color, b: Color): boolean {
  const aa = toRgb(a)
  const bb = toRgb(b)
  return aa.r === bb.r && aa.g === bb.g && aa.b === bb.b && aa.a === bb.a
}
