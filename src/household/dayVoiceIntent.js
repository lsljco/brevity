// Deliberately narrow: never guess which task “it”, “that” or a partial name means.
export function exactDayCompletion(text,plan,member){
 const match=String(text||'').trim().match(/^(?:hey[, ]+brevity[, ]*|brevity[, :]+)?(?:please )?mark (.+?) (?:as )?(?:complete|completed|done)[.!]?$/i)
 if(!match)return null
 const key=value=>String(value||'').trim().replace(/[.!]+$/,'').replace(/\s+/g,' ').toLowerCase()
 const title=key(match[1]).replace(/^['“"]|['”"]$/g,'')
 if(['it','this','that','the task','this task','that task','everything','all tasks'].includes(title))return null
 const priorities=plan.topPriorities?.length?plan.topPriorities:plan.household?.priorities||[]
 const candidates=[...(plan.assignments||[]).map(x=>({...x,sourceKind:'assignment'})),...priorities.map(x=>({...x,sourceKind:'priority'}))].filter(x=>key(x.title)===title)
 if(candidates.length!==1)return null
 const item=candidates[0]
 if(!item.id||(item.date&&item.date!==plan.date)||['complete','completed','done','approved'].includes(item.status))return null
 if(item.owner!=='Family'&&item.owner!==member&&!item.participants?.includes(member))return null
 return item
}
