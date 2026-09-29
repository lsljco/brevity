// A background invocation should claim its queued record promptly. Invalidate an
// abandoned queue entry with CAS so a late/retried worker cannot execute it.
export async function readBackgroundJob(store,key,{now=Date.now(),startupTimeoutMs=90000}={}) {
  const entry=await store.getWithMetadata(key,{type:'json'})
  const job=entry?.data
  if(!job||job.state!=='queued'||now-Date.parse(job.createdAt)<=startupTimeoutMs)return job
  const failed={...job,state:'failed',statusCode:503,error:'The background service did not start. Please retry.',result:{error:'The background service did not start. Please retry.'}}
  delete failed.body
  const write=await store.setJSON(key,failed,{onlyIfMatch:entry.etag})
  // A worker may have claimed it while we were reading. Never overwrite that claim.
  if(write?.modified===false)return (await store.getWithMetadata(key,{type:'json'}))?.data
  return failed
}
