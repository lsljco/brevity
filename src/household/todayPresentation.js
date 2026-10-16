import {namedFor} from './dailyRhythm.js'
const list=value=>Array.isArray(value)?value:[]
export const isPersonalItem=(item,member)=>namedFor(item,member)||item.members?.includes(member)||((!item.owner||['Family','Everyone'].includes(item.owner))&&!list(item.owners).some(x=>!['Family','Everyone'].includes(x))&&!list(item.participants).length&&!list(item.members).length&&(item.owner==='Family'||item.owner==='Everyone'||item.owners?.includes('Everyone')))
// Exact display grouping only. Every underlying ID and per-person status is retained.
export function groupTodayItems(items){
 const groups=new Map()
 for(const item of items){
  const signature=JSON.stringify([item.sourceKind,item.title?.trim(),item.date||item.sourceDate||'',item.startTime||item.time||'',item.endTime||'',item.pillar||''])
  const existing=groups.get(signature)
  if(!existing){groups.set(signature,{...item,sourceRecords:[item],displayOwners:[...new Set([item.owner,...list(item.owners),...list(item.participants)].filter(Boolean))]});continue}
  existing.sourceRecords.push(item)
  existing.displayOwners=[...new Set([...existing.displayOwners,item.owner,...list(item.owners),...list(item.participants)].filter(Boolean))]
 }
 return [...groups.values()]
}
export function focusBubbles(focus,priorities){
 if(!focus)return groupTodayItems(priorities)
 let remaining=focus
 const titles=[]
 // Existing exact titles supply boundaries for older focus strings saved without separators.
 for(const item of groupTodayItems(priorities))if(item.title&&remaining.includes(item.title)){remaining=remaining.replace(item.title,'\n');titles.push(item.title)}
 titles.push(...remaining.split(/\n|\s*\/\s*|;|•/).map(x=>x.replace(/^\s*\d+[.)]\s*/, '').trim()).filter(Boolean))
 return [...new Set(titles)].map((title,index)=>({id:`focus-${index}`,sourceKind:'focus',title}))
}
export const isMajorCalendarItem=item=>item.important===true||item.priority===true||['high','critical'].includes(String(item.priority).toLowerCase())||item.pillar==='health'||/\b(doctor|appointment|dentist|dental|medical|surgery|interview|flight|graduation|court|specialist|checkup|check-up)\b/i.test(item.title||'')
