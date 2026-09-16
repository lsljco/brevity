import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const main=readFileSync(new URL('../main.jsx',import.meta.url),'utf8')
const responsive=readFileSync(new URL('../DeviceResponsive.css',import.meta.url),'utf8')
const mobile=readFileSync(new URL('../MobileShell.css',import.meta.url),'utf8')

test('device responsive foundation loads after the feature and command-dock styles',()=>{
  assert.ok(main.indexOf("import './DeviceResponsive.css'")>main.indexOf("import './BottomDock.css'"))
})

test('phone, tablet, short-landscape and touch hardware each receive an explicit layout tier',()=>{
  assert.match(responsive,/@media \(max-width: 640px\)/)
  assert.match(responsive,/@media \(min-width: 641px\) and \(max-width: 1180px\)/)
  assert.match(responsive,/@media \(max-width: 900px\) and \(max-height: 600px\) and \(orientation: landscape\)/)
  assert.match(responsive,/@media \(pointer: coarse\)/)
  assert.match(mobile,/@media \(min-width: 641px\) and \(max-width: 1180px\)/)
})

test('mobile safeguards prevent browser zoom, clipped dialogs and unsafe fixed controls',()=>{
  assert.match(responsive,/font-size: 16px !important/)
  assert.match(responsive,/safe-area-inset-left/)
  assert.match(responsive,/safe-area-inset-right/)
  assert.match(responsive,/max-height: calc\(100dvh/)
  assert.match(responsive,/min-height: 44px/)
  assert.match(responsive,/overflow-x: auto/)
})

test('reduced-motion users do not receive long transitions or animations',()=>{
  assert.match(responsive,/@media \(prefers-reduced-motion: reduce\)/)
  assert.match(responsive,/transition-duration: \.01ms !important/)
})
