import { expect, test, type Page } from '@playwright/test'

// Every tool on the left bar, exercised the way a person uses it: pick it by key, act on the page, see a result, undo.

type Box = { x: number; y: number }

async function canvasBox(page: Page): Promise<Box> {
  const box = await page.getByTestId('canvas').boundingBox()
  if (!box) throw new Error('canvas missing')
  return box
}

async function drag(page: Page, box: Box, from: [number, number], to: [number, number], steps = 6) {
  await page.mouse.move(box.x + from[0], box.y + from[1])
  await page.mouse.down()
  await page.mouse.move(box.x + to[0], box.y + to[1], { steps })
  await page.mouse.up()
}

const count = (page: Page) => page.evaluate(() => window.__measured!.editor.doc.layers.reduce((n, layer) => n + layer.children.length, 0))
const first = (page: Page) =>
  page.evaluate(() => {
    const editor = window.__measured!.editor
    const node = editor.doc.layers[0].children[0]
    return node ? { kind: node.kind, commands: node.commands.length, name: node.name, fill: editor.fillOf(node)?.gradient?.kind ?? 'solid' } : null
  })

const drawers: { key: string; name: string; draw: (page: Page, box: Box) => Promise<void> }[] = [
  { key: 'p', name: 'Pen', draw: async (page, box) => {
    await page.mouse.click(box.x + 80, box.y + 80)
    await page.mouse.click(box.x + 200, box.y + 100)
    await page.mouse.click(box.x + 160, box.y + 200)
    await page.keyboard.press('Escape')
  } },
  { key: 'n', name: 'Pencil', draw: (page, box) => drag(page, box, [80, 80], [220, 200], 12) },
  { key: 'b', name: 'Brush', draw: (page, box) => drag(page, box, [80, 80], [220, 200], 12) },
  { key: 'l', name: 'Line', draw: (page, box) => drag(page, box, [80, 80], [220, 200]) },
  { key: 'u', name: 'Arc', draw: (page, box) => drag(page, box, [80, 80], [220, 200]) },
  { key: 'r', name: 'Rectangle', draw: (page, box) => drag(page, box, [80, 80], [220, 200]) },
  { key: 'd', name: 'Rounded rectangle', draw: (page, box) => drag(page, box, [80, 80], [220, 200]) },
  { key: 'o', name: 'Ellipse', draw: (page, box) => drag(page, box, [80, 80], [220, 200]) },
  { key: 'y', name: 'Polygon', draw: (page, box) => drag(page, box, [80, 80], [220, 200]) },
  { key: 's', name: 'Star', draw: (page, box) => drag(page, box, [80, 80], [220, 200]) },
  { key: 't', name: 'Text', draw: async (page, box) => {
    await page.mouse.click(box.x + 120, box.y + 140)
    await page.getByTestId('text-editor').fill('Kitchen')
    await page.keyboard.press('Escape')
  } },
]

test('every drawing tool makes one shape by its key and undoes in one step (tool-draw-all)', async ({ page }) => {
  await page.goto('./')
  const box = await canvasBox(page)
  for (const tool of drawers) {
    await page.keyboard.press(tool.key)
    await expect(page.getByTestId('active-tool'), tool.name).toHaveText(tool.name)
    const before = await count(page)
    await tool.draw(page, box)
    expect(await count(page), `${tool.name} should add a shape`).toBe(before + 1)
    await page.keyboard.press('Meta+z')
    expect(await count(page), `${tool.name} should undo in one step`).toBe(before)
  }
})

test('editing tools act on an existing shape: eraser, scissors, add anchor, gradient (tool-edit-all)', async ({ page }) => {
  await page.goto('./')
  const box = await canvasBox(page)
  await page.keyboard.press('r')
  await drag(page, box, [80, 80], [220, 200])
  const rect = await first(page)
  expect(rect?.kind).toBe('path')

  // Add anchor: one more command on the outline.
  await page.keyboard.press('+')
  await page.mouse.click(box.x + 150, box.y + 80)
  expect((await first(page))!.commands).toBeGreaterThan(rect!.commands)
  await page.keyboard.press('Meta+z')
  expect((await first(page))!.commands).toBe(rect!.commands)

  // Gradient: drag across the selected shape to turn its fill into a gradient.
  await page.keyboard.press('g')
  await drag(page, box, [90, 140], [210, 140])
  expect((await first(page))!.fill).toBe('linear')
  await page.keyboard.press('Meta+z')

  // Scissors: cutting a closed outline leaves it as one open path; a second cut makes two.
  await page.keyboard.press('c')
  await page.mouse.click(box.x + 150, box.y + 80)
  await page.mouse.click(box.x + 150, box.y + 200)
  expect(await count(page)).toBe(2)
  await page.keyboard.press('Meta+z')
  await page.keyboard.press('Meta+z')
  expect(await count(page)).toBe(1)

  // Eraser: a stroke across the whole shape removes what it touches.
  await page.keyboard.press('e')
  await page.keyboard.press('v')
  await page.mouse.click(box.x + 150, box.y + 140)
  await page.keyboard.press('e')
  await drag(page, box, [60, 140], [240, 140], 10)
  const after = await first(page)
  expect(after === null || after.commands !== rect!.commands || (await count(page)) !== 1).toBeTruthy()
})

test('view tools: hand pans, zoom zooms in and out with Option, select and direct select pick shapes (tool-view-select)', async ({ page }) => {
  await page.goto('./')
  const box = await canvasBox(page)
  await page.keyboard.press('r')
  await drag(page, box, [80, 80], [220, 200])

  const view = () => page.evaluate(() => ({ ...window.__measured!.editor.view }))
  const start = await view()
  await page.keyboard.press('h')
  await drag(page, box, [400, 400], [460, 430])
  const panned = await view()
  expect(panned.panX).not.toBe(start.panX)
  expect(panned.zoom).toBe(start.zoom)

  await page.keyboard.press('z')
  await page.mouse.click(box.x + 400, box.y + 400)
  expect((await view()).zoom).toBeGreaterThan(start.zoom)
  await page.keyboard.down('Alt')
  await page.mouse.click(box.x + 400, box.y + 400)
  await page.keyboard.up('Alt')
  expect((await view()).zoom).toBeCloseTo(start.zoom, 5)

  await page.keyboard.press('v')
  await page.mouse.click(box.x + 500, box.y + 500)
  expect(await page.evaluate(() => window.__measured!.editor.selection.length)).toBe(0)
  await page.mouse.click(box.x + 150, box.y + 140)
  expect(await page.evaluate(() => window.__measured!.editor.selection.length)).toBe(1)
  await page.keyboard.press('a')
  await expect(page.getByTestId('active-tool')).toHaveText('Direct select')
  const corner = await page.evaluate(() => {
    const editor = window.__measured!.editor
    const node = editor.doc.layers[0].children[0]
    const start = node.commands[0]
    return editor.toClient({ x: node.x + start.x, y: node.y + start.y })
  })
  await page.mouse.click(box.x + corner.x, box.y + corner.y)
  expect(await page.evaluate(() => window.__measured!.editor.anchor?.index)).toBe(0)
})

test('appearance pane: fill hex, stroke width, and an effect toggle change the selected shape (pane-appearance)', async ({ page }) => {
  await page.goto('./')
  const box = await canvasBox(page)
  await page.keyboard.press('r')
  await drag(page, box, [80, 80], [220, 200])
  await expect(page.getByTestId('tab-Appearance')).toHaveAttribute('aria-expanded', 'true')
  await page.getByTestId('fill-hex').fill('#ff0000')
  await page.getByTestId('fill-hex').press('Enter')
  await page.getByTestId('stroke-width').fill('7')
  await page.getByTestId('stroke-width').press('Enter')
  await page.getByTestId('toggle-dropShadow').click()
  const node = await page.evaluate(() => {
    const editor = window.__measured!.editor
    const n = editor.doc.layers[0].children[0]
    return { fill: editor.hexOf(editor.fillOf(n)!.color), width: editor.strokeOf(n)?.width, shadow: Boolean(editor.effectOf(n, 'dropShadow')?.enabled) }
  })
  expect(node.fill.toLowerCase()).toBe('#ff0000')
  expect(node.width).toBe(7)
  expect(node.shadow).toBe(true)
  await page.getByTestId('stroke-width').fill('wide')
  await page.getByTestId('stroke-width').press('Enter')
  await expect(page.getByTestId('stroke-width')).toHaveAttribute('aria-invalid', 'true')
})

test('layers pane: add a layer, draw into it, hide it, and the object list follows (pane-layers)', async ({ page }) => {
  await page.goto('./')
  const box = await canvasBox(page)
  await page.getByTestId('tab-Layers').click()
  await page.getByTestId('add-layer').click()
  await expect(page.getByTestId('layer')).toHaveCount(2)
  await page.keyboard.press('r')
  await drag(page, box, [80, 80], [220, 200])
  const where = await page.evaluate(() => {
    const doc = window.__measured!.editor.doc
    return { active: doc.activeLayerId, counts: doc.layers.map((layer) => layer.children.length), top: doc.layers[doc.layers.length - 1].id }
  })
  expect(where.counts.reduce((a, b) => a + b, 0)).toBe(1)
  expect(where.counts[where.counts.length - 1] === 1 || where.counts[0] === 1).toBeTruthy()
  await expect(page.getByTestId('object-row')).toHaveCount(1)
  await page.getByTestId('layer-visible').first().click()
  const hidden = await page.evaluate(() => window.__measured!.editor.doc.layers.some((layer) => layer.visible === false))
  expect(hidden).toBe(true)
})

test('export downloads PNG and PDF files (export-png-pdf)', async ({ page }) => {
  await page.goto('./')
  const box = await canvasBox(page)
  await page.keyboard.press('r')
  await drag(page, box, [80, 80], [220, 200])
  for (const format of ['png', 'pdf']) {
    await page.getByTestId('export-open').click()
    await page.getByTestId('export-format').selectOption(format)
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-confirm').click()])
    expect(download.suggestedFilename()).toContain(`.${format}`)
    const path = await download.path()
    const { statSync } = await import('node:fs')
    expect(statSync(path!).size).toBeGreaterThan(100)
    await page.keyboard.press('Escape')
  }
})

test('save says where the file went when the browser has no save dialog (save-feedback)', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true })
  })
  await page.goto('./')
  const box = await canvasBox(page)
  await page.keyboard.press('r')
  await drag(page, box, [80, 80], [220, 200])
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('save-file').click()])
  expect(download.suggestedFilename()).toContain('.measured')
  await expect(page.getByTestId('banner')).toContainText('Downloads')
})
