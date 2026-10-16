import {HOUSEHOLD_MEMBERS} from '../homehq/projectData.js'
import {nextDailyPlanDate} from './alignmentDate.js'
export const CHECKIN_URL='/?checkin=1#household-checkin'
export const CHECKIN_PILLARS=['Spiritual Maturity','Health & Nutrition','Physical Fitness','Household Management','Education','Finance & Stewardship','Ministry & Fellowship']
export const CHECKIN_STATES=['completed','in-progress','blocked','reschedule','not-started']
export const isThursday=date=>new Date(`${date}T12:00:00Z`).getUTCDay()===4
export const isFriday=date=>new Date(`${date}T12:00:00Z`).getUTCDay()===5
export function previousDate(date){const d=new Date(`${date}T12:00:00Z`);d.setUTCDate(d.getUTCDate()-1);return d.toISOString().slice(0,10)}
export function checkinDraft(source,saved){
 const prior=saved?.response||{}
 return {reports:source.items.map(item=>({id:item.id,state:prior.reports?.find(r=>r.id===item.id)?.state||'',note:prior.reports?.find(r=>r.id===item.id)?.note||''})),focus:prior.focus||'',priorities:[0,1,2].map(i=>({...{title:'',outcome:'',help:''},...prior.priorities?.[i]})),pillars:CHECKIN_PILLARS.map((_,i)=>prior.pillars?.[i]||''),weekend:{ideas:'',availability:'',cost:'',coordinator:'',...prior.weekend}}
}
const text=(value,max=2000)=>{if(typeof value!=='string'||value.length>max)throw Error('Check-in answers must be text within the displayed limits.');return value.trim()}
export function validateCheckin(input,source,submit=false){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['reports','focus','priorities','pillars','weekend'].includes(k)))throw Error('Invalid check-in response.')
 if(!Array.isArray(input.reports)||input.reports.length!==source.items.length)throw Error('Review every current commitment before submitting.')
 const ids=new Set(),reports=input.reports.map(row=>{
  if(!row||!source.items.some(i=>i.id===row.id)||ids.has(row.id))throw Error('Commitment references must match your current day.')
  ids.add(row.id)
  if(!CHECKIN_STATES.includes(row.state)&&!(row.state===''&&!submit))throw Error('Give every commitment a progress status.')
  const note=text(row.note)
  if(submit&&['blocked','reschedule'].includes(row.state)&&!note)throw Error('Explain the blocker or proposed new timing.')
  return {id:row.id,state:row.state,note}
 })
 const focus=text(input.focus)
 if(submit&&!focus)throw Error('Provide an update on today’s focus.')
 if(!Array.isArray(input.priorities)||input.priorities.length!==3)throw Error('Provide three priorities for tomorrow.')
 const priorities=input.priorities.map(p=>({title:text(p.title,200),outcome:text(p.outcome,1000),help:text(p.help,1000)}))
 if(submit&&priorities.some(p=>!p.title||!p.outcome))throw Error('Each of tomorrow’s three priorities needs a title and expected result.')
 if(submit&&new Set(priorities.map(p=>p.title.toLocaleLowerCase())).size!==3)throw Error('Choose three distinct priorities for tomorrow.')
 if(!Array.isArray(input.pillars)||input.pillars.length!==7)throw Error('Review the seven pillar update fields.')
 const pillars=input.pillars.map(p=>text(p)),weekend=Object.fromEntries(['ideas','availability','cost','coordinator'].map(key=>[key,text(input.weekend?.[key])]))
 if(submit&&isThursday(source.date)&&(!weekend.ideas||!weekend.availability))throw Error('Thursday requires weekend ideas and availability. You may explicitly say you have no suggestions or are unavailable.')
 return {reports,focus,priorities,pillars,weekend}
}
export function checkinStatus(record,sourceRevision,minute=0){
 if(record?.submittedAt&&record.sourceRevision===sourceRevision)return 'Submitted'
 if(record?.submittedAt)return 'Needs update'
 return record?.response?'Incomplete':minute>=960?'Missing · overdue':'Not submitted'
}
export function aggregateCheckins(records,date){
 const submitted=records.filter(r=>r?.submittedAt),priorities=submitted.flatMap(r=>r.response.priorities.map((p,i)=>({...p,id:`${r.member}:${i+1}`,member:r.member})))
 const groups=new Map()
 for(const p of priorities){const key=p.title.toLocaleLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^\p{L}\p{N}]+/gu,' ').trim();if(!groups.has(key))groups.set(key,{title:p.title,ids:[],contributors:[]});const group=groups.get(key);group.ids.push(p.id);group.contributors.push(p)}
 return {date,tomorrow:nextDailyPlanDate(date),priorities,groups:[...groups.values()],responses:submitted.map(({member,response,submittedAt,version,source})=>({member,response,submittedAt,version,source})),missing:HOUSEHOLD_MEMBERS.filter(member=>!submitted.some(r=>r.member===member)),notice:'Self-reported updates are not verified completion. Grouping suggests shared priorities, never merges source records or assigns a missing response to Larry. Plan changes require explicit Action Mode approval.'}
}
export function validateCheckinGroups(groups,priorities){
 if(!Array.isArray(groups)||groups.length>18)throw Error('Invalid reconciliation groups.')
 const seen=new Set()
 const result=groups.map(g=>{
  const title=text(g.title,240)
  if(!title||!Array.isArray(g.ids)||!g.ids.length)throw Error('Every group needs a title and source contributions.')
  const contributors=g.ids.map(id=>{const p=priorities.find(p=>p.id===id);if(!p||seen.has(id))throw Error('Reconciliation must preserve each contribution exactly once.');seen.add(id);return p})
  return {title,ids:[...g.ids],contributors}
 })
 if(seen.size!==priorities.length)throw Error('Reconciliation omitted a contribution.')
 return result
}
