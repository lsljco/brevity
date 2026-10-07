// Reference: Jenkins–Seay Schedule A–D Household Operating Guide (August 4, 2026).
// Templates are references until explicitly reviewed into a dated plan.
export const DAILY_BLOCKS = [
 {id:'anchor',label:'Anchor Time',window:'4–8 AM',start:240,end:480},
 {id:'focus',label:'Focus Time',window:'8 AM–12 PM',start:480,end:720},
 {id:'flex',label:'Flex Time',window:'12–4 PM',start:720,end:960},
 {id:'winddown',label:'Wind Down',window:'4–8 PM',start:960,end:1200},
]
export const minuteOfDay = value => {
 const match=String(value||'').trim().match(/^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i)
 if(!match)return null
 let hour=Number(match[1]);const minute=Number(match[2]),period=match[3]?.toUpperCase()
 if(minute>59||hour>(period?12:23)||(period&&hour<1))return null
 if(period)hour=hour%12+(period==='PM'?12:0)
 return hour*60+minute
}
export const householdClock = (now=new Date()) => {
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now).map(p=>[p.type,p.value]))
 return {date:`${parts.year}-${parts.month}-${parts.day}`,minute:Number(parts.hour)*60+Number(parts.minute)}
}
export const isFinished = item => ['complete','completed','approved','cancelled','deferred','awaiting sign-off'].includes(String(item.status||'').toLowerCase())
export const namedFor = (item,member) => item.owner===member || item.owners?.includes(member) || item.participants?.includes(member)
export const blockFor = time => {const minute=minuteOfDay(time);return minute===null?null:DAILY_BLOCKS.find(block=>minute>=block.start&&minute<block.end)?.id||'rest'}
export function rhythmItems(plan,chores=[]){
 const assignments=(plan.assignments||[]).map(x=>({...x,source:'assignment',time:x.startTime||'',details:x.notes?[x.notes]:[]}))
 const timeline=(plan.dayparts||[]).flatMap(block=>(block.items||[]).map((x,i)=>({...x,id:`timeline-${block.id}-${i}`,source:'timeline',block:block.id,details:[]})))
 return [...assignments,...timeline,...chores.map(x=>({...x,id:x.occurrenceId,source:'chore',time:x.startTime||'',details:x.details||[],block:blockFor(x.startTime)||'flex'}))].map(x=>({...x,block:x.block||blockFor(x.time)||'flex'})).sort((a,b)=>(minuteOfDay(a.time)??1440)-(minuteOfDay(b.time)??1440))
}
export function scheduleAFor(member){
 if(!['Larry','Lorenzo','Terica','Nyla','Javin','Zion'].includes(member))return {group:'The original guide does not name this member. Agree their routine during Alignment.',items:[]}
 const early=['Larry','Lorenzo'].includes(member)
 const group=early?'Larry & Lorenzo':'Terica, Nyla, Javin & Zion (as listed in the original guide)'
 return {group,items:[
 ['04:00','04:10','Wake transition','Light stretch, prayer and mental preparation.','spiritual'],
 ['04:10',early?'04:36':'04:42','Morning preparation and fuel','Hygiene, tidy bed, clothes, bag check and planned fuel.','household'],
 [early?'04:36':'04:42','05:00',early?'Depart for Buckhead Life Time':'Depart for Johns Creek / Alpharetta Life Time','Confirm the location and departure during Alignment.','fitness'],
 ['05:00',early?'06:20':'06:15','Gym and recovery','Follow the dated workout in Physical Fitness.','fitness'],
 ['06:20','07:20','Shower, dress and hydrate','Ready for breakfast and the next block.','household'],
 ['07:20','07:50','Breakfast','Follow the dated meal plan.','health'],
 ['07:50','08:50','Household reset and workstation preparation','Complete assigned household contributions and prepare the workstation.','household'],
 ['09:00','','Household Management / Think Tank','Confirm the day’s focus, owners and deliverables.','education'],
 ].map(([startTime,endTime,title,notes,pillar])=>({startTime,endTime,title,notes,pillar,owner:member,source:`schedule-a:${member}:${startTime}`}))}
}
