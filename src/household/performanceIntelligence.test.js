import assert from 'node:assert/strict'
import test from 'node:test'
import { calculatePerformance,classifyActivity,DEFAULT_PILLARS,intelligenceSummary,matchingClassificationRule,normalizeIntelligenceConfig,normalizePerformanceActivities,projectPerformance,resolveIntelligencePeriod } from './performanceIntelligence.js'
import { applyHouseholdRecordOperation,householdResourceKeyForAction } from './householdActionModel.js'
import { handler as classifyHandler } from '../../netlify/functions/calendar-pillar-classify.mjs'

const members=['A','B']
const config=overrides=>normalizeIntelligenceConfig({pillars:DEFAULT_PILLARS,targets:[],rules:[],overrides:{},privacy:{},...overrides},members)
const week=resolveIntelligencePeriod('custom',{from:'2026-09-07',to:'2026-09-13'})

test('periods use inclusive local date boundaries and a comparable prior period',()=>{
  assert.deepEqual(week,{preset:'custom',from:'2026-09-07',to:'2026-09-13',days:7,previous:{from:'2026-08-31',to:'2026-09-06'},label:'2026-09-07 – 2026-09-13'})
  assert.equal(resolveIntelligencePeriod('quarter',{now:new Date(2026,8,15)}).from,'2026-07-01')
})

test('current periods follow the household date instead of the browser time zone',()=>{
  const period=resolveIntelligencePeriod('today',{now:new Date('2026-09-21T01:00:00.000Z')})
  assert.equal(period.from,'2026-09-20')
  assert.equal(period.to,'2026-09-20')
})

test('multi-pillar time allocation never doubles event duration',()=>{
  const cfg=config({overrides:{meeting:[{pillarId:'finance',percent:70},{pillarId:'household',percent:30}]}})
  const activities=normalizePerformanceActivities({calendarEvents:[{id:'meeting',title:'Family meeting',date:'2026-09-08',time:'09:00',endTime:'10:00',owner:'A'}],members,config:cfg})
  const model=calculatePerformance({activities,config:cfg,members,period:week,viewer:'A'})
  assert.equal(model.totalMinutes,60)
  assert.equal(model.householdPillars.find(item=>item.id==='finance').minutes,42)
  assert.equal(model.householdPillars.find(item=>item.id==='household').minutes,18)
})

test('attainment uses member-specific targets and household averages eligible members equally',()=>{
  const cfg=config({targets:[{id:'a',member:'A',pillarId:'fitness',label:'Workouts',targetCount:2,frequency:'period',weight:1,active:true},{id:'b',member:'B',pillarId:'fitness',label:'Workouts',targetCount:4,frequency:'period',weight:1,active:true}]})
  const calendarEvents=[...Array(2)].map((_,i)=>({id:`a${i}`,title:'Gym workout',date:`2026-09-0${8+i}`,owner:'A',completed:true})).concat([...Array(2)].map((_,i)=>({id:`b${i}`,title:'Gym workout',date:`2026-09-${10+i}`,owner:'B',completed:true})))
  const activities=normalizePerformanceActivities({calendarEvents,members,config:cfg})
  const model=calculatePerformance({activities,config:cfg,members,period:week,viewer:'A'})
  assert.equal(model.memberScores[0].pillars.find(item=>item.id==='fitness').attainment,100)
  assert.equal(model.memberScores[1].pillars.find(item=>item.id==='fitness').attainment,50)
  assert.equal(model.householdPillars.find(item=>item.id==='fitness').attainment,75)
})

test('plan adherence stays separate from attainment and excludes cancelled work',()=>{
  const cfg=config()
  const activities=normalizePerformanceActivities({calendarEvents:[{id:'done',title:'Study',date:'2026-09-08',owner:'A',completed:true},{id:'open',title:'Study',date:'2026-09-09',owner:'A'},{id:'cancelled',title:'Study',date:'2026-09-10',owner:'A',status:'cancelled'}],members,config:cfg,now:new Date('2026-09-08T12:00:00')})
  const model=calculatePerformance({activities,config:cfg,members,period:week,viewer:'A'})
  assert.equal(model.planAdherence,50)
  assert.equal(model.activities.length,2)
})

test('elapsed calendar occurrences calculate as performed while future and explicitly missed events do not',()=>{
  const cfg=config(),activities=normalizePerformanceActivities({calendarEvents:[
    {id:'past',title:'Gym workout',start:{dateTime:'2026-09-08T09:00:00'},end:{dateTime:'2026-09-08T10:00:00'},owner:'A'},
    {id:'future',title:'Gym workout',startDate:'2026-09-12T09:00:00',endDate:'2026-09-12T10:00:00',owner:'A'},
    {id:'missed',title:'Gym workout',date:'2026-09-07',owner:'A',status:'missed'},
  ],members,config:cfg,now:new Date('2026-09-10T12:00:00')})
  const model=calculatePerformance({activities,config:cfg,members,period:week,viewer:'A'})
  const fitness=model.memberScores[0].pillars.find(item=>item.id==='fitness')
  assert.equal(activities.find(item=>item.id==='past').completionEvidence,'elapsed-calendar')
  assert.equal(fitness.completed,1)
  assert.equal(fitness.planned,3)
  assert.equal(fitness.attainment,33)
})

test('a planned household-day calendar record is not completed by a browser time-zone rollover',()=>{
  const cfg=config(),activities=normalizePerformanceActivities({
    calendarEvents:[{id:'planned',title:'Finance review',date:'2026-09-20',owner:'A',pillar:'finance'}],
    members,
    config:cfg,
    now:new Date('2026-09-21T01:00:00.000Z'),
  })
  assert.equal(activities[0].completed,false)
  assert.equal(activities[0].completionEvidence,'pending')
})

test('missing targets and activities remain No Data rather than zero',()=>{
  const cfg=config(),model=calculatePerformance({activities:[],config:cfg,members,period:week,viewer:'A'})
  assert.equal(model.overall,null)
  assert.equal(model.planAdherence,null)
  assert.ok(model.householdPillars.every(item=>item.attainment===null))
})

test('strengths never labels a currently failing pillar as strong because its projection may recover',()=>{
  const summary=intelligenceSummary({overall:0,period:week,householdPillars:[{id:'education',attainment:0,projected:100},{id:'finance',attainment:90,projected:100}],reviewQueue:[],activities:[{}]})
  assert.deepEqual(summary.strengths.map(item=>item.id),['finance'])
  assert.deepEqual(summary.attention.map(item=>item.id),['education'])
})

test('confirmed rules beat heuristic classification and manual overrides beat rules',()=>{
  const cfg=config({rules:[{id:'rule',label:'Gym rule',field:'title',match:'contains',value:'Lifetime',allocations:[{pillarId:'fitness',percent:100}],active:true}],overrides:{event:[{pillarId:'health',percent:100}]}})
  assert.equal(matchingClassificationRule({title:'Lifetime Perimeter'},cfg.rules).id,'rule')
  assert.equal(classifyActivity({id:'other',title:'Lifetime Perimeter'},cfg).source,'rule')
  assert.equal(classifyActivity({id:'event',title:'Lifetime Perimeter'},cfg).allocations[0].pillarId,'health')
})

test('multi-pillar allocations are normalized to exactly one hundred percent',()=>{
  const cfg=config({overrides:{event:[{pillarId:'finance',percent:7},{pillarId:'household',percent:3}]}})
  assert.deepEqual(classifyActivity({id:'event',title:'Meeting'},cfg).allocations,[{pillarId:'finance',percent:70},{pillarId:'household',percent:30}])
})

test('private records contribute numerically without revealing details to another member',()=>{
  const cfg=config({privacy:{A:{details:false},B:{details:true}}})
  const activities=normalizePerformanceActivities({calendarEvents:[{id:'private',title:'Private medical appointment',date:'2026-09-08',owner:'A',private:true,pillar:'health',completed:true}],members,config:cfg})
  const model=calculatePerformance({activities,config:cfg,members,period:week,viewer:'B',isAdmin:false})
  const health=model.memberScores[0].pillars.find(item=>item.id==='health')
  assert.equal(health.activities[0].title,'Private activity')
  assert.equal(health.attainment,100)
})

test('recurring routines materialize only on matching days and retain owner boundaries',()=>{
  const cfg=config(),activities=normalizePerformanceActivities({schedule:{routines:[{id:'routine',title:'Study',owner:'A',days:[1,3],startTime:'09:00',endTime:'10:00',pillar:'education',enabled:true}]},dailyPlans:[{date:'2026-09-07'},{date:'2026-09-08'},{date:'2026-09-09'}],members,config:cfg})
  assert.deepEqual(activities.map(item=>item.date),['2026-09-07','2026-09-09'])
  assert.ok(activities.every(item=>item.owners[0]==='A'))
})

test('projection uses remaining target evidence, is status-labeled, and remains bounded',()=>{
  const cfg=config({targets:[{id:'study',member:'A',pillarId:'education',label:'Study sessions',targetCount:2,frequency:'period',active:true}]}),activities=normalizePerformanceActivities({calendarEvents:[{id:'one',title:'Study',date:'2026-09-09',owner:'A',completed:true},{id:'two',title:'Study',date:'2026-09-12',owner:'A'}],members,config:cfg}),model=projectPerformance(calculatePerformance({activities,config:cfg,members,period:week,viewer:'A'}),{today:'2026-09-10'})
  const education=model.householdPillars.find(item=>item.id==='education')
  assert.equal(education.projected,100)
  assert.equal(education.status,'Complete')
  assert.equal(model.memberScores[0].pillars.find(item=>item.id==='education').projected,100)
})

test('configuration rejects unknown members and keeps pillar definitions configurable',()=>{
  const cfg=normalizeIntelligenceConfig({pillars:[{id:'custom',name:'Custom Priority'}],targets:[{member:'Unknown',pillarId:'custom',targetCount:3}],privacy:{}},members)
  assert.deepEqual(cfg.pillars.map(item=>item.id),['custom'])
  assert.equal(cfg.targets.length,0)
})

test('intelligence configuration uses one audited shared Action Mode resource',()=>{
  const candidate=config({targets:[{id:'t',member:'A',pillarId:'education',label:'Study',targetCount:3,frequency:'weekly',active:true}]})
  const result=applyHouseholdRecordOperation({}, {type:'household.intelligence.config.update',payload:{configJson:JSON.stringify(candidate)}},{actor:'Larry',now:()=>new Date('2026-09-15T12:00:00Z')})
  assert.equal(householdResourceKeyForAction('household.intelligence.config.update'),'brevity_household_intelligence_v1')
  assert.equal(result.after.updatedBy,'Larry')
  assert.equal(result.after.targets.length,0,'unknown commercial test members cannot enter the Jenkins household record')
})

test('AI calendar classifier requires household authentication and never writes a record',async()=>{
  const response=await classifyHandler({httpMethod:'POST',headers:{},body:JSON.stringify({events:[{id:'1',title:'Gym'}],pillars:DEFAULT_PILLARS})})
  assert.equal(response.statusCode,401)
  assert.match(response.body,/Sign in/)
})
