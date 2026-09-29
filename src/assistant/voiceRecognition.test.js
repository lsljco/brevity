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
