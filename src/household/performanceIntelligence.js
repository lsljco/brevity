export const INTELLIGENCE_STORAGE_KEY='brevity_household_intelligence_v1'
export const DEFAULT_PILLARS=[
  {id:'spiritual',name:'Spiritual Maturity',icon:'ti-sun'},
  {id:'health',name:'Health & Nutrition',icon:'ti-heart'},
  {id:'fitness',name:'Physical Fitness',icon:'ti-run'},
  {id:'household',name:'Household Management',icon:'ti-home'},
  {id:'education',name:'Education',icon:'ti-book'},
  {id:'finance',name:'Finance & Stewardship',icon:'ti-building-bank'},
  {id:'ministry',name:'Ministry & Fellowship',icon:'ti-users'},
]
export const PERIOD_PRESETS=['today','week','month','quarter','custom']
const DAY=86400000
const clean=value=>String(value||'').trim()
const number=value=>Number.isFinite(Number(value))?Number(value):0
const dateKey=value=>{const date=value instanceof Date?value:new Date(value);return Number.isNaN(date.getTime())?'':`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`}
const parseDate=value=>{const match=clean(value).match(/^(\d{4})-(\d{2})-(\d{2})/);return match?new Date(Number(match[1]),Number(match[2])-1,Number(match[3]),12):null}
const endOfMonth=date=>new Date(date.getFullYear(),date.getMonth()+1,0,12)
const addDays=(date,days)=>new Date(date.getTime()+days*DAY)
const unique=values=>[...new Set(values.filter(Boolean))]
const clamp=value=>Math.max(0,Math.min(100,value))
const safeJson=(storage,key,fallback)=>{try{return JSON.parse(storage?.getItem?.(key)||'')||fallback}catch{return fallback}}
const minutesBetween=(start,end,fallback=60)=>{if(!start||!end)return fallback;const toMinutes=value=>{const match=String(value).match(/(\d{1,2}):(\d{2})/);return match?Number(match[1])*60+Number(match[2]):NaN};const a=toMinutes(start),b=toMinutes(end);return Number.isFinite(a)&&Number.isFinite(b)&&b>a?b-a:fallback}

export function resolveIntelligencePeriod(preset='week',{now=new Date(),from='',to=''}={}){
  const current=new Date(now.getFullYear(),now.getMonth(),now.getDate(),12)
  let start=current,end=current
  if(preset==='week'){const monday=(current.getDay()+6)%7;start=addDays(current,-monday);end=addDays(start,6)}
  if(preset==='month'){start=new Date(current.getFullYear(),current.getMonth(),1,12);end=endOfMonth(current)}
  if(preset==='quarter'){const month=Math.floor(current.getMonth()/3)*3;start=new Date(current.getFullYear(),month,1,12);end=new Date(current.getFullYear(),month+3,0,12)}
  if(preset==='custom'){start=parseDate(from)||current;end=parseDate(to)||start;if(end<start)[start,end]=[end,start]}
  const days=Math.round((end-start)/DAY)+1
  const previous={from:dateKey(addDays(start,-days)),to:dateKey(addDays(start,-1))}
  return{preset,from:dateKey(start),to:dateKey(end),days,previous,label:preset==='today'?'Today':preset==='week'?'This Week':preset==='month'?'This Month':preset==='quarter'?'Quarter':`${dateKey(start)} – ${dateKey(end)}`}
}

export function normalizeIntelligenceConfig(value={},members=[]){
  const pillars=(Array.isArray(value.pillars)&&value.pillars.length?value.pillars:DEFAULT_PILLARS).map((pillar,index)=>({id:clean(pillar.id)||`pillar-${index+1}`,name:clean(pillar.name)||`Pillar ${index+1}`,icon:clean(pillar.icon)||'ti-circle'}))
  const pillarIds=new Set(pillars.map(item=>item.id))
  const targets=(Array.isArray(value.targets)?value.targets:[]).filter(item=>members.includes(item.member)&&pillarIds.has(item.pillarId)).map((item,index)=>({id:clean(item.id)||`target-${index+1}`,member:item.member,pillarId:item.pillarId,label:clean(item.label)||'Pillar commitment',targetCount:Math.max(0,number(item.targetCount)),targetMinutes:Math.max(0,number(item.targetMinutes)),frequency:['daily','weekly','monthly','period'].includes(item.frequency)?item.frequency:'period',daysOfWeek:(item.daysOfWeek||[]).filter(day=>Number.isInteger(day)&&day>=0&&day<=6),weight:Math.max(.1,number(item.weight)||1),minimum:Math.max(0,number(item.minimum)),startsOn:clean(item.startsOn),endsOn:clean(item.endsOn),active:item.active!==false}))
  const rules=(Array.isArray(value.rules)?value.rules:[]).map((rule,index)=>({id:clean(rule.id)||`rule-${index+1}`,label:clean(rule.label)||'Classification rule',field:['title','location','calendar','organizer','description','member'].includes(rule.field)?rule.field:'title',match:['contains','starts','exactly'].includes(rule.match)?rule.match:'contains',value:clean(rule.value),member:members.includes(rule.member)?rule.member:'',allocations:normalizeAllocations(rule.allocations,pillarIds),active:rule.active!==false})).filter(rule=>rule.value&&rule.allocations.length)
  const overrides=value.overrides&&typeof value.overrides==='object'?Object.fromEntries(Object.entries(value.overrides).map(([id,allocations])=>[id,normalizeAllocations(allocations,pillarIds)])):{}
  const privacy=value.privacy&&typeof value.privacy==='object'?Object.fromEntries(members.map(member=>[member,{details:value.privacy?.[member]?.details!==false}])):Object.fromEntries(members.map(member=>[member,{details:true}]))
  return{schemaVersion:1,pillars,targets,rules,overrides,privacy,updatedAt:clean(value.updatedAt),updatedBy:clean(value.updatedBy)}
}

export function normalizeAllocations(value,pillarIds=new Set(DEFAULT_PILLARS.map(item=>item.id))){
  const rows=(Array.isArray(value)?value:[]).filter(item=>pillarIds.has(item?.pillarId)&&number(item?.percent)>0)
  const total=rows.reduce((sum,item)=>sum+number(item.percent),0)
  if(!total)return[]
  return rows.map(item=>({pillarId:item.pillarId,percent:number(item.percent)/total*100}))
}

const textFor=(event,field)=>clean(field==='calendar'?event.calendarName||event.source:field==='description'?event.description||event.notes:field==='member'?event.owner:event[field]).toLowerCase()
export function matchingClassificationRule(event,rules=[]){return rules.find(rule=>{if(rule.active===false||rule.member&&![event.owner,...(event.members||[]),...(event.participants||[])].includes(rule.member))return false;const source=textFor(event,rule.field),needle=rule.value.toLowerCase();return rule.match==='exactly'?source===needle:rule.match==='starts'?source.startsWith(needle):source.includes(needle)})||null}

const KEYWORDS={
  spiritual:['devotion','prayer','bible','sermon','worship','church','connect'],health:['meal','nutrition','doctor','medical','therapy','health'],fitness:['gym','workout','fitness','lifetime','walk','training'],household:['chore','clean','household','home','repair','maintenance','project'],education:['study','school','class','course','education','ksu','homework','learning'],finance:['finance','budget','bank','reconcile','cfo','tax','accounting'],ministry:['ministry','fellowship','discipleship','outreach','connect','church'],
}
export function heuristicClassification(event,pillars=DEFAULT_PILLARS){
  const haystack=[event.title,event.description,event.notes,event.location,event.calendarName].map(clean).join(' ').toLowerCase()
  const matches=pillars.map(pillar=>({pillarId:pillar.id,hits:(KEYWORDS[pillar.id]||[]).filter(term=>haystack.includes(term)).length})).filter(item=>item.hits).sort((a,b)=>b.hits-a.hits)
  if(!matches.length)return{allocations:[],confidence:'low',source:'unclassified'}
  const top=matches.slice(0,2),total=top.reduce((sum,item)=>sum+item.hits,0)
  return{allocations:top.map(item=>({pillarId:item.pillarId,percent:item.hits/total*100})),confidence:matches[0].hits>=2?'high':'medium',source:'heuristic'}
}

export function classifyActivity(event,config){
  const override=config.overrides?.[event.id]
  if(override?.length)return{allocations:override,confidence:'confirmed',source:'manual'}
  const rule=matchingClassificationRule(event,config.rules)
  if(rule)return{allocations:rule.allocations,confidence:'confirmed',source:'rule',ruleId:rule.id}
  const stored=normalizeAllocations(event.allocations||event.pillarAllocations,new Set(config.pillars.map(item=>item.id)))
  if(stored.length)return{allocations:stored,confidence:event.classificationConfidence||'high',source:'persisted'}
  if(event.pillar&&config.pillars.some(item=>item.id===event.pillar))return{allocations:[{pillarId:event.pillar,percent:100}],confidence:'high',source:'record'}
  return heuristicClassification(event,config.pillars)
}

const statusOf=record=>clean(record.status).toLowerCase()
const explicitCompleted=record=>Boolean(record.complete===true||record.completed===true||record.completedAt||record.approvedAt||['complete','completed','done','approved'].includes(statusOf(record)))
const planned=record=>record.planned!==false&&!['cancelled','canceled','deleted','deferred'].includes(statusOf(record))&&!record.cancelled&&!record.deleted
const membersFor=(record,members)=>unique([record.owner,...(record.owners||[]),...(record.members||[]),...(record.participants||[]),...(record.raci?.responsible||[])]).filter(member=>members.includes(member))
const temporalValue=value=>value&&typeof value==='object'?(value.dateTime||value.date||''):value
const activityDate=record=>clean(temporalValue(record.date||record.start||record.startDate||record.targetDate||record.due)).slice(0,10)
const calendarOccurred=(record,date,now)=>{
  if(explicitCompleted(record))return true
  if(record.complete===false||record.completed===false||['missed','skipped','incomplete','not completed'].includes(statusOf(record)))return false
  const today=dateKey(now)
  if(date<today)return true
  if(date>today||record.allDay)return false
  const endValue=temporalValue(record.end||record.endDate||record.endAt)
  const startValue=temporalValue(record.start||record.startDate||record.startAt)
  const end=endValue?new Date(endValue):null
  if(end&&!Number.isNaN(end.getTime()))return end.getTime()<=now.getTime()
  const start=startValue?new Date(startValue):null
  if(start&&!Number.isNaN(start.getTime()))return start.getTime()+Math.max(0,number(record.minutes)||60)*60000<=now.getTime()
  return false
}

export function normalizePerformanceActivities({calendarEvents=[],projects=[],schedule={},maintenance={},dailyPlans=[],members=[],config,now=new Date()}){
  const activities=[]
  const push=(record,kind,defaults={})=>{if(!record||!planned(record))return;const date=activityDate(record)||clean(defaults.date).slice(0,10);if(!date)return;const owners=membersFor(record,members);const classification=classifyActivity(record,config);const isExplicit=explicitCompleted(record),isCompleted=kind==='calendar'?calendarOccurred(record,date,now):isExplicit;activities.push({id:clean(record.id||record.sourceId||`${kind}-${activities.length}`),kind,title:clean(record.title||record.name)||kind,date,owners:owners.length?owners:['Family'],minutes:Math.max(0,number(record.minutes)||minutesBetween(record.startTime||record.time,record.endTime,defaults.minutes||60)),planned:true,completed:isCompleted,completionEvidence:isExplicit?'confirmed':isCompleted&&kind==='calendar'?'elapsed-calendar':'pending',private:Boolean(record.private||record.visibility==='private'),classification,source:clean(record.source)||kind,status:statusOf(record)})}
  calendarEvents.forEach(record=>push(record,'calendar',{minutes:record.allDay?0:60}))
  projects.forEach(record=>push(record,'project',{minutes:0}))
  ;(schedule.blocks||[]).forEach(record=>push(record,'schedule'))
  ;(schedule.routines||[]).forEach(routine=>{dailyPlans.forEach(plan=>{const date=parseDate(plan.date);if(date&&routine.enabled!==false&&(routine.days||[]).includes(date.getDay()))push({...routine,id:`${routine.id}:${plan.date}`,date:plan.date},'routine')})})
  Object.entries(maintenance.occurrences||{}).forEach(([id,record])=>push({...record,id,date:id.slice(0,10),title:record.title||'Household responsibility',pillar:'household'},'chore',{minutes:30}))
  dailyPlans.forEach(plan=>{(plan.assignments||[]).forEach(record=>push({...record,date:plan.date},'assignment',{minutes:30}));(plan.decisions||[]).forEach(record=>push({...record,date:plan.date},'decision',{minutes:15}))})
  return activities
}

const targetExpected=(target,period)=>{const start=parseDate(period.from),end=parseDate(period.to);if(!start||!end)return 0;let eligibleDays=0;for(let date=start;date<=end;date=addDays(date,1)){const key=dateKey(date);if(target.startsOn&&key<target.startsOn)continue;if(target.endsOn&&key>target.endsOn)continue;if(target.daysOfWeek.length&&!target.daysOfWeek.includes(date.getDay()))continue;eligibleDays+=1}const factor=target.frequency==='daily'?eligibleDays:target.frequency==='weekly'?Math.max(1,period.days/7):target.frequency==='monthly'?Math.max(1,period.days/30):1;return{count:target.targetCount*factor,minutes:target.targetMinutes*factor}}
const scoreFromParts=parts=>{const weighted=parts.filter(item=>item.expected>0);if(!weighted.length)return null;return clamp(weighted.reduce((sum,item)=>sum+Math.min(1,item.actual/item.expected)*item.weight,0)/weighted.reduce((sum,item)=>sum+item.weight,0)*100)}
const round=value=>value==null?null:Math.round(value)

export function calculatePerformance({activities=[],config,members=[],period,viewer='',isAdmin=false}){
  const inRange=activities.filter(item=>item.date>=period.from&&item.date<=period.to)
  const visible=item=>isAdmin||!item.private||item.owners.includes(viewer)
  const memberScores=members.map(member=>{
    const mine=inRange.filter(item=>item.owners.includes(member)||item.owners.includes('Family'))
    const pillars=config.pillars.map(pillar=>{
      const contributions=mine.flatMap(activity=>activity.classification.allocations.filter(item=>item.pillarId===pillar.id).map(allocation=>({...activity,allocatedMinutes:activity.minutes*allocation.percent/100,allocation:allocation.percent})))
      const targets=config.targets.filter(target=>target.active&&target.member===member&&target.pillarId===pillar.id)
      const targetParts=targets.flatMap(target=>{const expected=targetExpected(target,period);return[{label:target.label,unit:'activities',expected:expected.count,actual:contributions.filter(item=>item.completed).length,weight:target.weight},{label:target.label,unit:'minutes',expected:expected.minutes,actual:contributions.filter(item=>item.completed).reduce((sum,item)=>sum+item.allocatedMinutes,0),weight:target.weight}]}).filter(item=>item.expected>0)
      const qualifying=contributions.filter(item=>item.planned),done=qualifying.filter(item=>item.completed)
      const adherence=qualifying.length?done.length/qualifying.length*100:null
      const attainment=targets.length?scoreFromParts(targetParts):adherence
      return{...pillar,attainment:round(attainment),adherence:round(adherence),minutes:Math.round(contributions.reduce((sum,item)=>sum+item.allocatedMinutes,0)),targetConfigured:targets.length>0,targets:targetParts,activities:contributions.map(item=>visible(item)?item:{...item,title:'Private activity',source:'restricted'}),completed:done.length,planned:qualifying.length}
    })
    const measurable=pillars.filter(item=>item.attainment!=null)
    return{member,pillars,overall:measurable.length?round(measurable.reduce((sum,item)=>sum+item.attainment,0)/measurable.length):null,planAdherence:mine.length?round(mine.filter(item=>item.completed).length/mine.length*100):null,totalMinutes:pillars.reduce((sum,item)=>sum+item.minutes,0)}
  })
  const householdPillars=config.pillars.map(pillar=>{const eligible=memberScores.map(member=>member.pillars.find(item=>item.id===pillar.id)).filter(item=>item?.attainment!=null);return{...pillar,attainment:eligible.length?round(eligible.reduce((sum,item)=>sum+item.attainment,0)/eligible.length):null,eligibleMembers:eligible.length,minutes:memberScores.reduce((sum,member)=>sum+(member.pillars.find(item=>item.id===pillar.id)?.minutes||0),0)}})
  const overallEligible=memberScores.filter(item=>item.overall!=null)
  const totalMinutes=householdPillars.reduce((sum,item)=>sum+item.minutes,0)
  householdPillars.forEach(item=>{item.timeAllocation=totalMinutes?round(item.minutes/totalMinutes*100):null})
  return{period,memberScores,householdPillars,overall:overallEligible.length?round(overallEligible.reduce((sum,item)=>sum+item.overall,0)/overallEligible.length):null,planAdherence:inRange.length?round(inRange.filter(item=>item.completed).length/inRange.length*100):null,totalMinutes,unclassified:inRange.filter(item=>!item.classification.allocations.length),reviewQueue:inRange.filter(item=>['medium','low'].includes(item.classification.confidence)),activities:inRange}
}

const projectionStatus=value=>value==null?'No Data':value>=100?'Complete':value>=80?'On Track':value>=60?'At Risk':'Off Track'
export function projectPerformance(model,{today=dateKey(new Date())}={}){
  const memberScores=model.memberScores.map(member=>({...member,pillars:member.pillars.map(pillar=>{
    const remaining=pillar.activities.filter(activity=>activity.date>=today&&!activity.completed)
    let projected=null
    if(pillar.targetConfigured){
      const remainingCount=remaining.length,remainingMinutes=remaining.reduce((sum,item)=>sum+item.allocatedMinutes,0)
      projected=scoreFromParts(pillar.targets.map(part=>({...part,actual:part.actual+(part.unit==='minutes'?remainingMinutes:remainingCount)})))
    }else if(pillar.planned){
      projected=(pillar.completed+remaining.length)/pillar.planned*100
    }
    projected=round(projected)
    return{...pillar,projected,status:projectionStatus(projected)}
  })}))
  const householdPillars=model.householdPillars.map(pillar=>{
    const eligible=memberScores.map(member=>member.pillars.find(item=>item.id===pillar.id)).filter(item=>item?.projected!=null)
    const projected=eligible.length?round(eligible.reduce((sum,item)=>sum+item.projected,0)/eligible.length):null
    return{...pillar,projected,status:projectionStatus(projected)}
  })
  return{...model,memberScores,householdPillars}
}

export function intelligenceSummary(model){const scored=model.householdPillars.filter(item=>item.attainment!=null).sort((a,b)=>b.attainment-a.attainment);return{headline:model.overall==null?'Household alignment needs configured targets or completed plans.':`Household alignment is ${model.overall}% for ${model.period.label.toLowerCase()}.`,strengths:scored.filter(item=>item.attainment>=80).slice(0,2),attention:[...scored].reverse().filter(item=>item.attainment<80).slice(0,2),incomplete:model.reviewQueue.length,notice:model.activities.length?'Scores use classified Brevity records; calendar time is allocation evidence and is not assumed complete.':'No qualifying activity was found for this period.'}}

export function loadPerformanceSources(storage=window.localStorage){
  const calendar=safeJson(storage,'family_calendar_events_v1',[]),icloud=safeJson(storage,'brevity_icloud_calendar_cache_v1',{}),projects=safeJson(storage,'homehq_items_v1',[]),schedule=safeJson(storage,'brevity_household_schedule_v1',{}),maintenance=safeJson(storage,'brevity_household_maintenance_v1',{})
  return{calendarEvents:[...(Array.isArray(calendar)?calendar:[]),...((icloud&&Array.isArray(icloud.events))?icloud.events:[])],projects:Array.isArray(projects)?projects:[],schedule,maintenance,dailyPlans:[]}
}
