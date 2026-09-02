import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const projectFile = (relativePath) => fileURLToPath(new URL(`../../${relativePath}`, import.meta.url))

async function pngDimensions(relativePath) {
  const image = await readFile(projectFile(relativePath))
  assert.equal(image.subarray(1, 4).toString(), 'PNG')
  return {
    width: image.readUInt32BE(16),
    height: image.readUInt32BE(20),
  }
}

test('publishes installable Brevity web-app metadata', async () => {
  const html = await readFile(projectFile('index.html'), 'utf8')
  const manifest = JSON.parse(await readFile(projectFile('public/manifest.webmanifest'), 'utf8'))
  const headers = await readFile(projectFile('public/_headers'), 'utf8')

  assert.match(html, /rel="manifest" href="\/manifest\.webmanifest"/)
  assert.match(html, /rel="apple-touch-icon" sizes="180x180" href="\/icons\/apple-touch-icon-180x180\.png"/)
  assert.match(html, /rel="apple-touch-icon" sizes="167x167" href="\/icons\/apple-touch-icon-167x167\.png"/)
  assert.match(html, /rel="apple-touch-icon" sizes="152x152" href="\/icons\/apple-touch-icon-152x152\.png"/)
  assert.match(html, /name="apple-mobile-web-app-title" content="Brevity"/)
  assert.equal(manifest.name, 'Brevity of Life')
  assert.equal(manifest.short_name, 'Brevity')
  assert.equal(manifest.display, 'standalone')
  assert.equal(manifest.start_url, '/')
  assert.equal(manifest.scope, '/')
  assert.ok(manifest.icons.some((icon) => icon.sizes === '192x192' && icon.purpose === 'any'))
  assert.ok(manifest.icons.some((icon) => icon.sizes === '512x512' && icon.purpose === 'any'))
  assert.ok(manifest.icons.some((icon) => icon.sizes === '1024x1024' && icon.purpose === 'any'))
  assert.ok(manifest.icons.some((icon) => icon.sizes === '192x192' && icon.purpose === 'maskable'))
  assert.ok(manifest.icons.some((icon) => icon.sizes === '512x512' && icon.purpose === 'maskable'))
  assert.match(headers, /\/manifest\.webmanifest[\s\S]*?Content-Type: application\/manifest\+json; charset=utf-8/)
})

test('ships correctly sized app icons', async () => {
  const expectedSizes = new Map([
    ['public/icons/favicon-16x16.png', 16],
    ['public/icons/favicon-32x32.png', 32],
    ['public/icons/apple-touch-icon-152x152.png', 152],
    ['public/icons/apple-touch-icon-167x167.png', 167],
    ['public/icons/apple-touch-icon-180x180.png', 180],
    ['public/icons/icon-192x192.png', 192],
    ['public/icons/icon-512x512.png', 512],
    ['public/icons/icon-1024x1024.png', 1024],
    ['public/icons/icon-maskable-192x192.png', 192],
    ['public/icons/icon-maskable-512x512.png', 512],
  ])

  for (const [relativePath, expectedSize] of expectedSizes) {
    const dimensions = await pngDimensions(relativePath)
    assert.deepEqual(dimensions, { width: expectedSize, height: expectedSize })
  }
})
