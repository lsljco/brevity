export function startProgress({startedAt=Date.now(),now=Date.now,tickMs=1000}={},onTick=()=>{},onAnnounce=()=>{}){
  let elapsed=-1,announcement=''
  const tick=()=>{
    const seconds=Math.max(0,Math.floor((now()-startedAt)/1000))
    if(seconds!==elapsed){elapsed=seconds;onTick(seconds)}
    const next=seconds>=15?'Still working on your request':'Working on your request'
    if(next!==announcement){announcement=next;onAnnounce(next)}
  }
  tick()
  const interval=setInterval(tick,tickMs)
  return {stop:()=>clearInterval(interval)}
}
