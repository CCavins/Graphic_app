import { expect, test } from '@playwright/test'

const sizes = [
  { name: 'desktop-1440', width: 1440, height: 900, toolbar: 'side' },
  { name: 'desktop-1280', width: 1280, height: 800, toolbar: 'side' },
  { name: 'ipad-portrait', width: 1024, height: 1366, toolbar: 'side' },
  { name: 'ipad-landscape', width: 1366, height: 1024, toolbar: 'side' },
  { name: 'iphone-portrait', width: 390, height: 844, toolbar: 'bottom' },
  { name: 'iphone-landscape', width: 844, height: 390, toolbar: 'bottom' },
] as const

for (const size of sizes) {
  test(`layout ${size.name}`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height })
    await page.goto('./')
    const toolbar = await page.getByTestId('toolbar').boundingBox()
    const canvas = await page.getByTestId('canvas').boundingBox()
    const inspector = await page.getByTestId('inspector').boundingBox()
    expect(toolbar).toBeTruthy()
    expect(canvas).toBeTruthy()
    expect(inspector).toBeTruthy()
    if (!toolbar || !canvas || !inspector) return
    expect(canvas.width).toBeGreaterThan(100)
    expect(canvas.height).toBeGreaterThan(80)
    if (size.toolbar === 'side') {
      expect(toolbar.x).toBeLessThan(40)
      expect(toolbar.height).toBeGreaterThan(200)
      expect(inspector.x).toBeGreaterThan(size.width / 2)
    } else {
      expect(toolbar.y).toBeGreaterThan(size.height * 0.55)
      expect(toolbar.width).toBeGreaterThan(size.width * 0.8)
    }
  })
}
