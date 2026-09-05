import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const css = readFileSync(new URL('./BrevityAssistant.css', import.meta.url), 'utf8')

test('keeps the mobile Ask Brevity launcher above the fixed navigation', () => {
  assert.match(css, /bottom:calc\(94px \+ env\(safe-area-inset-bottom\)\)/)
  assert.match(css, /z-index:1300/)
  assert.match(css, /\.brevity-assistant-launcher span\{display:inline\}/)
})

test('keeps the assistant drawer above mobile navigation and overlays', () => {
  assert.match(css, /\.brevity-assistant-backdrop\{[^}]*z-index:1590/)
  assert.match(css, /\.brevity-assistant-drawer\{[^}]*z-index:1600/)
})
