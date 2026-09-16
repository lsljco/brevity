export async function fetchSystemHealth(){
  const response=await fetch('/.netlify/functions/system-health',{headers:{accept:'application/json'},credentials:'include',cache:'no-store'})
  const payload=await response.json().catch(()=>({}))
  if(!response.ok){const error=new Error(payload.error||`System health returned ${response.status}.`);error.status=response.status;throw error}
  return payload
}

export function systemHealthIssues(health){
  if(!health?.checks)return[]
  return Object.entries(health.checks)
    .filter(([,check])=>check?.state!=='ready')
    .map(([key,check])=>({id:`system-${key}`,source:{ai:'Brevity AI',calendar:'Family Calendar',dailyPlan:'Daily Plan Automation',finance:'Finance & Plaid',oneDrive:'OneDrive Publishing'}[key]||key,message:check.detail||'This integration needs attention.',action:'Brevity will continue using verified data where possible. Review the integration if this condition persists.'}))
}
