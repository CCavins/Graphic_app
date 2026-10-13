import { expect, it } from 'vitest'
import { CATALOG, loadCatalog, searchCatalog } from './catalog/catalog'
import { Editor } from './editor/editor'
import { makeRect } from './model/factory'

it('catalog-load-perf', async () => {
  const start = performance.now()
  await loadCatalog()
  expect(performance.now() - start).toBeLessThan(4000)
  expect(CATALOG.length).toBeGreaterThanOrEqual(2000)
})

it('search-perf', async () => {
  await loadCatalog()
  const start = performance.now()
  const found = searchCatalog(CATALOG, 'door')
  expect(performance.now() - start).toBeLessThan(50)
  expect(found.length).toBeGreaterThan(0)
})

it('seed-perf', () => {
  const app = new Editor()
  const start = performance.now()
  app.seedRects(1000)
  expect(performance.now() - start).toBeLessThan(200)
  expect(app.doc.layers[0].children).toHaveLength(1000)
})

it('svg-export-perf', () => {
  const app = new Editor()
  for (let i = 0; i < 500; i++) app.doc.layers[0].children.push(makeRect(i, 0, 4, 4))
  const start = performance.now()
  const svg = app.exportSvg()
  expect(performance.now() - start).toBeLessThan(2000)
  expect(svg.startsWith('<?xml')).toBe(true)
})

it('undo-cap-memory', () => {
  const app = new Editor()
  for (let i = 0; i < 250; i++) app.addLayer()
  expect(app.historySize()).toBeLessThanOrEqual(200)
})
