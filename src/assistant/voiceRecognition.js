// Retired recognizers must not deliver late callbacks into a newer conversation.
export function retireRecognition(ref) {
 const recognition=ref.current
 ref.current=null
 if(!recognition)return
 recognition.onstart=null;recognition.onresult=null;recognition.onend=null;recognition.onerror=null
 try{recognition.abort()}catch{}
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
