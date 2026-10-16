import test from 'node:test'
import assert from 'node:assert/strict'
import {retireRecognition,finishRecognition} from './voiceRecognition.js'
test('retirement detaches old callbacks before a synchronous aborted event',()=>{
 let callbacks=0
 const recognition={onend:()=>callbacks++,abort(){this.onend?.()}}
 const ref={current:recognition};retireRecognition(ref)
 assert.equal(callbacks,0);assert.equal(ref.current,null)
})
test('missing mobile end event is bounded and late end cannot submit twice',()=>{
 let callback,submissions=0,aborted=0
 const recognition={stop(){},abort(){aborted++}},ref={current:recognition}
 finishRecognition({recognition,ref,onFinish:()=>submissions++,setTimer:fn=>{callback=fn;return 1},clearTimer(){}})
 const lateEnd=recognition.onend
 callback();lateEnd()
 assert.equal(submissions,1);assert.equal(aborted,1);assert.equal(ref.current,null)
})
test('normal end cancels fallback and stop cancellation prevents submission',()=>{
 let callback,submissions=0
 const recognition={stop(){},abort(){}},ref={current:recognition}
 const cancel=finishRecognition({recognition,ref,onFinish:()=>submissions++,setTimer:fn=>{callback=fn;return 1},clearTimer(){}})
 cancel();callback();recognition.onend()
 assert.equal(submissions,0)
})

test('startup and missing-result watchdogs are bounded and retirement cancels recovery',async()=>{
 const {watchRecognition}=await import('./voiceRecognition.js')
 let callback,delay,stalls=0,cleared=0
 const recognition={abort(){}},ref={current:recognition}
 const pulse=watchRecognition({recognition,ref,onStall:()=>stalls++,setTimer:(fn,ms)=>{callback=fn;delay=ms;return 1},clearTimer:()=>cleared++})
 assert.equal(delay,4000);callback();assert.equal(stalls,1)
 pulse();assert.equal(delay,20000)
 const stale=callback
 retireRecognition(ref);stale();assert.equal(stalls,1);assert.ok(cleared>0)
})

test('replacement waits for asynchronous native release and ignores late transcript',async()=>{
 let finish,callbacks=0,released=false
 const recognition={onresult:()=>callbacks++,abort(){finish=this.onend}}
 const ref={current:recognition}
 const pending=retireRecognition(ref).then(()=>{released=true})
 await Promise.resolve()
 assert.equal(released,false);assert.equal(ref.current,null)
 recognition.onresult?.();assert.equal(callbacks,0)
 finish();await pending;assert.equal(released,true)
 finish();assert.equal(recognition.onend,null)
})
test('native release is bounded when abort never emits end',async()=>{
 let timeout,released=false
 const ref={current:{abort(){}}}
 const pending=retireRecognition(ref,{setTimer:fn=>{timeout=fn;return 1},clearTimer(){}}).then(()=>{released=true})
 await Promise.resolve();assert.equal(released,false)
 timeout();await pending;assert.equal(released,true)
})

test('four consecutive turns track delayed native teardown before allowing a replacement',async()=>{
 for(let turn=0;turn<4;turn++){
  let fallback,end,release,submitted=0
  const recognition={stop(){},abort(){end=this.onend}},ref={current:recognition}
  finishRecognition({recognition,ref,onFinish:()=>submitted++,onRelease:promise=>{release=promise},setTimer:fn=>{fallback=fn;return 1},clearTimer(){}})
  fallback()
  assert.equal(submitted,1);assert.ok(release)
  let ready=false;release.then(()=>{ready=true});await Promise.resolve();assert.equal(ready,false)
  end();await release;assert.equal(ready,true)
  end();assert.equal(submitted,1)
 }
})
test('a normal native end releases capture without aborting a finished recognizer',()=>{
 let submissions=0,aborts=0
 const recognition={stop(){this.onend()},abort(){aborts++}},ref={current:recognition}
 finishRecognition({recognition,ref,onFinish:()=>submissions++})
 assert.equal(submissions,1);assert.equal(aborts,0);assert.equal(ref.current,null)
})

test('established capture disarms the startup watchdog while a person thinks',async()=>{
 const {watchRecognition}=await import('./voiceRecognition.js')
 const pending=new Map();let id=0,stalls=0
 const recognition={},ref={current:recognition}
 const pulse=watchRecognition({recognition,ref,onStall:()=>stalls++,setTimer:fn=>{pending.set(++id,fn);return id},clearTimer:id=>pending.delete(id)})
 assert.equal(pending.size,1);pulse(null);assert.equal(pending.size,0)
 pulse(1000);assert.equal(pending.size,1);[...pending.values()][0]();assert.equal(stalls,1)
})
