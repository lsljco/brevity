// A short silent PCM WAV starts the SAME media element inside the user's tap.
// Subsequent speech replaces its source; some browser policies still require a
// direct Play response tap, handled by the caller without another TTS request.
const SILENCE='data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQIAAAAAAA=='
export function primeAudio(ref){
  const audio=ref.current||new Audio()
  ref.current=audio
  if(audio.src)return
  audio.src=SILENCE
  try{Promise.resolve(audio.play()).catch(()=>{})}catch{}
}

// Keep the unlocked element, but release its native audio resource before capture.
export function releaseAudio(audio){
  if(!audio)return
  audio.onended=null;audio.onerror=null
  audio.pause()
  audio.removeAttribute?.('src');audio.load?.()
}

// Native playback can stall without firing ended/error (including a suspended
// mobile audio session). Progress, not total response length, bounds that wait.
// A watchdog failure must NEVER count as a completed spoken approval review.
export function watchPlayback({audio,onStall,setTimer=setTimeout,clearTimer=clearTimeout,delay=15000}){
  let closed=false,timer,last=Number(audio.currentTime)||0
  const check=()=>{
    if(closed)return
    const position=Number(audio.currentTime)||0
    if(position<=last){closed=true;onStall();return}
    last=position;timer=setTimer(check,delay)
  }
  timer=setTimer(check,delay)
  return()=>{closed=true;clearTimer(timer)}
}
