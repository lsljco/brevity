import test from 'node:test'
import assert from 'node:assert/strict'
import { clearPillarAnalyses, collectPillarContextFromStorage, generatePillarAnalysis, PILLAR_ANALYSIS_SCHEMA_VERSION, pillarAnalysisContextSignature, pillarAnalysisStorageKey, readPillarAnalysis } from './pillarAnalysisApi.js'

function storage(initial = {}) {
  const values = { ...initial }
  return {
    get length() { return Object.keys(values).length },
    key: index => Object.keys(values)[index] ?? null,
    getItem: key => values[key] ?? null,
    setItem: (key, value) => { values[key] = String(value) },
    removeItem: key => { delete values[key] },
    values,
  }
}

test('finance analysis reads the active finance, Plaid and budget storage keys', () => {
  const context = collectPillarContextFromStorage('finance', storage({
    lslj_finance_v9: JSON.stringify({ accounts:[{ id:'a1', balance:1250 }], transactions:[{ id:'scheduled', name:'JS Old Castle Iincome', type:'income', cat:'Housing' }] }),
    plaid_actuals_cache: JSON.stringify([{ id:'posted', amount:42 }]),
    lslj_budget_v1: JSON.stringify({ Groceries:[300] }),
    plaid_synced_at: '2026-08-20T22:00:00.000Z',
  }))
  assert.equal(context.accounts[0].balance, 1250)
  assert.equal(context.scheduledTransactions[0].id, 'scheduled')
  assert.equal(context.scheduledTransactions[0].name, 'JS CRH Oldcastle Income')
  assert.equal(context.scheduledTransactions[0].cat, 'Income')
  assert.equal(context.actualTransactions[0].id, 'posted')
  assert.deepEqual(context.budgets.Groceries, [300])
  assert.equal(context.syncedAt, undefined)
})

test('finance insights ignore obsolete manual balance overrides', () => {
  const context = collectPillarContextFromStorage('finance', storage({
    lslj_finance_v9:JSON.stringify({ accounts:[{ id:'operating', balance:1200 }], transactions:[] }),
    lslj_bal_overrides_v1:JSON.stringify({ '2026-09-07':999999 }),
  }))
  assert.equal(context.accounts[0].balance,1200)
  assert.equal('balanceOverrides' in context,false)
  assert.equal(JSON.stringify(context).includes('999999'),false)
})

test('household analysis includes authoritative calendar, maintenance, inventory, and schedule context', () => {
  const context = collectPillarContextFromStorage('household', storage({
    family_calendar_events_v1: JSON.stringify([
      { id:'meeting-1', source:'finance-meeting', title:'Jabin will meet Tara', owner:'Tarrica', participants:['Jabin'] },
    ]),
    brevity_icloud_calendar_cache_v1:JSON.stringify({ calendar:'Family', refreshedAt:'2026-09-07T12:00:00Z', events:[{ id:'apple-1', source:'icloud', title:'Tara family reunion', owner:'Tara' }] }),
    brevity_household_maintenance_v1:JSON.stringify({ trackingStartedOn:'2026-09-01', occurrences:{ 'task-1':{ complete:true, updatedAt:'2026-09-07T12:00:00Z' } } }),
    brevity_household_inventory_v1:JSON.stringify({ items:[{ id:'milk', name:'Milk', quantity:1, parLevel:2, updatedAt:'2026-09-07T12:00:00Z' }], waste:[] }),
    brevity_household_schedule_v1:JSON.stringify({ blocks:[{ id:'school', title:'School', date:'2026-09-07', startTime:'09:00' }], routines:[], routineOverrides:{} }),
  }))
  assert.equal(context.calendar.brevityEvents[0].title,'Javin will meet Terica')
  assert.equal(context.calendar.brevityEvents[0].owner,'Terica')
  assert.deepEqual(context.calendar.brevityEvents[0].participants,['Javin'])
  assert.equal(context.calendar.appleFamilyCalendar[0].title,'Tara family reunion')
  assert.equal(context.calendar.appleFamilyCalendar[0].owner,'Tara')
  assert.equal(context.maintenance.occurrences['task-1'].complete,true)
  assert.equal(context.inventory.items[0].name,'Milk')
  assert.equal(context.schedule.blocks[0].title,'School')
})

test('clearing a changed daily plan invalidates every pillar analysis for that date', () => {
  const targetFinance=pillarAnalysisStorageKey('2026-08-21','finance','Larry')
  const targetSpiritual=pillarAnalysisStorageKey('2026-08-21','spiritual','Lorenzo')
  const otherDate=pillarAnalysisStorageKey('2026-08-22','finance','Larry')
  const cache=storage({[targetFinance]:'{}',[targetSpiritual]:'{}',[otherDate]:'{}'})
  clearPillarAnalyses('2026-08-21',cache)
  assert.equal(cache.getItem(targetFinance),null)
  assert.equal(cache.getItem(targetSpiritual),null)
  assert.equal(cache.getItem(otherDate),'{}')
})

test('pillar analysis browser cache is schema, context, and signed-member scoped', () => {
  const date = '2026-09-06'
  const pillar = 'spiritual'
  const key = pillarAnalysisStorageKey(date, pillar, 'Larry')
  assert.match(key, new RegExp(`_v${PILLAR_ANALYSIS_SCHEMA_VERSION}_`))
  assert.notEqual(key,pillarAnalysisStorageKey(date,pillar,'Lorenzo'))
  assert.equal(readPillarAnalysis(date, pillar, 'Larry', storage({ [key]: JSON.stringify({ schemaVersion:1, member:'Larry', analysis:{} }) })), null)
  const current = { schemaVersion:PILLAR_ANALYSIS_SCHEMA_VERSION, member:'Larry', analysis:{ headline:'Growth' } }
  const cache=storage({[key]:JSON.stringify(current),[pillarAnalysisStorageKey(date,pillar,'Lorenzo')]:JSON.stringify({...current,member:'Lorenzo'})})
  assert.deepEqual(readPillarAnalysis(date,pillar,'Larry',cache),current)
  assert.equal(readPillarAnalysis(date,pillar,'Terica',cache),null)
  assert.equal(readPillarAnalysis(date,pillar,'Larry',storage({[key]:JSON.stringify({...current,member:'Lorenzo'})})),null)
})

test('pillar analysis cache invalidates when a relevant source value changes', () => {
  const date='2026-09-07'
  const pillar='finance'
  const key=pillarAnalysisStorageKey(date,pillar,'Larry')
  const original=pillarAnalysisContextSignature({pillarData:{headline:'Preserve liquidity'},localContext:{actualTransactions:[{id:'one',amount:40}]}})
  const sameDataDifferentKeyOrder=pillarAnalysisContextSignature({localContext:{actualTransactions:[{amount:40,id:'one'}]},pillarData:{headline:'Preserve liquidity'}})
  const changed=pillarAnalysisContextSignature({pillarData:{headline:'Preserve liquidity'},localContext:{actualTransactions:[{id:'one',amount:45}]}})
  const cached={schemaVersion:PILLAR_ANALYSIS_SCHEMA_VERSION,member:'Larry',contextSignature:original,analysis:{headline:'Source-aware'}}

  assert.equal(original,sameDataDifferentKeyOrder)
  assert.notEqual(original,changed)
  assert.deepEqual(readPillarAnalysis(date,pillar,'Larry',storage({[key]:JSON.stringify(cached)}),original),cached)
  assert.equal(readPillarAnalysis(date,pillar,'Larry',storage({[key]:JSON.stringify(cached)}),changed),null)
})

test('household context signature invalidates for each authoritative operational source', () => {
  const base={
    family_calendar_events_v1:JSON.stringify([{id:'local',title:'Family dinner',date:'2026-09-07'}]),
    brevity_icloud_calendar_cache_v1:JSON.stringify({events:[{id:'apple',title:'School',date:'2026-09-07'}]}),
    brevity_household_maintenance_v1:JSON.stringify({occurrences:{task:{complete:false}}}),
    brevity_household_inventory_v1:JSON.stringify({items:[{id:'milk',name:'Milk',quantity:1}]}),
    brevity_household_schedule_v1:JSON.stringify({blocks:[{id:'block',title:'Study',date:'2026-09-07'}]}),
  }
  const signature=records=>pillarAnalysisContextSignature({localContext:collectPillarContextFromStorage('household',storage(records))})
  const original=signature(base)
  const changes=[
    {...base,brevity_icloud_calendar_cache_v1:JSON.stringify({events:[{id:'apple',title:'Practice',date:'2026-09-07'}]})},
    {...base,brevity_household_maintenance_v1:JSON.stringify({occurrences:{task:{complete:true}}})},
    {...base,brevity_household_inventory_v1:JSON.stringify({items:[{id:'milk',name:'Milk',quantity:0}]})},
    {...base,brevity_household_schedule_v1:JSON.stringify({blocks:[{id:'block',title:'Study',date:'2026-09-08'}]})},
  ]
  changes.forEach(changed=>assert.notEqual(signature(changed),original))
})

test('finance context applies future rules and explicit actual overrides without copying bulky source records', () => {
  const context=collectPillarContextFromStorage('finance',storage({
    lslj_finance_v9:JSON.stringify({accounts:[{id:'operating',name:'Operating Account',plaidAccountId:'bank'}],transactions:[]}),
    plaid_actuals_cache:JSON.stringify([{id:'tx1',date:'2026-09-07',amount:450,name:'AT&T PAYMENT',category:'GENERAL_MERCHANDISE',accountId:'bank',logoData:'x'.repeat(1000)}]),
    lslj_tx_rules_v1:JSON.stringify([{id:'rule1',applyToExisting:true,conditions:{merchantName:{on:true,match:'contains',value:'AT&T'}},actions:{renameMerchant:{on:true,value:'AT&T Mobility'},updateCategory:{on:true,value:'Phone'}}}]),
    lslj_tx_overrides_v1:JSON.stringify({tx1:{name:'AT&T Wireless',category:'Utilities'}}),
  }))
  assert.equal(context.actualTransactions[0].name,'AT&T Wireless')
  assert.equal(context.actualTransactions[0].category,'Utilities')
  assert.equal(context.actualTransactions[0].logoData,undefined)
  assert.equal(context.transactionRules[0].id,'rule1')
  assert.equal(context.transactionOverrides[0].id,'tx1')
})

test('context signatures preserve authored array order while ignoring freshness-only timestamps', () => {
  const first=pillarAnalysisContextSignature({pillarData:{formationSteps:['Read','Reflect','Respond']},localContext:{syncedAt:'2026-09-07T10:00:00Z'}})
  const second=pillarAnalysisContextSignature({pillarData:{formationSteps:['Read','Reflect','Respond']},localContext:{syncedAt:'2026-09-07T11:00:00Z'}})
  assert.equal(first,second)
  assert.notEqual(first,pillarAnalysisContextSignature({pillarData:{formationSteps:['Respond','Reflect','Read']},localContext:{syncedAt:'2026-09-07T12:00:00Z'}}))
})

test('set-like finance records remain stable because their collector canonicalizes source order', () => {
  const common={
    lslj_finance_v9:JSON.stringify({accounts:[{id:'operating',name:'Operating Account'}],transactions:[]}),
  }
  const first=collectPillarContextFromStorage('finance',storage({...common,plaid_actuals_cache:JSON.stringify([{id:'b',date:'2026-09-06',amount:2},{id:'a',date:'2026-09-07',amount:1}])}))
  const second=collectPillarContextFromStorage('finance',storage({...common,plaid_actuals_cache:JSON.stringify([{id:'a',date:'2026-09-07',amount:1},{id:'b',date:'2026-09-06',amount:2}])}))
  assert.equal(pillarAnalysisContextSignature({localContext:first}),pillarAnalysisContextSignature({localContext:second}))
})

test('only the latest A/B request may persist or publish a pillar analysis', async () => {
  const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done});return{promise,resolve}}
  const requests={A:deferred(),B:deferred()}
  const cache=storage()
  const events=[]
  const plan={version:1,finance:{headline:'Preserve liquidity'}}
  const responseFor=(marker,headline)=>({ok:true,status:200,json:async()=>({schemaVersion:PILLAR_ANALYSIS_SCHEMA_VERSION,member:'Larry',pillar:'finance',date:'2026-09-07',contextSignature:pillarAnalysisContextSignature({pillarData:plan.finance,localContext:{marker}}),analysis:{headline}})})
  const fetcher=(_url,options)=>requests[JSON.parse(options.body).localContext.marker].promise
  const common={pillar:'finance',date:'2026-09-07',plan,currentMember:'Larry',fetcher,storage:cache,eventTarget:{dispatchEvent:event=>events.push(event)}}
  const requestA=generatePillarAnalysis({...common,localContext:{marker:'A'}})
  const requestB=generatePillarAnalysis({...common,localContext:{marker:'B'}})
  requests.B.resolve(responseFor('B','Newest'))
  const resultB=await requestB
  requests.A.resolve(responseFor('A','Stale'))
  const resultA=await requestA
  assert.equal(resultB.analysis.headline,'Newest')
  assert.equal(resultA,null)
  assert.equal(JSON.parse(cache.getItem(pillarAnalysisStorageKey('2026-09-07','finance','Larry'))).analysis.headline,'Newest')
  assert.equal(events.length,1)
})
