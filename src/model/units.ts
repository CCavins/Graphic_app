import type { BaseUnit, LabelUnit, Precision } from './types'
import { PT_PER_IN } from './types'

const IN_PER_MM = 1 / 25.4
const IN_PER_CM = 1 / 2.54
const IN_PER_M = 39.37007874015748
const IN_PER_KM = 39370.07874015748
const IN_PER_FT = 12
const IN_PER_YD = 36
const IN_PER_MI = 63360

export class InputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InputError'
  }
}

export function inchesPerBaseUnit(unit: BaseUnit): number {
  if (unit === 'in') return 1
  if (unit === 'cm') return IN_PER_CM
  if (unit === 'mm') return IN_PER_MM
  return 1 / PT_PER_IN
}

/** Real inches per paper point for a paper-to-world statement. */
export function scaleFromStatement(
  paperAmount: number,
  paperUnit: BaseUnit,
  realAmount: number,
  realUnit: LabelUnit,
): number {
  if (!(paperAmount > 0) || !Number.isFinite(paperAmount)) {
    throw new InputError('Scale paper amount must be positive')
  }
  if (!(realAmount > 0) || !Number.isFinite(realAmount)) {
    throw new InputError('Scale real amount must be positive')
  }
  const paperPoints = paperAmount * inchesPerBaseUnit(paperUnit) * PT_PER_IN
  return toInches(realAmount, realUnit) / paperPoints
}

export function oneToOneScale(): number {
  return scaleFromStatement(1, 'in', 1, 'in')
}

export function quarterInchFootScale(): number {
  return scaleFromStatement(0.25, 'in', 1, 'ft')
}

export function pixelFootScale(): number {
  return scaleFromStatement(1, 'px', 1, 'ft')
}

export function toInches(amount: number, unit: LabelUnit): number {
  switch (unit) {
    case 'px':
      return amount / PT_PER_IN
    case 'in':
      return amount
    case 'ft':
    case 'ft-in':
      return amount * IN_PER_FT
    case 'yd':
      return amount * IN_PER_YD
    case 'mi':
      return amount * IN_PER_MI
    case 'mm':
      return amount * IN_PER_MM
    case 'cm':
      return amount * IN_PER_CM
    case 'm':
      return amount * IN_PER_M
    case 'km':
      return amount * IN_PER_KM
    default:
      return amount
  }
}

export function fromInches(inches: number, unit: LabelUnit): number {
  switch (unit) {
    case 'px':
      return inches * PT_PER_IN
    case 'in':
      return inches
    case 'ft':
    case 'ft-in':
      return inches / IN_PER_FT
    case 'yd':
      return inches / IN_PER_YD
    case 'mi':
      return inches / IN_PER_MI
    case 'mm':
      return inches / IN_PER_MM
    case 'cm':
      return inches / IN_PER_CM
    case 'm':
      return inches / IN_PER_M
    case 'km':
      return inches / IN_PER_KM
    default:
      return inches
  }
}

export function paperPointsToWorldInches(points: number, realInchesPerPoint: number): number {
  return points * realInchesPerPoint
}

export function worldInchesToPaperPoints(inches: number, realInchesPerPoint: number): number {
  if (!(realInchesPerPoint > 0) || !Number.isFinite(realInchesPerPoint)) {
    throw new InputError('Scale must be a positive number')
  }
  return inches / realInchesPerPoint
}

const FRACTION_DENOMS = [2, 4, 8, 16, 32] as const

function roundToFraction(value: number, denominator: number): { whole: number; num: number; den: number } {
  const sign = value < 0 ? -1 : 1
  const abs = Math.abs(value)
  const whole = Math.floor(abs + 1e-9)
  const frac = abs - whole
  const num = Math.round(frac * denominator)
  if (num === 0) return { whole: sign * whole, num: 0, den: denominator }
  if (num === denominator) return { whole: sign * (whole + 1), num: 0, den: denominator }
  return { whole: sign * whole, num, den: denominator }
}

function formatNumber(value: number, precision: Precision): string {
  if (precision.mode === 'fraction') {
    const parts = roundToFraction(value, precision.denominator)
    const whole = parts.whole
    if (parts.num === 0) return String(whole)
    const frac = `${parts.num}/${parts.den}`
    if (whole === 0) return value < 0 ? `-${frac}` : frac
    return `${whole} ${frac}`
  }
  const digits = Math.min(4, Math.max(0, precision.decimals))
  let text = value.toFixed(digits)
  if (precision.trimZeros && text.includes('.')) {
    text = text.replace(/\.?0+$/, '')
  }
  return text
}

export function formatWorldLength(
  worldInches: number,
  unit: LabelUnit,
  precision: Precision,
  showUnits: boolean,
): string {
  if (unit === 'ft-in') {
    const sign = worldInches < 0 ? '-' : ''
    const total = Math.abs(worldInches)
    let feet = Math.floor(total / 12)
    let inches = total - feet * 12
    if (precision.mode === 'fraction') {
      const rounded = roundToFraction(inches, precision.denominator)
      inches = Math.abs(rounded.whole) + (rounded.num === 0 ? 0 : rounded.num / rounded.den)
      if (inches >= 12 - 1e-9) {
        feet += 1
        inches = 0
      }
      const inchText =
        rounded.num === 0
          ? String(Math.round(inches))
          : inches >= 1
            ? `${Math.floor(inches)} ${rounded.num}/${rounded.den}`
            : `${rounded.num}/${rounded.den}`
      const body = inches === 0 ? `${feet} ft` : feet === 0 ? `${inchText} in` : `${feet} ft ${inchText} in`
      return sign + (showUnits ? body : body.replace(/ ft/g, "'").replace(/ in/g, '"'))
    }
    const inchText = formatNumber(inches, precision)
    const body = Number(inchText) === 0 ? `${feet} ft` : feet === 0 ? `${inchText} in` : `${feet} ft ${inchText} in`
    return sign + (showUnits ? body : body.replace(/ ft/g, "'").replace(/ in/g, '"'))
  }
  const amount = fromInches(worldInches, unit)
  const num = formatNumber(amount, precision)
  if (!showUnits) return num
  const suffix = unit === 'px' ? 'px' : unit
  return `${num} ${suffix}`
}

export function formatArea(worldSquareInches: number, unit: LabelUnit, precision: Precision): string {
  const linear = unit === 'ft-in' ? 'ft' : unit === 'px' ? 'in' : unit
  const per = toInches(1, linear)
  const amount = worldSquareInches / (per * per)
  return `${formatNumber(amount, precision)} sq ${linear}`
}

function parseFractionToken(token: string): number {
  const match = token.match(/^(\d+)\s*\/\s*(\d+)$/)
  if (!match) throw new InputError(`Unknown fraction ${token}`)
  const den = Number(match[2])
  if (!FRACTION_DENOMS.includes(den as (typeof FRACTION_DENOMS)[number])) {
    throw new InputError(`Fraction 1/${den} is not supported`)
  }
  return Number(match[1]) / den
}

/**
 * Parse a length into world inches.
 * Absolute units (ft, in, m, …) ignore the document scale.
 * px/cm/mm are paper quantities converted with realInchesPerPoint.
 */
export function parseLength(input: string, realInchesPerPoint: number): number {
  const raw = input.trim().toLowerCase().replace(/″/g, '"').replace(/′/g, "'")
  if (!raw) throw new InputError('Enter a length')
  if (/nan|infinity/i.test(raw)) throw new InputError('Length must be a finite number')

  const feetInches = raw.match(/^(-?\d+(?:\.\d+)?)\s*(?:'|ft)\s*(.*)$/)
  if (feetInches) {
    const feet = Number(feetInches[1])
    const rest = feetInches[2].trim().replace(/"$/, '').replace(/\s*in$/, '').trim()
    let inches = 0
    if (rest) {
      const bits = rest.split(/\s+/)
      for (const bit of bits) {
        if (!bit || bit === '"' || bit === 'in') continue
        inches += bit.includes('/') ? parseFractionToken(bit) : Number(bit)
        if (!Number.isFinite(inches)) throw new InputError('Length must be a finite number')
      }
    }
    return feet * 12 + Math.sign(feet || 1) * inches
  }

  const mixed = raw.match(/^(-?\d+)\s+(\d+\s*\/\s*\d+)\s*(in|")?$/)
  if (mixed) {
    const sign = mixed[1].startsWith('-') ? -1 : 1
    return sign * (Math.abs(Number(mixed[1])) + parseFractionToken(mixed[2]))
  }

  const unitMatch = raw.match(/^(-?\d+(?:\.\d+)?|\d+\s*\/\s*\d+)\s*(px|in|inch|inches|"|ft|yd|mi|mm|cm|m|km)?$/)
  if (!unitMatch) throw new InputError(`Cannot parse length ${input}`)
  const value = unitMatch[1].includes('/') ? parseFractionToken(unitMatch[1]) : Number(unitMatch[1])
  if (!Number.isFinite(value)) throw new InputError('Length must be a finite number')
  const unit = unitMatch[2] || 'in'
  if (unit === 'px') return value * realInchesPerPoint
  if (unit === 'in' || unit === 'inch' || unit === 'inches' || unit === '"') return value
  if (unit === 'ft') return value * 12
  if (unit === 'yd') return value * IN_PER_YD
  if (unit === 'mi') return value * IN_PER_MI
  if (unit === 'mm') return value * IN_PER_MM
  if (unit === 'cm') return value * IN_PER_CM
  if (unit === 'm') return value * IN_PER_M
  if (unit === 'km') return value * IN_PER_KM
  throw new InputError(`Unknown unit ${unit}`)
}

export function assertScale(value: number): void {
  if (!(value > 0) || !Number.isFinite(value)) throw new InputError('Scale must be a positive number')
}

export function assertCanvasPixels(width: number, height: number): void {
  if (!Number.isFinite(width) || !Number.isFinite(height)) throw new InputError('Canvas size must be a finite number')
  if (!(width > 0) || !(height > 0)) throw new InputError('Canvas size must be positive')
  if (width > 16000 || height > 16000) throw new InputError('Canvas cannot exceed 16000 by 16000')
}
