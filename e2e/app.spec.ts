import { expect, test, type Page } from '@playwright/test'

async function drawRect(page: Page) {
  await page.getByTestId('tool-rect').click()
  const canvas = page.getByTestId('canvas')
  const box = await canvas.boundingBox()
  if (!box) throw new Error('canvas missing')
  await page.mouse.move(box.x + 80, box.y + 90)
  await page.mouse.down()
  await page.mouse.move(box.x + 220, box.y + 180, { steps: 5 })
  await expect(page.getByTestId('readout')).not.toHaveText('')
  await page.mouse.up()
}

test('toolbar icons show names on hover', async ({ page }) => {
  await page.goto('./')
  const pen = page.getByTestId('tool-pen')
  await expect(pen).toHaveAttribute('aria-label', 'Pen')
  await expect(pen.locator('.tip')).toHaveCSS('opacity', '0')
  await pen.hover()
  await expect(pen.locator('.tip')).toHaveCSS('opacity', '1')
  await expect(pen.locator('.tip')).toHaveText('Pen')
})

test('snap is optional and corners follow the cursor', async ({ page }) => {
  await page.goto('./')
  await expect(page.getByTestId('snap')).toHaveValue('off')
  await page.getByTestId('tool-rect').click()
  const canvas = page.getByTestId('canvas')
  const box = await canvas.boundingBox()
  if (!box) throw new Error('canvas missing')
  const start = { x: box.x + 90, y: box.y + 110 }
  const end = { x: box.x + 210, y: box.y + 190 }
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(end.x, end.y, { steps: 4 })
  await page.mouse.up()
  const placed = await page.evaluate(() => {
    const editor = window.__measured!.editor
    const node = editor.doc.layers[0].children[0]
    const zoom = editor.view.zoom
    const originX = editor.view.panX
    const originY = editor.view.panY
    return {
      x: node.x,
      y: node.y,
      zoom,
      originX,
      originY,
    }
  })
  const paperStartX = (90 - placed.originX) / placed.zoom
  const paperStartY = (110 - placed.originY) / placed.zoom
  expect(Math.abs(placed.x - paperStartX)).toBeLessThan(1.5)
  expect(Math.abs(placed.y - paperStartY)).toBeLessThan(1.5)
  await page.getByTestId('snap').selectOption('1')
  await expect(page.getByTestId('active-tool')).toHaveText('Rect')
})

test('text tool edits an existing text box', async ({ page }) => {
  await page.goto('./')
  await page.getByTestId('tool-text').click()
  const canvas = page.getByTestId('canvas')
  const box = await canvas.boundingBox()
  if (!box) throw new Error('canvas missing')
  await page.mouse.click(box.x + 120, box.y + 140)
  const editorBox = page.getByTestId('text-editor')
  await expect(editorBox).toBeVisible()
  await editorBox.fill('Room label')
  await page.keyboard.press('Escape')
  await expect(editorBox).toBeHidden()
  const point = await page.evaluate(() => {
    const current = window.__measured!.editor
    const node = current.doc.layers[0].children[0]
    const client = current.toClient({ x: node.x + 6, y: node.y + 6 })
    const canvas = document.querySelector('[data-testid=canvas]')!.getBoundingClientRect()
    const x = canvas.left + client.x
    const y = canvas.top + client.y
    const el = document.elementFromPoint(x, y)
    return { x, y, tag: el?.tagName, testid: el?.getAttribute('data-testid'), nodeX: node.x, nodeY: node.y, client }
  })
  await page.mouse.click(point.x, point.y)
  const state = await page.evaluate(() => {
    const current = window.__measured!.editor
    const node = current.doc.layers[0].children[0]
    return {
      count: current.doc.layers[0].children.length,
      editing: current.editingTextId,
      text: node?.text?.content,
    }
  })
  expect(state.text).toBe('Room label')
  expect(state.count).toBe(1)
  await expect(page.getByTestId('text-editor')).toHaveValue('Room label')
})

test('draw-rect live size and dimension', async ({ page }) => {
  await page.goto('./')
  await drawRect(page)
  const count = await page.evaluate(() => window.__measured!.editor.doc.layers[0].children.length)
  expect(count).toBe(1)
  await page.getByTestId('tool-line').click()
  await page.evaluate(() => {
    window.__measured!.editor.lineMode = 'dimension'
  })
  const canvas = page.getByTestId('canvas')
  const box = await canvas.boundingBox()
  if (!box) throw new Error('canvas missing')
  await page.mouse.move(box.x + 100, box.y + 220)
  await page.mouse.down()
  await page.mouse.move(box.x + 260, box.y + 220, { steps: 4 })
  await page.mouse.up()
  const kinds = await page.evaluate(() => window.__measured!.editor.doc.layers[0].children.map((node) => node.kind))
  expect(kinds).toContain('dimension')
})

test('wheel pan and pinch zoom', async ({ page }) => {
  await page.goto('./')
  const before = await page.evaluate(() => ({ ...window.__measured!.editor.view }))
  await page.getByTestId('canvas').hover()
  await page.mouse.wheel(30, 20)
  const panned = await page.evaluate(() => window.__measured!.editor.view.panX)
  expect(panned).toBeLessThan(before.panX)
  await page.keyboard.down('Control')
  await page.mouse.wheel(0, -80)
  await page.keyboard.up('Control')
  const zoom = await page.evaluate(() => window.__measured!.editor.view.zoom)
  expect(zoom).toBeGreaterThan(before.zoom)
})

test('library search stays virtualized', async ({ page }) => {
  await page.goto('./')
  await page.getByTestId('tab-Libraries').click()
  await expect(page.getByTestId('catalog-count')).toContainText(/\d/)
  const count = await page.getByTestId('symbol-item').count()
  expect(count).toBeLessThan(30)
  expect(count).toBeGreaterThan(0)
  await page.getByTestId('library-search').fill('65 in TV')
  await expect(page.getByTestId('symbol-item').first()).toContainText('65')
})

test('corrupt file keeps the document', async ({ page }) => {
  await page.goto('./')
  await drawRect(page)
  await page.getByTestId('file-input').setInputFiles({
    name: 'broken.measured',
    mimeType: 'application/json',
    buffer: Buffer.from('{'),
  })
  await expect(page.getByTestId('banner')).toContainText(/not a Measured/)
  const count = await page.evaluate(() => window.__measured!.editor.doc.layers[0].children.length)
  expect(count).toBe(1)
})

test('two-finger gesture does not create a shape', async ({ page }) => {
  await page.goto('./')
  await page.getByTestId('tool-rect').click()
  await page.evaluate(() => {
    const canvas = document.querySelector('[data-testid=canvas]') as HTMLCanvasElement
    const rect = canvas.getBoundingClientRect()
    const fire = (type: string, id: number, x: number, y: number) => {
      canvas.dispatchEvent(new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        pointerId: id,
        pointerType: 'touch',
        clientX: rect.left + x,
        clientY: rect.top + y,
        button: 0,
        buttons: type === 'pointerup' ? 0 : 1,
      }))
    }
    fire('pointerdown', 1, 40, 40)
    fire('pointerdown', 2, 70, 50)
    fire('pointermove', 1, 160, 120)
    fire('pointerup', 1, 160, 120)
    fire('pointerup', 2, 70, 50)
  })
  const count = await page.evaluate(() => window.__measured!.editor.doc.layers[0].children.length)
  expect(count).toBe(0)
})

test('pointer-move performance in outline mode', async ({ page }) => {
  await page.goto('./')
  await page.evaluate(() => {
    performance.clearMeasures('pointer-move')
    window.__measured!.editor.doc.canvas.viewMode = 'outline'
    window.__measured!.seed(1000)
  })
  const canvas = page.getByTestId('canvas')
  const box = await canvas.boundingBox()
  if (!box) throw new Error('canvas missing')
  await page.mouse.move(box.x + 30, box.y + 40)
  await page.mouse.down()
  for (let i = 0; i < 8; i++) await page.mouse.move(box.x + 40 + i * 12, box.y + 50)
  await page.mouse.up()
  const durations = await page.evaluate(() => window.__measured!.frames())
  const sorted = [...durations].sort((a, b) => a - b)
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0
  expect(median).toBeLessThan(32)
})

test('export svg from the dialog', async ({ page }) => {
  await page.goto('./')
  await drawRect(page)
  await page.getByTestId('export-open').click()
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('export-confirm').click(),
  ])
  expect(download.suggestedFilename()).toContain('.svg')
  const path = await download.path()
  const { readFileSync } = await import('node:fs')
  expect(readFileSync(path!, 'utf8')).toContain('<svg')
})
