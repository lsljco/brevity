import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const css = fs.readFileSync(new URL('../BottomDock.css', import.meta.url), 'utf8')

test('desktop and tablet reserve a real viewport lane for Ask Brevity', () => {
  assert.match(css, /height:calc\(100dvh - var\(--brevity-command-dock-height\)\)!important/)
  assert.match(css, /@media\(min-width:641px\) and \(max-width:900px\)/)
  const tablet = css.slice(css.indexOf('@media(min-width:641px) and (max-width:900px)'), css.indexOf('/* Phone:'))
  assert.match(tablet, /\.brevity-assistant-launcher\{[\s\S]*?bottom:0!important/)
  assert.doesNotMatch(tablet, /bottom:calc\(64px/)
})

test('phone layout reserves both the command lane and the mobile navigation lane', () => {
  const phone = css.slice(css.indexOf('@media(max-width:640px)'))
  assert.match(phone, /var\(--brevity-mobile-nav-reserve\)/)
  assert.match(phone, /bottom:calc\(var\(--brevity-mobile-nav-reserve\) \+ env\(safe-area-inset-bottom\)\)!important/)
})

test('the lower command lane is rendered as a dedicated panel', () => {
  assert.match(css, /\.app-shell::after\{/)
  assert.match(css, /height:var\(--brevity-command-dock-height\)/)
  assert.match(css, /pointer-events:none/)
})

test('every global refresh state stays in the command lane instead of covering page content', () => {
  assert.match(css, /\.app-main \.app-refresh-status\{[\s\S]*?position:fixed!important;[\s\S]*?bottom:0!important;/)
  assert.match(css, /right:var\(--brevity-command-dock-assistant-width\)!important/)
})
