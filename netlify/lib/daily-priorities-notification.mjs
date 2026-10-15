import {buildDailyAgenda} from '../../src/household/dailyAgenda.js'
import {dailyGuidance} from '../../src/household/todayGuidance.js'
import {householdClock,minuteOfDay} from '../../src/household/dailyRhythm.js'

const clean=value=>String(value||'').replace(/\s+/g,' ').trim()
// Push previews are visible on a locked device. Never include amounts, account
// details, clinical titles, notes, or descriptions in this morning summary.
export function previewTitle(item){
 const text=clean(item.title)
 if(item.private||item.sensitive||/finance|health|medical|nutrition/i.test(item.pillar||'')||/[$€£]|\b(USD|CAD|balance|bank|account|payroll|income|tax|taxes|payment|bill|bills|debt|mortgage|insurance|medical|dental|doctor|therapy|diagnosis|medication|prescription|hospital|clinic|appointment)\b|\d{4,}/i.test(text))return 'Private priority — details in Brevity'
 return text.length>90?`${text.slice(0,87)}…`:text
}
export function dailyPrioritiesNotification(input,member,now=new Date()){
 const date=householdClock(now).date,plan=input.plan?.date===date?input.plan:{date}
 const agenda=buildDailyAgenda({plan,schedule:input.schedule,member,minute:householdClock(now).minute})
 const model=dailyGuidance({plan,agenda,member,minute:householdClock(now).minute})
 const priorities=model.priorities.filter(item=>item.title!==model.focus).slice(0,3)
 const lines=[]
 if(model.focus)lines.push(`Focus: ${previewTitle({title:model.focus})}`)
 for(const item of priorities){const time=item.startTime||item.time,owner=clean(item.owner||item.owners?.join(', '));lines.push(`• ${previewTitle(item)}${minuteOfDay(time)!==null?` · ${time}`:''}${owner?` · ${owner}`:''}`)}
 // Keep calendar titles private; only reveal that today's appointments exist.
 const appointments=(input.calendar||[]).filter(item=>!item.cancelled&&String(item.date||item.start||'').slice(0,10)===date&&(item.owner===member||item.owner==='Family'||item.owners?.includes(member)||item.participants?.includes(member)))
 if(appointments.length)lines.push(`${appointments.length} appointment${appointments.length===1?'':'s'} today — details in Brevity.`)
 const missing=!model.focus&&!priorities.length
 if(missing)lines.unshift(input.sources?.plan==='unavailable'?'Today’s priorities could not be loaded. Open Today to review.':'Let’s set today’s priorities.')
 lines.push('Open Brevity → Today')
 return {title:`Good morning, ${member}. Here’s your day.`,body:lines.join('\n'),url:'/?priorities=1#today-focus'}
}
