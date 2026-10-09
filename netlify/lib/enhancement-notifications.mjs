export function enhancementNotificationRecipients(row,event){
 if(event.kind==='created')return ['Larry','Terica'].filter(member=>member!==event.actor)
 if(!['comment','status'].includes(event.kind))return []
 return [...new Set([row.createdBy,...row.supporters,...row.comments.map(comment=>comment.actor)])].filter(member=>member!==event.actor)
}
export async function dispatchEnhancementNotifications({rows,devices,store,root,keys,deliver,now=new Date()}){
 let sent=0
 for(const row of rows)for(const event of row.history){
  if(now-Date.parse(event.at)>7*86400000)continue
  const recipients=enhancementNotificationRecipients(row,event)
  for(const device of devices.filter(device=>recipients.includes(device.member))){
   const key=`${root}enhancements-sent/${device.id}/${event.id}`
   const entry=await store.getWithMetadata(key,{type:'json'})
   if(entry?.data?.sentAt||entry?.data?.attemptedAt&&now-Date.parse(entry.data.attemptedAt)<120000)continue
   const lock=await store.setJSON(key,{attemptedAt:now.toISOString()},entry?.etag?{onlyIfMatch:entry.etag}:{onlyIfNew:true})
   if(lock?.modified===false)continue
   try{
    await deliver(device.subscription,{title:'Brevity · Enhancements',body:event.kind==='created'?'A household member shared a new idea.':event.kind==='status'?'An enhancement you follow has a status update.':'An enhancement you follow has a new comment.',url:'/?enhancements=1',tag:`enhancement-${row.id}`,remaining:15},keys)
    await store.setJSON(key,{sentAt:now.toISOString()});sent++
   }catch{/* Retry after the short lease; the in-app update remains available. */}
  }
 }
 return {sent}
}
