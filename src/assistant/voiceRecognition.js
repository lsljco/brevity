// Retired recognizers must not deliver late callbacks into a newer conversation.
export function retireRecognition(ref, {setTimer=setTimeout,clearTimer=clearTimeout,delay=1000}={}) {
 const recognition=ref.current
 ref.current=null
 if(!recognition)return
 recognition.cancelWatch?.()
 recognition.onstart=null;recognition.onaudiostart=null;recognition.onaudioend=null;recognition.onresult=null;recognition.onend=null;recognition.onerror=null
 // Native capture can outlive abort(). Detach transcript callbacks immediately,
 // but keep an end-only handoff so a replacement does not race native teardown.
 return new Promise(resolve=>{
  let settled=false,timer
  const released=()=>{
   if(settled)return
   settled=true;clearTimer(timer);recognition.onend=null;resolve()
  }
  recognition.onend=released
  timer=setTimer(released,delay)
  try{recognition.abort()}catch{released()}
 })
}

// A service can start without capturing audio, or stop returning results without
// delivering end/error. Bound both states; never leave a zombie recognizer active.
export function watchRecognition({recognition,ref,onStall,setTimer=setTimeout,clearTimer=clearTimeout}) {
 let timer,closed=false
 const arm=(delay=20000)=>{
  clearTimer(timer)
  if(closed)return
  timer=setTimer(()=>{if(!closed&&ref.current===recognition)onStall()},delay)
 }
 recognition.cancelWatch=()=>{closed=true;clearTimer(timer)}
 arm(4000)
 return arm
}

// Some mobile implementations do not emit `end` promptly after stop(). The
// watchdog bounds that wait, while finish() guarantees exactly one submission.
export function finishRecognition({recognition,ref,onFinish,setTimer=setTimeout,clearTimer=clearTimeout,delay=400}) {
 let settled=false,timer
 const finish=()=>{
  if(settled)return
  settled=true;clearTimer(timer)
  if(ref.current===recognition)retireRecognition(ref)
  onFinish()
 }
 timer=setTimer(finish,delay)
 recognition.onend=finish
 try{recognition.stop()}catch{finish()}
 return()=>{settled=true;clearTimer(timer)}
}
