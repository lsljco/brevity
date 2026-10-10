import test from 'node:test'
import assert from 'node:assert/strict'
import { startIncludedBankSync } from './includedBankSync.js'

test('included syncing is throttled, visible, online, single-flight and cleaned up', async () => {
  const target = new EventTarget(), documentTarget = new EventTarget()
  documentTarget.visibilityState = 'visible'
  let time = 0, connected = true, tick, calls = 0, finish, cleared = false
  const stop = startIncludedBankSync(() => { calls++; return new Promise(resolve => { finish = resolve }) }, {
    target, documentTarget, now:()=>time, online:()=>connected,
    interval:(fn,ms)=>{ assert.equal(ms,900000); tick=fn; return 1 }, clear:()=>{cleared=true},
  })
  target.dispatchEvent(new Event('focus'))
  assert.equal(calls,0)
  time=900000; documentTarget.visibilityState='hidden'; await tick()
  assert.equal(calls,0)
  documentTarget.visibilityState='visible'; connected=false; await tick()
  assert.equal(calls,0)
  connected=true; target.dispatchEvent(new Event('online'))
  assert.equal(calls,1)
  time+=900000; await tick(); assert.equal(calls,1)
  finish(); await Promise.resolve(); await Promise.resolve()
  target.dispatchEvent(new Event('focus')); assert.equal(calls,2)
  finish(); stop(); time+=900000; await tick()
  assert.equal(calls,2); assert.equal(cleared,true)
})
