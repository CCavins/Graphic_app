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

export function adjustColor(
  color: Color,
  method: 'hue' | 'balance' | 'brightness',
  amount: number,
): Color {
  const base = toRgb(color)
  const hsl = rgbToHsl(base)
  if (method === 'hue') hsl.h = (hsl.h + amount) % 1
  if (method === 'balance') {
    hsl.s = Math.max(0, Math.min(1, hsl.s + amount))
  }
  if (method === 'brightness') hsl.l = Math.max(0, Math.min(1, hsl.l + amount))
  const next = hslToRgb(hsl.h, hsl.s, hsl.l, base.a)
  return color.space === 'cmyk' ? { ...color, a: next.a } : next
}

export function colorsEqual(a: Color, b: Color): boolean {
  const aa = toRgb(a)
  const bb = toRgb(b)
  return aa.r === bb.r && aa.g === bb.g && aa.b === bb.b && aa.a === bb.a
}
