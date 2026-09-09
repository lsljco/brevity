import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { defaultActionPermissions, normalizeActionProposal, permissionForOperation } from '../../netlify/lib/assistant-action-contract.mjs'
import { createAssistantActionRepository } from '../../netlify/lib/assistant-action-repository.mjs'
import { executeActionWithJournal, prepareDirectProposal, undoActionWithJournal } from '../../netlify/functions/brevity-assistant-actions.mjs'
import { dailyPlanDraftKey, generateDailyPlanDraft, saveGeneratedDailyPlanDraft } from '../../netlify/lib/household-plan-generator.mjs'
import { createEmptyDailyPlan } from './dailyPlan.js'
import { buildAlignmentOperations, buildPlanDraftOperations } from './dailyPlanActionReview.js'
import { clearLocalAlignmentDraft, clearLocalRecapDraft, loadLocalAlignmentDraft, loadLocalRecapDraft, saveLocalAlignmentDraft, saveLocalRecapDraft } from './dailyPlanLocalDraft.js'
import { fetchScheduledDailyPlanDraft } from './dailyPlanGeneratorApi.js'

const read = relative => readFileSync(new URL(relative, import.meta.url), 'utf8')

function versionedBlobStore() {
  const values = new Map()
  let sequence = 0
  const clone = value => value == null ? value : structuredClone(value)
  return {
    values,
    async get(key) { return clone(values.get(key)?.data ?? null) },
    async getWithMetadata(key) { const entry=values.get(key); return entry ? { data:clone(entry.data), etag:entry.etag } : null },
    async setJSON(key, value, options = {}) {
      const current=values.get(key)
      if (options.onlyIfNew && current) return { modified:false, etag:current.etag }
      if (options.onlyIfMatch && current?.etag !== options.onlyIfMatch) return { modified:false, etag:current?.etag || null }
      const etag=`etag-${++sequence}`
      values.set(key, { data:clone(value), etag })
      return { modified:true, etag }
    },
  }
}

function planResources(date, initial = null) {
  let value=initial ? structuredClone(initial) : createEmptyDailyPlan(date)
  let version=Number(initial?.version || 0)
  let lastActionId=''
  return {
    snapshot:()=>({ value:structuredClone(value), version }),
    async read(resource) { assert.equal(resource, `plan:${date}`); return { value:structuredClone(value), version } },
    async write(resource, next, expectedVersion, _actor, mutationId) {
      assert.equal(resource, `plan:${date}`)
      if (expectedVersion !== version) throw Object.assign(new Error('version conflict'), { code:'VERSION_CONFLICT' })
      version+=1; value={ ...structuredClone(next), date, version, lastActionId:mutationId }; lastActionId=mutationId
      return { value:structuredClone(value), version }
    },
  }
}

test('Morning Alignment produces granular reviewed operations and never exceeds one plan transaction', () => {
  const date='2026-09-07',original={...createEmptyDailyPlan(date),version:4}
  const draft=structuredClone(original)
  draft.spiritual.devotionFocus='Guard the heart before the day accelerates.'
  draft.health.snacks='Greek yogurt'
  draft.finance.decisionRule='No funding source means not approved.'
  const operations=buildAlignmentOperations(original,draft,{completedAt:'2026-09-07T10:00:00.000Z'})
  assert.deepEqual(operations.map(item=>item.type), ['plan.pillar.update','plan.pillar.update','plan.pillar.update','plan.alignment.update'])
  assert.deepEqual(operations.map(item=>item.targetId), ['spiritual','health','finance','morningAlignment'])
  assert.ok(operations.length<=8)
  assert.equal(operations[0].payload.patch.owner,undefined)
  assert.equal(operations[0].payload.patch.sermonNotes,undefined)
})

test('reviewed alignment initializes a missing day, records immutable audit, rejects stale data, and safely undoes', async () => {
  const date='2026-09-08',base=createEmptyDailyPlan(date),draft=structuredClone(base)
  draft.health.hydration='100 ounces by 6 PM'
  const operations=buildAlignmentOperations(base,draft,{completedAt:'2026-09-07T22:00:00.000Z'})
  const store=versionedBlobStore(),repository=createAssistantActionRepository({store,householdId:'daily-plan-house'})
  const resources=planResources(date),session={member:'Larry',role:'admin'},permissions=defaultActionPermissions('admin')
  const proposal=await prepareDirectProposal({input:{summary:'Review tomorrow alignment',operations,expectedVersion:0},session,permissions,repository,resources,id:'alignment-proposal',now:new Date('2026-09-07T21:00:00.000Z')})
  assert.equal(proposal.expectedVersions[`plan:${date}`],0)
  assert.equal(resources.snapshot().version,0,'preparing review cannot initialize the plan')
  const executed=await executeActionWithJournal({repository,proposal,operations:proposal.operations,session,permissions,resources,event:{},leaseMs:0,now:()=>new Date('2026-09-07T21:01:00.000Z')})
  assert.equal(resources.snapshot().version,1)
  assert.equal(resources.snapshot().value.health.hydration,'100 ounces by 6 PM')
  assert.equal(executed.audit.actor,'Larry')
  assert.equal(executed.audit.undoAvailable,true)
  assert.equal(executed.audit.changes[0].before.health.hydration,'')
  await assert.rejects(()=>prepareDirectProposal({input:{summary:'Stale recap',operations,expectedVersion:0},session,permissions,repository,resources,id:'stale-alignment'}),error=>error.code==='VERSION_CONFLICT')
  await undoActionWithJournal({repository,auditId:executed.audit.id,session,permissions,resources,event:{},leaseMs:0,now:()=>new Date('2026-09-07T21:02:00.000Z')})
  assert.equal(resources.snapshot().value.health.hydration,'')
  assert.equal(resources.snapshot().value.morningAlignment.completedAt,'')
  assert.equal((await repository.getAudit(executed.audit.id)).undoAvailable,false)
})

test('daily-plan permissions keep finance and generated whole-plan replacement administrator-only', () => {
  const member={member:'Lorenzo',role:'member'},permissions=defaultActionPermissions('member')
  const spiritual=normalizeActionProposal({operations:[{type:'plan.pillar.update',targetId:'spiritual',targetDate:'2026-09-07',description:'Review focus',payload:{pillar:'spiritual',patch:{devotionFocus:'Obey what Scripture reveals.'}}}]},member).operations[0]
  const finance=normalizeActionProposal({operations:[{type:'plan.pillar.update',targetId:'finance',targetDate:'2026-09-07',description:'Review finance',payload:{pillar:'finance',patch:{decisionRule:'No funding source means no approval.'}}}]},member).operations[0]
  const overview=normalizeActionProposal({operations:[{type:'plan.overview.update',targetId:'overview',targetDate:'2026-09-07',description:'Review generated plan',payload:{origin:'generated-draft',patch:{theme:'Truth before momentum'}}}]},member).operations[0]
  assert.equal(permissionForOperation({operation:spiritual,...member,permissions}).allowed,true)
  assert.equal(permissionForOperation({operation:finance,...member,permissions}).allowed,false)
  assert.equal(permissionForOperation({operation:overview,...member,permissions}).allowed,false)
  assert.equal(overview.risk,'strong-confirmation')
  assert.throws(()=>normalizeActionProposal({operations:[{type:'plan.pillar.update',targetId:'spiritual',targetDate:'2026-09-07',payload:{pillar:'spiritual',patch:{owner:'Lorenzo'}}}]},member),/unsupported field: owner/)
})

test('generated daily-plan drafts map to at most eight explicit reviewed operations', () => {
  const date='2026-09-07',current={...createEmptyDailyPlan(date),version:7},draft=structuredClone(current)
  draft.theme='Steady stewardship';draft.dayObjective='Finish the critical work.'
  for (const pillar of ['spiritual','health','fitness','household','education','finance','ministry']) {
    const field={spiritual:'devotionFocus',health:'hydration',fitness:'objective',household:'keyFocus',education:'thinkTankTopic',finance:'decisionRule',ministry:'contentFocus'}[pillar]
    draft[pillar][field]=`${pillar} reviewed value`
  }
  const operations=buildPlanDraftOperations(current,draft)
  assert.equal(operations.length,8)
  assert.equal(operations[0].type,'plan.overview.update')
  assert.ok(operations.slice(1).every(item=>item.type==='plan.pillar.update'&&item.payload.origin==='generated-draft'))
})

test('review accepts safe generated item aliases and still rejects unknown contract values', () => {
  const date='2026-09-09',current={...createEmptyDailyPlan(date),version:2},draft=structuredClone(current)
  draft.topPriorities=[{id:'priority-1',title:'Confirm the day',owner:'Larry',status:'Not Started',priority:'Medium',notificationLevel:'Informational'}]
  const operations=buildPlanDraftOperations(current,draft)
  const proposal=normalizeActionProposal({operations}, {member:'Larry',role:'admin'})
  assert.equal(proposal.operations[0].payload.patch.topPriorities[0].status, 'pending')
  assert.equal(proposal.operations[0].payload.patch.topPriorities[0].priority, 'normal')
  assert.equal(proposal.operations[0].payload.patch.topPriorities[0].notificationLevel, 'awareness')

  operations[0].payload.patch.topPriorities[0].status='unexpected-state'
  assert.throws(
    ()=>normalizeActionProposal({operations}, {member:'Larry',role:'admin'}),
    /topPriorities item 1 has an invalid status/,
  )

  operations[0].payload.patch.topPriorities[0].status='pending'
  operations[0].payload.patch.topPriorities[0].priority='unknown-priority'
  assert.throws(
    ()=>normalizeActionProposal({operations}, {member:'Larry',role:'admin'}),
    /topPriorities item 1 has an invalid priority/,
  )
})

test('the generator stores an immutable versioned draft and never targets the live plan key', async () => {
  const calls=[],records=new Map()
  const dataStore={
    async setJSON(key,value,options){calls.push({key,value,options});if(records.has(key))return{modified:false};records.set(key,structuredClone(value));return{modified:true}},
    async getWithMetadata(key){return records.has(key)?{data:structuredClone(records.get(key)),etag:'draft-etag'}:null},
  }
  const date='2026-09-07',requestId='request-1',draft={date,theme:'Proposed only'}
  const first=await saveGeneratedDailyPlanDraft({dataStore,date,requestId,draft,basePlanVersion:9,now:()=>new Date('2026-09-07T12:00:00Z')})
  assert.equal(first.draftRecord.basePlanVersion,9)
  assert.equal(calls[0].key,dailyPlanDraftKey(date,requestId))
  assert.deepEqual(calls[0].options,{onlyIfNew:true})
  assert.doesNotMatch(calls[0].key,/\/daily-plans\//)
  const second=await saveGeneratedDailyPlanDraft({dataStore,date,requestId,draft:{date,theme:'Must not replace'},basePlanVersion:10})
  assert.equal(second.skipped,true)
  assert.equal(second.draftRecord.draft.theme,'Proposed only')
})

test('scheduled generation reads meal previews and writes only its immutable daily-plan draft', async t => {
  const priorKey=process.env.OPENAI_API_KEY,priorFetch=globalThis.fetch
  process.env.OPENAI_API_KEY='test-key'
  t.after(()=>{if(priorKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=priorKey;globalThis.fetch=priorFetch})
  const date='2026-09-07',mealDay={version:1,resolvedMeals:{breakfast:{name:'Steak and eggs'},lunch:{name:'Salmon and greens'},dinner:{name:'Filet and asparagus'}}}
  let readOnlyMeals=0,authoritativeMealCalls=0
  const mealRepository={
    getWindowReadOnly:async()=>{readOnlyMeals+=1;return{days:[mealDay]}},
    getWindow:async()=>{authoritativeMealCalls+=1;throw new Error('must not initialize meals')},
    ensureDay:async()=>{authoritativeMealCalls+=1;throw new Error('must not initialize meals')},
  }
  const planItem={title:'Confirm details',owner:'Family',status:'pending',notes:'',date,startTime:'',endTime:'',priority:'normal',calendarSync:false,requiresDecision:false,notificationLevel:'awareness'}
  const generated={
    theme:'Truth before momentum',dayObjective:'Complete the reviewed priority.',governingPrinciple:'Verify before acting.',successStandard:'One verified outcome.',topPriorities:[planItem],
    morningAlignment:{startTime:'06:00',notes:'Review together.',agenda:['Review the day.']},dayparts:[],
    spiritual:{scripture:['Proverbs 4:23'],devotionFocus:'Guard the heart.',prayerFocus:['Wisdom'],discussionPrompts:[],obedienceAction:'Pause before acting.',requiredOutput:'Name the next faithful step.'},
    health:{breakfast:'Steak and eggs',lunch:'Salmon and greens',dinner:'Filet and asparagus',snacks:'Fruit',hydration:'Water',nextDayPrep:'Prep lunch',groceries:[],discussionPrompt:''},
    fitness:{location:'Lifetime Gym',workout:'Walk',objective:'Move well',departureTime:'',returnTime:'',recovery:'Stretch',participants:[],stepGoal:10000,requiresDecision:false,discussionPrompt:''},
    household:{keyFocus:'Keep order',appointments:[],priorities:[],errands:[],openItems:[],careerPriorities:[]},
    education:{thinkTankTopic:'Wisdom',thinkTankDeliverable:'One note',discussionPrompts:[],isaiah:{owner:'Family',readingMinutes:20,sightWordsMinutes:10,comprehensionMinutes:10,mathMinutes:20,notes:''}},
    finance:{bills:[],purchases:[],transfers:[],accountsToFund:[],incomePipeline:[],decisionRule:'No source means no approval.',discussionPrompt:'',requiredOutput:''},
    ministry:{meetings:[],contentFocus:'Serve faithfully',fellowshipFollowUps:[],prayerNeeds:[],readinessChecklist:[],framework:''},decisions:[],recap:{closePrompts:[],tomorrowPrep:[]},
  }
  globalThis.fetch=async()=>new Response(JSON.stringify({output:[{content:[{text:JSON.stringify(generated)}]}]}),{status:200,headers:{'content-type':'application/json'}})
  const writes=[],dataStore={getWithMetadata:async()=>null,setJSON:async(key,value,options)=>{writes.push({key,value,options});return{modified:true}}}
  await generateDailyPlanDraft({targetDate:date,targetWeekday:'Monday',requestId:`scheduled-${date}`,dataStore,mealRepository})
  assert.equal(readOnlyMeals,1)
  assert.equal(authoritativeMealCalls,0)
  assert.equal(writes.length,1)
  assert.equal(writes[0].key,dailyPlanDraftKey(date,`scheduled-${date}`))
  assert.deepEqual(writes[0].options,{onlyIfNew:true})
})

test('Today retrieves the exact deterministic scheduled draft for review', async () => {
  const originalFetch=globalThis.fetch
  let requested=''
  globalThis.fetch=async url => {
    requested=String(url)
    return new Response(JSON.stringify({draft:{requestId:'scheduled-2026-09-07',date:'2026-09-07',basePlanVersion:4,draft:{date:'2026-09-07'}}}),{status:200,headers:{'content-type':'application/json'}})
  }
  try {
    const draft=await fetchScheduledDailyPlanDraft('2026-09-07')
    assert.match(requested,/requestId=scheduled-2026-09-07/)
    assert.equal(draft.basePlanVersion,4)
  } finally { globalThis.fetch=originalFetch }
})

test('Today keeps the meal section truthful while rolling meals load, fail, or are absent', () => {
  const dashboard=read('./TodayDashboard.jsx'),today=read('./HouseholdToday.jsx')
  assert.doesNotMatch(dashboard,/if \(!entries\.length\) return null/)
  assert.match(dashboard,/Loading today’s meals/)
  assert.match(dashboard,/Today’s meal plan is unavailable/)
  assert.match(dashboard,/No meals are planned for today/)
  assert.match(dashboard,/Brevity will not invent missing meals/)
  assert.match(dashboard,/Open Meal Plan/)
  assert.match(today,/mealPlanState=\{mealPlan\.state\}/)
  assert.match(today,/mealPlanError=\{mealPlan\.error\}/)
})

test('alignment drafts remain device-local and are discarded when the acknowledged version changes', () => {
  const values=new Map(),storage={setItem:(key,value)=>values.set(key,value),getItem:key=>values.get(key)||null,removeItem:key=>values.delete(key)}
  const plan={...createEmptyDailyPlan('2026-09-07'),version:3};plan.health.snacks='Almonds'
  saveLocalAlignmentDraft(storage,plan,3)
  assert.equal(loadLocalAlignmentDraft(storage,createEmptyDailyPlan(plan.date),3).health.snacks,'Almonds')
  assert.equal(loadLocalAlignmentDraft(storage,createEmptyDailyPlan(plan.date),4).health.snacks,'')
  clearLocalAlignmentDraft(storage,plan.date)
  assert.equal(values.size,0)
})

test('recap drafts remain device-local until the matching reviewed action completes', () => {
  const values=new Map(),storage={setItem:(key,value)=>values.set(key,value),getItem:key=>values.get(key)||null,removeItem:key=>values.delete(key)}
  const plan={...createEmptyDailyPlan('2026-09-07'),version:3}
  const recap={...plan.recap,wins:['Kept the promise']}
  saveLocalRecapDraft(storage,plan,recap,3)
  assert.deepEqual(loadLocalRecapDraft(storage,plan,3).wins,['Kept the promise'])
  assert.deepEqual(loadLocalRecapDraft(storage,plan,4).wins,[])
  clearLocalRecapDraft(storage,plan.date)
  assert.equal(values.size,0)
})

test('cancelled or stale review retains the local draft and only a matching completion clears it', () => {
  const alignment=read('./MorningAlignment.jsx'),today=read('./HouseholdToday.jsx')
  assert.doesNotMatch(alignment,/clearLocalAlignmentDraft/)
  assert.match(alignment,/Review opened · draft retained/)
  assert.match(alignment,/saveLocalAlignmentDraft\(globalThis\.localStorage, cleanedDraft, openedVersionRef\.current\)/)
  assert.match(read('./EveningRecap.jsx'),/saveLocalRecapDraft\(globalThis\.localStorage, normalized, cleanedDraft, openedVersionRef\.current\)/)
  assert.match(today,/event\?\.detail\?\.proposalId !== pending\.proposalId/)
  assert.match(today,/pending\.kind === 'alignment'\) clearLocalAlignmentDraft/)
  assert.match(today,/pending\.kind === 'recap'\) clearLocalRecapDraft/)
  assert.doesNotMatch(today,/completeTodayAlignment[^\n]+setMode\('today'\)/)
  assert.doesNotMatch(today,/completeRecap[\s\S]{0,600}setMode\('tomorrow'\)/)
})

test('all browser and scheduled daily-plan paths are proposal-only', () => {
  const today=read('./HouseholdToday.jsx'),dashboard=read('./TodayDashboard.jsx'),alignment=read('./MorningAlignment.jsx'),tomorrow=read('./TomorrowProposal.jsx')
  const api=read('./householdApi.js'),generator=read('../../netlify/lib/household-plan-generator.mjs')
  const background=read('../../netlify/functions/daily-household-plan-background.mjs'),scheduled=read('../../netlify/functions/daily-household-plan-scheduled.mjs')
  const endpoint=read('../../netlify/functions/household-data.js')
  const draftEndpoint=read('../../netlify/functions/daily-household-plan-draft.mjs')
  assert.doesNotMatch(today,/persistAndSync|savePlan\(/)
  assert.doesNotMatch(alignment,/onSaveDraft|Draft autosave failed|saveDraftRef/)
  assert.doesNotMatch(tomorrow,/saveDailyPlan/)
  assert.match(today,/stageDailyPlanReview/)
  assert.match(api,/ACTION_REVIEW_REQUIRED/)
  assert.match(endpoint,/Direct daily-plan replacement is disabled/)
  assert.doesNotMatch(generator,/setJSON\(planKey\(/)
  assert.match(generator,/saveGeneratedDailyPlanDraft/)
  assert.match(background,/generateDailyPlanDraft/)
  assert.match(scheduled,/requestId:`scheduled-\$\{date\}`/)
  assert.match(scheduled,/authority:'draft-only'/)
  assert.match(today,/fetchScheduledDailyPlanDraft\(plan\.date\)/)
  assert.match(dashboard,/Review Scheduled Draft/)
  assert.match(draftEndpoint,/session\.role !== 'admin'/)
  assert.match(draftEndpoint,/protected financial planning/)
})
