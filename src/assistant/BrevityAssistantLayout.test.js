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
  const backdrop=Number(css.match(/\.brevity-assistant-backdrop\{[^}]*z-index:(\d+)/)?.[1])
  const drawer=Number(css.match(/\.brevity-assistant-drawer\{[^}]*z-index:(\d+)/)?.[1])
  const responsive=readFileSync(new URL('../ResponsiveHardening.css', import.meta.url), 'utf8')
  const finance=Number(responsive.match(/\.finance-insight-edit-overlay\s*\{\s*z-index:\s*(\d+)/)?.[1])
  assert.ok(backdrop>finance)
  assert.ok(drawer>backdrop)
})
