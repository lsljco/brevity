export function retryableProviderFailure(error){
 const message=String(error?.message||'')
 if(/insufficient_quota|quota|billing|credits/i.test(message))return null
 if(error?.status===429||/\b429\b.*rate limit|rate limit.*\b429\b/i.test(message))return 'rate_limit'
 if([500,502,503,504].includes(error?.status))return 'provider'
 return null
}
export async function runWithProviderRecovery(run,{sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),onRetry=()=>{}}={}){
 for(let attempt=0;;attempt++){
  try{return await run()}catch(error){
   const reason=retryableProviderFailure(error)
   if(!reason||attempt>=2)throw error
   onRetry(reason)
   await sleep(reason==='rate_limit'?15000*(attempt+1):2000*(attempt+1))
  }
 }
}
