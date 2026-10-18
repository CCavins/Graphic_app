import { readFileSync } from 'node:fs'
import { features } from './features'

const sources = [
  readFileSync(new URL('../src/coverage.test.ts', import.meta.url), 'utf8'),
  readFileSync(new URL('../src/perf.test.ts', import.meta.url), 'utf8'),
  readFileSync(new URL('../e2e/app.spec.ts', import.meta.url), 'utf8'),
  readFileSync(new URL('../e2e/layout.spec.ts', import.meta.url), 'utf8'),
  readFileSync(new URL('../e2e/tools.spec.ts', import.meta.url), 'utf8'),
]

const text = sources.join('\n')
const missing: string[] = []
for (const feature of features) {
  if (feature.gap) {
    if (!feature.reason) missing.push(`${feature.id} gap needs a reason`)
    else if (!text.includes(feature.id) && !text.includes(feature.reason.slice(0, 24))) {
      missing.push(`${feature.id} limitation is not asserted`)
    }
    continue
  }
  if (!text.includes(`'${feature.id}'`) && !text.includes(`"${feature.id}"`) && !text.includes(feature.id)) {
    missing.push(feature.id)
  }
}
if (missing.length) {
  console.error(missing.join('\n'))
  process.exit(1)
}
console.log(`coverage ok: ${features.filter((feature) => !feature.gap).length} features`)
