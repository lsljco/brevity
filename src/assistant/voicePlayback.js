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
