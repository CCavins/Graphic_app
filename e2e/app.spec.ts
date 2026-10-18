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

test('toolbar icons show name, key, and hint on hover (tool-tooltips)', async ({ page }) => {
  await page.goto('./')
  const pen = page.getByTestId('tool-pen')
  await expect(pen).toHaveAttribute('aria-label', 'Pen (P)')
  await expect(page.getByTestId('tool-tip')).toHaveCount(0)
  await pen.hover()
  const tip = page.getByTestId('tool-tip')
  await expect(tip).toBeVisible()
  await expect(tip).toContainText('Pen')
  await expect(tip.locator('kbd')).toHaveText('P')
  await expect(tip).toContainText('Click to add corner points')
  // The tip is positioned beside the toolbar, not clipped by it.
  const [tipBox, barBox] = await Promise.all([tip.boundingBox(), page.getByTestId('toolbar').boundingBox()])
  expect(tipBox!.x).toBeGreaterThanOrEqual(barBox!.x + barBox!.width - 1)
  await page.getByTestId('tool-star').hover()
  await expect(tip).toContainText('Star')
  await expect(tip.locator('kbd')).toHaveText('S')
  await page.getByTestId('canvas').hover()
  await expect(page.getByTestId('tool-tip')).toHaveCount(0)
  // Keyboard users get the same tip on focus.
  await pen.focus()
  await expect(page.getByTestId('tool-tip')).toContainText('Pen')
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
  await expect(page.getByTestId('active-tool')).toHaveText('Rectangle')
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

test('shell matches the Graphic layout', async ({ page }) => {
  await page.goto('./')
  // Document tabs on top, tool options under them, tools on the left, inspectors on the right.
  await expect(page.getByTestId('doc-tabs')).toBeVisible()
  await expect(page.getByTestId('doc-tab').first()).toContainText(/Untitled/)
  await expect(page.getByTestId('options-bar')).toBeVisible()
  await expect(page.getByTestId('active-tool')).toHaveText('Select')
  const toolbar = await page.getByTestId('toolbar').boundingBox()
  const inspector = await page.getByTestId('inspector').boundingBox()
  const canvas = await page.getByTestId('canvas').boundingBox()
  if (!toolbar || !inspector || !canvas) throw new Error('shell missing')
  expect(toolbar.x).toBeLessThan(canvas.x)
  expect(inspector.x).toBeGreaterThan(canvas.x + canvas.width - 1)
  await expect(page.getByTestId('well-fill')).toBeVisible()
  await expect(page.getByTestId('well-stroke')).toBeVisible()
  for (const pane of ['Properties', 'Appearance', 'Layers', 'Libraries']) {
    await expect(page.getByTestId(`tab-${pane}`)).toBeVisible()
  }
  await expect(page.getByTestId('pane-Properties')).toHaveAttribute('data-open', 'true')
  await expect(page.getByTestId('section-canvas')).toBeVisible()
  await expect(page.getByTestId('section-label')).toBeVisible()
  await page.getByTestId('tab-Layers').click()
  await expect(page.getByTestId('layers')).toBeVisible()
  // The options bar shows the second tool's name and options as tools change.
  await page.getByTestId('tool-star').click()
  await expect(page.getByTestId('active-tool')).toHaveText('Star')
  await expect(page.getByTestId('star-points')).toBeVisible()
  await page.getByTestId('new-doc').click()
  await expect(page.getByTestId('new-document')).toBeVisible()
  await page.getByTestId('style-graph').click()
  await page.getByTestId('new-create').click()
  await expect(page.getByTestId('doc-tab')).toHaveCount(2)
})

test('typed size, labels, and dotted stroke', async ({ page }) => {
  await page.goto('./')
  await drawRect(page)
  await expect(page.getByTestId('field-w')).toBeEnabled()
  await page.getByTestId('field-w').fill('5 in')
  await page.getByTestId('field-w').press('Enter')
  await page.getByTestId('field-h').fill('20 in')
  await page.getByTestId('field-h').press('Enter')
  const size = await page.evaluate(() => {
    const rect = window.__measured!.editor.selectionRect()!
    return { w: rect.w / 72, h: rect.h / 72 }
  })
  expect(size.w).toBeCloseTo(5, 3)
  expect(size.h).toBeCloseTo(20, 3)
  await expect(page.getByTestId('field-w')).toHaveValue(/5 in/)
  await expect(page.getByTestId('field-h')).toHaveValue(/20 in/)
  await page.getByTestId('label-width').click()
  await page.getByTestId('label-height').click()
  await page.getByTestId('label-size').click()
  const labels = await page.evaluate(() => {
    const editor = window.__measured!.editor
    const node = editor.one()!
    return editor.labelsOf(node).map((label) => editor.labelText(node, label))
  })
  expect(labels).toEqual(['5 in', '20 in', '5 in × 20 in'])
  await expect(page.getByTestId('label-list')).toContainText('5 in × 20 in')
  await page.getByTestId('dash').selectOption('dotted')
  const dash = await page.evaluate(() => {
    const editor = window.__measured!.editor
    return editor.strokeOf(editor.one()!)!.dash
  })
  expect(dash).toEqual([1, 4])
  await expect(page.getByTestId('stroke-dash')).toHaveValue('dotted')
  // Appearance paints: a new fill color lands on the shape.
  await page.getByTestId('fill-hex').fill('#ff0000')
  await page.getByTestId('fill-hex').press('Enter')
  const fill = await page.evaluate(() => {
    const editor = window.__measured!.editor
    return editor.hexOf(editor.fillOf(editor.one()!)!.color)
  })
  expect(fill).toBe('#ff0000')
})

test('library search places real symbols', async ({ page }) => {
  await page.goto('./')
  await page.getByTestId('tab-Libraries').click()
  await expect(page.getByTestId('catalog-count')).toContainText(/2\d{3} shapes/)
  const count = await page.getByTestId('symbol-item').count()
  expect(count).toBeLessThan(30)
  expect(count).toBeGreaterThan(0)
  await page.getByTestId('library-search').fill('door')
  await expect(page.getByTestId('symbol-item').first()).toContainText(/door/i)
  await page.getByTestId('symbol-item').first().click()
  await page.getByTestId('library-search').fill('sofa')
  await expect(page.getByTestId('symbol-item').first()).toContainText(/sofa/i)
  await page.getByTestId('symbol-item').first().click()
  const placed = await page.evaluate(() => {
    const editor = window.__measured!.editor
    return editor.doc.layers[0].children.map((node) => ({ name: node.name, symbol: node.symbolId, curves: node.commands.some((c) => c.c === 'C') }))
  })
  expect(placed).toHaveLength(2)
  expect(placed[0].name).toMatch(/door/i)
  expect(placed[1].name).toMatch(/sofa/i)
  expect(placed.every((node) => node.symbol)).toBe(true)
  await page.getByTestId('library-filter').selectOption('Floor Plans')
  await page.getByTestId('library-search').fill('')
  await expect(page.getByTestId('symbol-item').first()).toContainText('Floor Plans')
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

test('escape closes a dialog from inside it and cancels recolor (dialog-escape)', async ({ page }) => {
  await page.goto('./')
  await drawRect(page)
  const hex = () => page.evaluate(() => {
    const editor = window.__measured!.editor
    return editor.hexOf(editor.fillOf(editor.one()!)!.color)
  })
  const before = await hex()
  await page.getByTestId('section-styles').click()
  await page.getByTestId('recolor').click()
  await page.getByTestId('recolor-hue').fill('0.3')
  expect(await hex()).not.toBe(before)
  // Focus is on the slider inside the dialog; Escape must still close it and put the color back.
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('recolor-dialog')).toBeHidden()
  expect(await hex()).toBe(before)
  await page.getByTestId('export-open').click()
  await page.getByTestId('export-format').focus()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('export-dialog')).toBeHidden()
})

test('reload keeps every tab, custom libraries, and plugins (workspace-autosave)', async ({ page }) => {
  await page.goto('./')
  await drawRect(page)
  await page.getByTestId('new-doc').click()
  await page.getByTestId('new-name').fill('Second')
  await page.getByTestId('new-name').press('Enter')
  await page.getByTestId('new-create').click()
  await expect(page.getByTestId('doc-tab')).toHaveCount(2)
  await page.evaluate(() => {
    const editor = window.__measured!.editor
    editor.createLibrary('Kept')
    editor.savePlugin('Kept plugin', 'api.createRect(0, 0, 10, 10)')
  })
  await page.waitForTimeout(2600)
  await page.reload()
  await expect(page.getByTestId('doc-tab')).toHaveCount(2)
  const state = await page.evaluate(() => {
    const editor = window.__measured!.editor
    return { active: editor.doc.name, firstTabNodes: editor.docs[0].layers[0].children.length, libraries: editor.customLibraries.map((item) => item.name), plugins: editor.plugins.map((item) => item.name) }
  })
  expect(state).toEqual({ active: 'Second', firstTabNodes: 1, libraries: ['Kept'], plugins: ['Kept plugin'] })
})

test('closing a document with content asks first (close-confirm)', async ({ page }) => {
  await page.goto('./')
  await drawRect(page)
  await page.getByTestId('new-doc').click()
  await page.getByTestId('new-create').click()
  await page.getByTestId('doc-tab').first().click()
  page.once('dialog', (dialog) => void dialog.dismiss())
  await page.locator('.doc-tab-wrap .close').click()
  await expect(page.getByTestId('doc-tab')).toHaveCount(2)
  page.once('dialog', (dialog) => void dialog.accept())
  await page.locator('.doc-tab-wrap .close').click()
  await expect(page.getByTestId('doc-tab')).toHaveCount(1)
})

test('drawing on a locked layer explains itself (locked-layer-draw)', async ({ page }) => {
  await page.goto('./')
  await page.getByTestId('tab-Layers').click()
  await page.locator('[data-testid=layer] [aria-label="Lock layer"]').first().click()
  await drawRect(page)
  await expect(page.getByTestId('banner')).toContainText(/locked/i)
  const count = await page.evaluate(() => window.__measured!.editor.doc.layers[0].children.length)
  expect(count).toBe(0)
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

test('help is searchable and opens from ?, the context menu, and the empty-canvas hint (help-manual, help-search, context-menu-help, empty-hint)', async ({ page }) => {
  await page.goto('./')
  // Empty canvas shows a hint that links into Help.
  const hint = page.getByTestId('empty-hint')
  await expect(hint).toBeVisible()
  await hint.getByRole('button', { name: 'Open Help' }).click()
  const dialog = page.getByTestId('help-dialog')
  await expect(dialog).toBeVisible()
  await expect(page.getByTestId('help-body')).toContainText('Your first drawing')
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)

  // The ? button opens the guide; search narrows the topic list.
  await page.getByTestId('help-open').click()
  await expect(dialog).toBeVisible()
  await expect(page.getByTestId('help-topic-tool-pen')).toBeVisible()
  await expect(page.getByTestId('help-topic-props-canvas')).toBeVisible()
  await page.getByTestId('help-search').fill('dimension line')
  await expect(page.getByTestId('help-topic-tool-line')).toBeVisible()
  await expect(page.getByTestId('help-topic-tool-pen')).toHaveCount(0)
  await page.getByTestId('help-topic-options-line').click()
  await expect(page.getByTestId('help-body')).toContainText('engineering-style measured line')
  await page.getByTestId('help-search').fill('zzzz')
  await expect(page.getByTestId('help-list')).toContainText('No topics match')
  // Typing in the search box does not trigger tool shortcuts.
  await expect(page.getByTestId('active-tool')).toHaveText('Select')
  await expect(page.getByTestId('help-docs-link')).toHaveAttribute('href', 'help/')
  await page.keyboard.press('Escape')

  // Drawing hides the hint; the context menu has a Help entry.
  await drawRect(page)
  await expect(hint).toHaveCount(0)
  const box = (await page.getByTestId('canvas').boundingBox())!
  await page.mouse.click(box.x + 300, box.y + 300, { button: 'right' })
  await page.getByTestId('menu-help').click()
  await expect(dialog).toBeVisible()
  await expect(page.getByTestId('help-body')).toContainText('Right-click')
})

test('the docs page is published beside the app (help-docs-page)', async ({ page }) => {
  await page.goto('./help/')
  await expect(page).toHaveTitle(/User manual/)
  await expect(page.locator('#tool-pen')).toBeVisible()
  await page.locator('#q').fill('rounded')
  await expect(page.locator('#tool-roundRect')).toBeVisible()
  await expect(page.locator('#tool-pen')).toBeHidden()
  await expect(page.getByRole('link', { name: 'Back to the app' })).toHaveAttribute('href', '../')
})

test('tabs, layers, and objects rename inline without a prompt (inline-rename)', async ({ page }) => {
  await page.goto('./')
  // Document tab.
  const tab = page.getByTestId('doc-tab').first()
  await expect(tab).toHaveAttribute('title', 'Double-click to rename')
  await tab.dblclick()
  const tabInput = page.getByTestId('doc-tab-input')
  await expect(tabInput).toBeFocused()
  await tabInput.fill('Kitchen plan')
  await tabInput.press('Enter')
  await expect(page.getByTestId('doc-tab').first()).toHaveText('Kitchen plan')
  // Layer.
  await page.getByTestId('tab-Layers').click()
  await page.getByTestId('layer-name').first().dblclick()
  await page.getByTestId('layer-name-input').fill('Walls')
  await page.getByTestId('layer-name-input').press('Enter')
  await expect(page.getByTestId('layer-name').first()).toContainText('Walls')
  // Object: Escape cancels, blur commits.
  await drawRect(page)
  await page.getByTestId('object-name').first().dblclick()
  await page.getByTestId('object-name-input').fill('Discarded')
  await page.getByTestId('object-name-input').press('Escape')
  await expect(page.getByTestId('object-name').first()).not.toContainText('Discarded')
  await page.getByTestId('object-name').first().dblclick()
  await page.getByTestId('object-name-input').fill('Island')
  await page.getByTestId('object-name-input').press('Tab')
  await expect(page.getByTestId('object-name').first()).toContainText('Island')
  // Typing in the rename box does not switch tools.
  await expect(page.getByTestId('active-tool')).toHaveText('Rectangle')
})

test('library search explains an empty result and places symbols in view (library-empty, symbol-view-center)', async ({ page }) => {
  await page.goto('./')
  await page.getByTestId('tab-Libraries').click()
  await expect(page.getByTestId('catalog-count')).toContainText(/\d+ shapes/)
  await page.getByTestId('library-search').fill('qwxzv')
  await expect(page.getByTestId('library-empty')).toContainText('No shapes match')
  await page.getByTestId('library-search').fill('door')
  await expect(page.getByTestId('library-empty')).toHaveCount(0)
  await page.getByTestId('symbol-item').first().click()
  await page.getByTestId('symbol-item').first().click()
  const placed = await page.evaluate(() => {
    type Rect = { x: number; y: number; w: number; h: number }
    const ed = (window as unknown as { __measured: { editor: { doc: { layers: { children: { x: number; y: number }[] }[] }; viewCenter(): { x: number; y: number }; viewport: { width: number } | null; selectionRect(): Rect | null; view: { zoom: number } } } }).__measured.editor
    const nodes = ed.doc.layers[0].children
    const rect = ed.selectionRect()!
    return { count: nodes.length, dx: nodes[1].x - nodes[0].x, hasViewport: !!ed.viewport, center: ed.viewCenter(), second: { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 }, zoom: ed.view.zoom }
  })
  expect(placed.count).toBe(2)
  expect(placed.hasViewport).toBe(true)
  // The second copy sits one 12 px step from the first, which was centred on the view.
  const step = 12 / placed.zoom
  expect(placed.dx).toBeCloseTo(step, 3)
  expect(placed.second.x).toBeCloseTo(placed.center.x + step, 1)
  expect(placed.second.y).toBeCloseTo(placed.center.y + step, 1)
})

test('page unit and scale use unit menus, and changing the unit restates the scale (unit-menus, scale-presets)', async ({ page }) => {
  await page.goto('./')
  // Width and height are bare numbers; the unit sits in its own menu.
  await expect(page.getByTestId('canvas-width')).toHaveValue('11')
  await expect(page.getByTestId('base-unit')).toHaveValue('in')
  await expect(page.getByTestId('scale-preset')).toHaveValue('r1')
  // Typing a unit into the number box is refused with an explanation, and the box keeps the text for correction.
  await page.getByTestId('canvas-width').fill('30 cm')
  await page.getByTestId('canvas-width').press('Enter')
  await expect(page.getByTestId('canvas-width')).toHaveAttribute('aria-invalid', 'true')
  await expect(page.getByTestId('banner')).toContainText('unit is set by the menu')
  await page.getByTestId('canvas-width').press('Escape')
  await expect(page.getByTestId('canvas-width')).toHaveValue('11')
  // A preset sets the scale; the real-world unit menu offers imperial units.
  await page.getByTestId('scale-preset').selectOption('r48')
  await expect(page.getByTestId('scale-paper')).toHaveValue('1/4')
  await expect(page.getByTestId('scale-paper-unit')).toHaveValue('in')
  await expect(page.getByTestId('scale-real')).toHaveValue('1')
  await expect(page.getByTestId('scale-real-unit')).toHaveValue('ft')
  await expect(page.getByTestId('scale-real-unit').locator('option')).toHaveText(['in', 'ft', 'yd', 'mi'])
  await expect(page.getByTestId('scale-preset')).toHaveValue('r48')
  await expect(page.getByTestId('label-unit')).toHaveValue('ft-in')
  // Switching the page unit converts the page size and restates the scale in millimetres, keeping the ratio.
  await page.getByTestId('base-unit').selectOption('mm')
  await expect(page.getByTestId('canvas-width')).toHaveValue('279.4')
  await expect(page.getByTestId('scale-paper-unit')).toHaveValue('mm')
  await expect(page.getByTestId('scale-paper')).toHaveValue('1')
  await expect(page.getByTestId('scale-real')).toHaveValue('4.8')
  await expect(page.getByTestId('scale-real-unit')).toHaveValue('cm')
  await expect(page.getByTestId('scale-preset')).toHaveValue('custom')
  await expect(page.getByTestId('scale-readout')).toContainText('1 mm = 4.8 cm · 1:48')
  await expect(page.getByTestId('scale-real-unit').locator('option')).toHaveText(['mm', 'cm', 'm', 'km'])
  await expect(page.getByTestId('label-unit')).toHaveValue('cm')
  // Adjusting the number next to a unit menu keeps that unit.
  await page.getByTestId('scale-real').fill('5')
  await page.getByTestId('scale-real').press('Enter')
  await expect(page.getByTestId('scale-preset')).toHaveValue('r50')
  await expect(page.getByTestId('scale-preset').locator('option[value="r50"]')).toHaveText('1 mm = 5 cm  (1:50)')
  // Picking a real-world unit from the menu changes only the unit.
  await page.getByTestId('scale-real-unit').selectOption('m')
  await expect(page.getByTestId('scale-readout')).toContainText('1 mm = 5 m · 1:5000')
  // Changing the paper unit directly keeps the typed numbers.
  await page.getByTestId('scale-paper-unit').selectOption('cm')
  await expect(page.getByTestId('scale-preset')).toHaveValue('r500')
  await expect(page.getByTestId('scale-preset').locator('option[value="r500"]')).toHaveText('1 cm = 5 m  (1:500)')
})

test('align buttons explain themselves, banners fade, and the new-document dialog keeps its fields honest (align-disabled, banner-dismiss, new-doc-orientation)', async ({ page }) => {
  await page.goto('./')
  await page.getByTestId('section-align').click()
  await expect(page.getByTestId('align-hint')).toContainText('two or more')
  await expect(page.getByTestId('align-left')).toBeDisabled()
  await expect(page.getByTestId('distribute')).toBeDisabled()
  await drawRect(page)
  await expect(page.getByTestId('flip')).toBeEnabled()
  await expect(page.getByTestId('align-left')).toBeDisabled()
  // A second shape enables align; distribute still needs three.
  await page.getByTestId('tool-rect').click()
  const box = (await page.getByTestId('canvas').boundingBox())!
  await page.mouse.move(box.x + 400, box.y + 300)
  await page.mouse.down()
  await page.mouse.move(box.x + 480, box.y + 360, { steps: 4 })
  await page.mouse.up()
  await page.keyboard.press('v')
  await page.keyboard.press('Meta+a')
  await expect(page.getByTestId('align-left')).toBeEnabled()
  await expect(page.getByTestId('distribute')).toBeDisabled()
  await expect(page.getByTestId('align-hint')).toHaveCount(0)

  // A banner goes away on its own after a few seconds.
  await page.getByTestId('tab-Layers').click()
  await page.getByTestId('object-name').first().click()
  await page.getByTestId('clip').click()
  await expect(page.getByTestId('banner')).toContainText('Select the shape to mask')
  await expect(page.getByTestId('banner')).toHaveCount(0, { timeout: 9000 })

  // New document: orientation buttons swap the shown size; units are a menu; zero is refused.
  await page.getByTestId('new-doc').click()
  await expect(page.getByTestId('new-width')).toHaveValue('11')
  await page.getByTestId('new-portrait').click()
  await expect(page.getByTestId('new-width')).toHaveValue('8.5')
  await expect(page.getByTestId('new-height')).toHaveValue('11')
  await page.getByTestId('new-width').fill('0')
  await page.getByTestId('new-width').press('Enter')
  await expect(page.getByTestId('new-width')).toHaveAttribute('aria-invalid', 'true')
  await page.getByTestId('new-width').fill('5')
  await page.getByTestId('new-width').press('Enter')
  await expect(page.getByTestId('new-portrait')).toHaveAttribute('data-active', 'true')
  await page.getByTestId('new-create').click()
  await expect(page.getByTestId('canvas-width')).toHaveValue('5')
  await expect(page.getByTestId('canvas-height')).toHaveValue('11')
})
