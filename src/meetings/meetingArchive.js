const endpoint='/.netlify/functions/meeting-recordings'
let database
const db=()=>database ||= new Promise((resolve,reject)=>{
  const request=indexedDB.open('brevity-meeting-archive',1)
  request.onupgradeneeded=()=>{request.result.createObjectStore('records',{keyPath:'key'});request.result.createObjectStore('chunks',{keyPath:'key'})}
  request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)
})
async function transaction(store,mode,run){const database=await db();return new Promise((resolve,reject)=>{const tx=database.transaction(store,mode),request=run(tx.objectStore(store));tx.oncomplete=()=>resolve(request.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)})}
const key=(member,id)=>`${member}/${id}`
export const saveMeetingLocal=record=>transaction('records','readwrite',store=>store.put({...record,key:key(record.member,record.id)}))
export const listLocalMeetings=async member=>(await transaction('records','readonly',store=>store.getAll())).filter(row=>row.member===member)
export const saveMeetingChunk=(record,index,blob)=>transaction('chunks','readwrite',store=>store.put({key:`${key(record.member,record.id)}/${index}`,member:record.member,id:record.id,index,blob,synced:false}))
export const localMeetingChunks=async record=>(await transaction('chunks','readonly',store=>store.getAll(IDBKeyRange.bound(`${key(record.member,record.id)}/`,`${key(record.member,record.id)}/\uffff`)))).sort((a,b)=>a.index-b.index)
async function request(url,options={}){const response=await fetch(url,{credentials:'include',cache:'no-store',...options});if(!response.ok){const data=await response.json().catch(()=>({}));throw Error(data.error||'Meeting backup is unavailable. The device copy is retained.')}return response}
export async function syncMeeting(record){
  for(const chunk of await localMeetingChunks(record)){
    if(chunk.synced)continue
    await request(`${endpoint}?member=${encodeURIComponent(record.member)}&id=${record.id}&chunk=${chunk.index}`,{method:'POST',headers:{'content-type':chunk.blob.type||record.mime||'audio/webm'},body:chunk.blob})
    await transaction('chunks','readwrite',store=>store.put({...chunk,synced:true}))
  }
  const {key:ignored,...metadata}=record
  await request(`${endpoint}?member=${encodeURIComponent(record.member)}&id=${record.id}`,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(metadata)})
}
export async function listMeetings(member){
  const local=await listLocalMeetings(member),rows=new Map(local.map(row=>[row.id,row]))
  let cursor='',error=''
  try{do{const payload=await (await request(`${endpoint}?${new URLSearchParams({cursor,member})}`)).json();for(const row of payload.meetings||[]){const existing=rows.get(row.id);if(!existing||row.updatedAt>existing.updatedAt)rows.set(row.id,{...row,member})}cursor=payload.cursor||''}while(cursor)}catch(cause){error=cause.message}
  return {meetings:[...rows.values()].sort((a,b)=>b.startedAt.localeCompare(a.startedAt)),error}
}
export async function meetingAudio(record){
  let chunks=await localMeetingChunks(record)
  if(chunks.length<(record.chunkCount||0)){
    const result=await (await request(`${endpoint}?member=${encodeURIComponent(record.member)}&id=${record.id}`)).json()
    const local=new Map(chunks.map(row=>[row.index,row]))
    for(const index of result.chunks||[]){if(local.has(index))continue;const blob=await (await request(`${endpoint}?member=${encodeURIComponent(record.member)}&id=${record.id}&chunk=${index}`)).blob();local.set(index,{index,blob})}
    chunks=[...local.values()].sort((a,b)=>a.index-b.index)
  }
  if(!chunks.length)throw Error('This meeting has a transcript but no saved audio.')
  if(chunks.some((row,index)=>row.index!==index))throw Error('An audio portion is unavailable. Retry backup from the device that recorded this meeting.')
  return new Blob(chunks.map(row=>row.blob),{type:record.mime||chunks[0].blob.type||'audio/webm'})
}
