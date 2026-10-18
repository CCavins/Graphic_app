import type { BaseUnit, LabelUnit } from './types'
import { PT_PER_IN } from './types'
import { inchesPerBaseUnit, scaleFromStatement, toInches } from './units'

/** "paperAmount paperUnit on the page stands for realAmount realUnit in the world." */
export interface ScaleStatement {
  paperAmount: number
  paperUnit: BaseUnit
  realAmount: number
  realUnit: LabelUnit
}

export type UnitSystem = 'imperial' | 'metric' | 'px'

export function unitSystem(unit: BaseUnit): UnitSystem {
  if (unit === 'in') return 'imperial'
  if (unit === 'px') return 'px'
  return 'metric'
}

/** Real-world units that make sense on the right side of a scale for the given page unit. */
export function realUnitsFor(unit: BaseUnit): LabelUnit[] {
  switch (unitSystem(unit)) {
    case 'imperial':
      return ['in', 'ft', 'yd', 'mi']
    case 'metric':
      return ['mm', 'cm', 'm', 'km']
    default:
      return ['px', 'in', 'ft', 'cm', 'm']
  }
}

/** The measurement-label unit a scale statement implies: feet read best as feet-and-inches. */
export function labelUnitForScale(scale: ScaleStatement): LabelUnit {
  return scale.realUnit === 'ft' ? 'ft-in' : scale.realUnit
}

/** Dimensionless ratio: how many real lengths one paper length stands for (1:48 → 48). */
export function scaleRatio(scale: ScaleStatement): number {
  return toInches(scale.realAmount, scale.realUnit) / (scale.paperAmount * inchesPerBaseUnit(scale.paperUnit))
}

export function ratioFromInchesPerPoint(realInchesPerPoint: number): number {
  return realInchesPerPoint * PT_PER_IN
}

export function realInchesPerPointFor(scale: ScaleStatement): number {
  return scaleFromStatement(scale.paperAmount, scale.paperUnit, scale.realAmount, scale.realUnit)
}

export function actualSize(unit: BaseUnit): ScaleStatement {
  const real: LabelUnit = unit === 'px' ? 'px' : unit
  return { paperAmount: 1, paperUnit: unit, realAmount: 1, realUnit: real }
}

const NICE_FRACTIONS = [1, 3 / 4, 1 / 2, 3 / 8, 1 / 4, 3 / 16, 1 / 8, 3 / 32, 1 / 16, 1 / 32]

function close(a: number, b: number): boolean {
  return Math.abs(a - b) <= Math.max(1e-9, Math.abs(b) * 1e-6)
}

/**
 * Re-express a ratio as a statement in the given page unit, the way someone working in that unit would say it:
 * 1:48 in inches is "1/4 in = 1 ft"; in millimetres it is "1 mm = 4.8 cm"; in centimetres "1 cm = 48 cm".
 */
export function restateScale(ratio: number, unit: BaseUnit): ScaleStatement {
  if (!(ratio > 0) || !Number.isFinite(ratio)) return actualSize(unit)
  if (close(ratio, 1)) return actualSize(unit)
  switch (unitSystem(unit)) {
    case 'imperial': {
      // Architect's scales: a nice fraction of an inch to the foot.
      const inchesPerFoot = 12 / ratio
      if (NICE_FRACTIONS.some((f) => close(inchesPerFoot, f))) return { paperAmount: round(inchesPerFoot), paperUnit: 'in', realAmount: 1, realUnit: 'ft' }
      if (ratio >= 12) return { paperAmount: 1, paperUnit: 'in', realAmount: round(ratio / 12), realUnit: 'ft' }
      return { paperAmount: 1, paperUnit: 'in', realAmount: round(ratio), realUnit: 'in' }
    }
    case 'metric': {
      const perUnit = unit === 'mm' ? 1 : 10 // millimetres in one page unit
      const realMm = ratio * perUnit
      if (realMm >= 1_000_000) return { paperAmount: 1, paperUnit: unit, realAmount: round(realMm / 1_000_000), realUnit: 'km' }
      if (realMm >= 1000) return { paperAmount: 1, paperUnit: unit, realAmount: round(realMm / 1000), realUnit: 'm' }
      if (unit === 'mm' && realMm >= 10) return { paperAmount: 1, paperUnit: unit, realAmount: round(realMm / 10), realUnit: 'cm' }
      return { paperAmount: 1, paperUnit: unit, realAmount: round(ratio), realUnit: unit }
    }
    default: {
      const realInches = ratio / PT_PER_IN
      if (realInches >= 12) return { paperAmount: 1, paperUnit: 'px', realAmount: round(realInches / 12), realUnit: 'ft' }
      if (realInches >= 1) return { paperAmount: 1, paperUnit: 'px', realAmount: round(realInches), realUnit: 'in' }
      return { paperAmount: 1, paperUnit: 'px', realAmount: round(ratio), realUnit: 'px' }
    }
  }
}

/** Trims float noise without losing the ratio; display formatting shortens further. */
function round(value: number): number {
  return Number(value.toPrecision(12))
}

/** "1/4" for a nice fraction of an inch, otherwise a short decimal. */
export function formatScaleAmount(amount: number, unit: BaseUnit | LabelUnit): string {
  if (unit === 'in') {
    for (const d of [2, 4, 8, 16, 32]) {
      const n = amount * d
      if (close(n, Math.round(n)) && Math.round(n) % d !== 0 && amount < 1) return `${Math.round(n)}/${d}`
    }
  }
  return String(Number(amount.toPrecision(6)))
}

export function formatScale(scale: ScaleStatement): string {
  return `${formatScaleAmount(scale.paperAmount, scale.paperUnit)} ${scale.paperUnit} = ${formatScaleAmount(scale.realAmount, scale.realUnit)} ${scale.realUnit}`
}

export function formatRatio(ratio: number): string {
  if (close(ratio, 1)) return '1:1'
  return `1:${Number(ratio.toFixed(ratio >= 10 ? 0 : 2))}`
}

/** Parses an amount typed without a unit: "1/4", "0.25", "1 1/2". The unit comes from the menu beside the box. */
export function parseScaleAmount(raw: string): number {
  const text = raw.trim()
  if (/[a-z"']/i.test(text)) throw new Error('Type just the number; pick the unit from the menu beside it')
  const match = text.match(/^(\d+(?:\.\d+)?)?\s*(?:(\d+)\s*\/\s*(\d+))?$/)
  if (!match || (!match[1] && !match[2])) throw new Error('Enter an amount like 1, 0.25, or 1/4')
  const amount = (match[1] ? Number(match[1]) : 0) + (match[2] ? Number(match[2]) / Number(match[3]) : 0)
  if (!(amount > 0) || !Number.isFinite(amount)) throw new Error('The amount must be more than zero')
  return amount
}

/** Common scales for the page unit's system, each as the statement a user in that system would write. */
export function scalePresets(unit: BaseUnit): { id: string; label: string; scale: ScaleStatement }[] {
  const make = (ratio: number): { id: string; label: string; scale: ScaleStatement } => {
    const scale = restateScale(ratio, unit)
    return { id: `r${ratio}`, label: `${formatScale(scale)}  (${formatRatio(ratio)})`, scale }
  }
  switch (unitSystem(unit)) {
    case 'imperial':
      return [{ id: 'r1', label: 'Actual size (1:1)', scale: actualSize(unit) }, 12, 24, 48, 96, 120, 240, 600].map((item) => (typeof item === 'number' ? make(item) : item))
    case 'metric':
      return [{ id: 'r1', label: 'Actual size (1:1)', scale: actualSize(unit) }, 10, 20, 50, 100, 200, 500, 1000].map((item) => (typeof item === 'number' ? make(item) : item))
    default:
      return [
        { id: 'r1', label: 'Actual size (1:1)', scale: actualSize(unit) },
        { id: 'px-in', label: '1 px = 1 in', scale: { paperAmount: 1, paperUnit: 'px', realAmount: 1, realUnit: 'in' } },
        { id: 'px-ft', label: '1 px = 1 ft', scale: { paperAmount: 1, paperUnit: 'px', realAmount: 1, realUnit: 'ft' } },
        { id: 'px-cm', label: '1 px = 1 cm', scale: { paperAmount: 1, paperUnit: 'px', realAmount: 1, realUnit: 'cm' } },
        { id: '100px-m', label: '100 px = 1 m', scale: { paperAmount: 100, paperUnit: 'px', realAmount: 1, realUnit: 'm' } },
      ]
  }
}

/** The preset whose ratio matches the current scale, if any. */
export function matchingPreset(unit: BaseUnit, realInchesPerPoint: number): string | null {
  const ratio = ratioFromInchesPerPoint(realInchesPerPoint)
  return scalePresets(unit).find((preset) => close(scaleRatio(preset.scale), ratio))?.id ?? null
}
