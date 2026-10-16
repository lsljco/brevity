import test from 'node:test'
import assert from 'node:assert/strict'
import {releaseAudio,watchPlayback} from './voicePlayback.js'
test('release detaches completion before pause and unloads the native resource',()=>{
 const calls=[];let heard=0
 const audio={onended:()=>heard++,pause(){this.onended?.();calls.push('pause')},removeAttribute(name){calls.push(name)},load(){calls.push('load')}}
 releaseAudio(audio);assert.equal(heard,0);assert.deepEqual(calls,['pause','src','load']);assert.equal(audio.onended,null)
})
test('playback watchdog permits long progressing speech but bounds a missing end event',()=>{
 let tick,stalls=0
 const audio={currentTime:0}
 watchPlayback({audio,onStall:()=>stalls++,setTimer:fn=>{tick=fn},clearTimer(){}})
 for(let i=1;i<=20;i++){audio.currentTime=i*15;tick()}
 assert.equal(stalls,0);tick();tick();assert.equal(stalls,1)
})
test('cancelled playback watchdog cannot interrupt a newer turn or a deliberate pause',()=>{
 let tick,stalls=0
 const cancel=watchPlayback({audio:{currentTime:0},onStall:()=>stalls++,setTimer:fn=>{tick=fn},clearTimer(){}})
 cancel();tick();assert.equal(stalls,0)
})
