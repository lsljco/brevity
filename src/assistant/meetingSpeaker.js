// Use the same Web Audio graph for the speaker and the archived meeting. This
// avoids a second, independently blocked HTMLMediaElement autoplay path on iOS.
export function createMeetingSpeaker({context,recordingDestination,loadSpeech,onState,onError,onInterrupted=()=>{},resumeTimeout=3000}) {
 let generation=0,controller=null,source=null,buffer=null,request=null,disposed=false
 const current=id=>!disposed&&id===generation
 const releaseSource=()=>{if(source){source.onended=null;try{source.stop()}catch{}source.disconnect();source=null}}
 const unlock=()=>{
  // Call resume synchronously in the Start/Retry tap, before any network await.
  const resume=context.resume()
  return new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(Error('Speaker is paused by the browser. Tap Retry speaker.')),resumeTimeout)
   Promise.resolve(resume).then(()=>{clearTimeout(timer);context.state==='running'?resolve():reject(Error('Speaker is paused by the browser. Tap Retry speaker.'))},error=>{clearTimeout(timer);reject(error)})
  })
 }
 const fail=(id,error)=>{if(!current(id))return;releaseSource();onInterrupted();onState('blocked');onError(error?.name==='NotAllowedError'?'Tap Retry speaker to enable Brevity’s voice.':error?.message||'Speech could not play. Tap Retry speaker.')}
 const begin=id=>{
  if(!current(id))return
  if(context.state!=='running')throw Error('Speaker is paused by the browser. Tap Retry speaker.')
  const node=context.createBufferSource();source=node;node.buffer=buffer
  node.connect(context.destination);node.connect(recordingDestination)
  node.onended=()=>{if(!current(id)||source!==node)return;source=null;node.disconnect();buffer=null;const done=request?.onComplete;request=null;onState('idle');done?.()}
  node.start();onError('');onState('speaking')
 }
 const prepare=async id=>{
  controller=new AbortController();onState('loading')
  const blob=await loadSpeech(request.text,controller.signal)
  const bytes=await blob.arrayBuffer();if(!current(id))return
  const decoded=await context.decodeAudioData(bytes);if(!current(id))return
  buffer=decoded;begin(id)
 }
 const stop=()=>{generation++;controller?.abort();controller=null;releaseSource();buffer=null;request=null;onState('idle')}
 const play=async(text,onComplete)=>{stop();const id=generation;request={text,onComplete};onError('');try{await prepare(id)}catch(error){fail(id,error)}}
 const retry=async()=>{
  if(!request||disposed)return
  const id=++generation;controller?.abort();releaseSource();onInterrupted();onState('loading')
  try{await unlock();if(!current(id))return;if(buffer)begin(id);else await prepare(id)}catch(error){fail(id,error)}
 }
 const stateChanged=()=>{if(source&&context.state!=='running')fail(generation,Error('Speaker was interrupted. Tap Retry speaker to replay the response.'))}
 context.addEventListener('statechange',stateChanged)
 return {unlock,play,retry,stop,dispose(){stop();disposed=true;context.removeEventListener('statechange',stateChanged)}}
}
