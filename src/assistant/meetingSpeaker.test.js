import test from 'node:test'
import assert from 'node:assert/strict'
import {createMeetingSpeaker} from './meetingSpeaker.js'
function setup(overrides={}){
 const states=[],errors=[],sources=[],listeners=new Map();let heard=0,interrupted=0,loads=0
 const context={state:'running',destination:{id:'speaker'},resume(){this.state='running';return Promise.resolve()},decodeAudioData:async()=>({audio:true}),addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name),createBufferSource(){const node={targets:[],connect(target){this.targets.push(target)},disconnect(){},start(){},stop(){}};sources.push(node);return node},...overrides}
 const recordingDestination={id:'recording'}
 const speaker=createMeetingSpeaker({context,recordingDestination,loadSpeech:async()=>{loads++;return new Blob(['audio'])},onState:s=>states.push(s),onError:e=>errors.push(e),onInterrupted:()=>interrupted++,resumeTimeout:5})
 return {speaker,context,states,errors,sources,listeners,recordingDestination,complete:()=>heard++,get heard(){return heard},get interrupted(){return interrupted},get loads(){return loads}}
}
test('speech is routed to both room and recording and completes only on natural end',async()=>{
 const f=setup();await f.speaker.play('Briefing',f.complete)
 assert.deepEqual(f.sources[0].targets,[f.context.destination,f.recordingDestination]);assert.equal(f.states.at(-1),'speaking');assert.equal(f.heard,0)
 f.sources[0].onended();assert.equal(f.heard,1);assert.equal(f.states.at(-1),'idle')
})
test('blocked audio never reports speaking; retry replays decoded audio without another request',async()=>{
 const f=setup({state:'suspended'});await f.speaker.play('Review',f.complete)
 assert.equal(f.states.at(-1),'blocked');assert.equal(f.states.includes('speaking'),false);assert.equal(f.heard,0)
 await f.speaker.retry();assert.equal(f.loads,1);assert.equal(f.states.at(-1),'speaking');assert.equal(f.errors.at(-1),'')
 f.sources.at(-1).onended();assert.equal(f.heard,1)
})
test('interrupted review cannot complete and retry starts a new source',async()=>{
 const f=setup();await f.speaker.play('Review',f.complete);const staleEnd=f.sources[0].onended
 f.context.state='interrupted';f.listeners.get('statechange')();assert.equal(f.states.at(-1),'blocked');assert.equal(f.interrupted,1)
 staleEnd();assert.equal(f.heard,0);await f.speaker.retry();assert.equal(f.sources.length,2);assert.equal(f.heard,0)
 f.sources[1].onended();assert.equal(f.heard,1)
})
test('stop prevents stale completion and retrying cancelled speech',async()=>{
 const f=setup();await f.speaker.play('Review',f.complete);const staleEnd=f.sources[0].onended
 f.speaker.stop();staleEnd();await f.speaker.retry();assert.equal(f.heard,0);assert.equal(f.sources.length,1)
})
test('late decode after cancellation cannot start speech',async()=>{
 let finish;const f=setup({decodeAudioData:()=>new Promise(resolve=>{finish=resolve})})
 const pending=f.speaker.play('Old review',f.complete);while(!finish)await new Promise(resolve=>setTimeout(resolve,0))
 f.speaker.stop();finish({});await pending;assert.equal(f.sources.length,0);assert.equal(f.heard,0)
})
test('decode failure is recoverable and does not count as heard',async()=>{
 const f=setup({decodeAudioData:async()=>{throw Error('Invalid speech audio')}});await f.speaker.play('Review',f.complete)
 assert.equal(f.states.at(-1),'blocked');assert.equal(f.errors.at(-1),'Invalid speech audio');assert.equal(f.heard,0)
 f.context.decodeAudioData=async()=>({});await f.speaker.retry();assert.equal(f.loads,2);assert.equal(f.states.at(-1),'speaking')
})
test('unlock calls resume immediately and times out a hung browser',async()=>{
 let called=false;const f=setup({resume:()=>{called=true;return new Promise(()=>{})}})
 const result=f.speaker.unlock();assert.equal(called,true);await assert.rejects(result,/Retry speaker/)
})
test('dispose removes listeners and ignores stale events',async()=>{
 const f=setup();await f.speaker.play('Review',f.complete);const stale=f.sources[0].onended
 f.speaker.dispose();stale();assert.equal(f.heard,0);assert.equal(f.listeners.size,0)
})
