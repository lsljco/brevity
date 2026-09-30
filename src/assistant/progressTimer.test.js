import test from 'node:test'
import assert from 'node:assert/strict'
import {startProgress} from './progressTimer.js'
test('elapsed time survives hidden time; announcements only change at threshold; stop cleans up',t=>{
  t.mock.timers.enable({apis:['setInterval']})
  let clock=1000
  const ticks=[],announcements=[]
  const timer=startProgress({startedAt:clock,now:()=>clock},value=>ticks.push(value),value=>announcements.push(value))
  try{
    assert.deepEqual(ticks,[0])
    clock+=14000;t.mock.timers.tick(1000)
    assert.deepEqual(ticks,[0,14])
    assert.equal(announcements.length,1)
    clock+=1000;t.mock.timers.tick(1000)
    assert.equal(announcements[1],'Still working on your request')
    clock+=1000;t.mock.timers.tick(1000)
    assert.equal(announcements.length,2)
  }finally{timer.stop()}
  const count=ticks.length;clock+=9000;t.mock.timers.tick(9000)
  assert.equal(ticks.length,count)
  const reopened=startProgress({startedAt:1000,now:()=>clock},value=>ticks.push(value),value=>announcements.push(value))
  assert.equal(ticks.at(-1),25);assert.equal(announcements.at(-1),'Still working on your request')
  reopened.stop()
})
