// A shared room uses a short conversational window, not response punctuation.
export function createMeetingFollowup({now=Date.now,duration=90000,addressedOnly=false}={}){
 let until=0
 return {
  invite(){until=now()+duration},
  reset(){until=0},
  accepts(text){
   const addressed=/\b(?:hey[, ]+brevity|brevity[, :])/i.test(text)
   const allowed=addressed||(!addressedOnly&&until>0&&now()<until)
   if(allowed)until=0
   return allowed
  }
 }
}
