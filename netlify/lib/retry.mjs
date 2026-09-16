const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))

export function isTransientIntegrationError(error){
  const status=Number(error?.status||error?.statusCode||0)
  if(status===408||status===409||status===425||status===429||status>=500)return true
  const message=String(error?.message||'').toLowerCase()
  return /timeout|timed out|temporar|rate limit|network|fetch failed|econn|socket|gateway|unavailable|reset/.test(message)
}

export async function withRetry(operation,{attempts=3,baseDelayMs=250,onRetry}={}){
  let lastError
  for(let attempt=1;attempt<=attempts;attempt+=1){
    try{return await operation(attempt)}catch(error){
      lastError=error
      if(attempt>=attempts||!isTransientIntegrationError(error))throw error
      onRetry?.({attempt,error})
      await sleep(baseDelayMs*Math.pow(2,attempt-1))
    }
  }
  throw lastError
}
