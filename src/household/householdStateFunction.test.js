import assert from 'node:assert/strict'
import test from 'node:test'
import householdData from '../../netlify/functions/household-data.js'
import householdState from '../../netlify/functions/household-state.js'
import { readOptionalHouseholdRecord } from '../../netlify/lib/household-plan-generator.mjs'
import { hashValue } from './sharedState.js'

const { dailyPlanWritePermission, getPlan, putPlan } = householdData
const { ADMIN_WRITE_KEYS, KEY_WRITE_DOMAINS, readHouseholdRecords, sharedStateWritePermission, writeHouseholdRecord, writePlaidSourceRecord } = householdState
const now = () => new Date('2026-09-07T14:00:00.000Z')
const enabled = { planning:true, calendar:true, projects:true, finance:false }

function memoryStore(initial = null, { concurrentRecord = null } = {}) {
  let entry = initial ? { data:structuredClone(initial), etag:'etag-current' } : null
  const writes = []
  return {
    writes,
    async getWithMetadata() { return entry ? structuredClone(entry) : null },
    async setJSON(key, value, options) {
      writes.push({ key, value:structuredClone(value), options:{ ...options } })
      if (concurrentRecord) {
        entry = { data:structuredClone(concurrentRecord), etag:'etag-concurrent' }
        return { modified:false }
      }
      entry = { data:structuredClone(value), etag:'etag-next' }
      return { modified:true, etag:'etag-next' }
    },
  }
}

function dailyPlanStore(initial = null, { concurrentPlan = null, readError = null } = {}) {
  let current = initial ? { data:structuredClone(initial), etag:'plan-etag-current' } : null
  const writes = []
  return {
    writes,
    async getWithMetadata() {
      if (readError) throw readError
      return current ? structuredClone(current) : null
    },
    async setJSON(key, value, options) {
      writes.push({ key, value:structuredClone(value), options:{ ...options } })
      if (concurrentPlan) {
        current = { data:structuredClone(concurrentPlan), etag:'plan-etag-concurrent' }
        return { modified:false }
      }
      current = { data:structuredClone(value), etag:'plan-etag-next' }
      return { modified:true, etag:'plan-etag-next' }
    },
  }
}

const actual = (id = 'posted') => ({
  id, accountId:'plaid-operating', name:'AT&T', originalStatement:'ATT PAYMENT', amount:450,
  date:'2026-09-07', category:'UTILITIES', type:'expense', institution:'Pinnacle', pending:false,
})
const receipt = { cursorIdentity:'item-1', batchId:'a'.repeat(64) }
const accountReceipt = { payload:'server-account-payload', signature:'b'.repeat(64) }
const sourceBody = (key, value, expectedVersion = 0) => {
  const serialized = JSON.stringify(value)
  return {
    key, value:serialized, hash:hashValue(serialized), expectedVersion, writeMode:'source-ingestion', source:'plaid',
    ...(key === 'plaid_actuals_cache' ? { sourceReceipts:[receipt] } : { accountSourceReceipt:accountReceipt }),
  }
}
const stagedSource = ({ transactions = [actual()], removed = [], acknowledge = async () => ({ acknowledged:true }) } = {}) => ({
  verifySourceReceipts:async receipts => {
    assert.deepEqual(receipts, [receipt])
    return [{
      receipt,
      state:{ itemId:'', institution:'', cursor:'prior-cursor' },
      pendingDelta:{ batchId:receipt.batchId, fromCursor:'prior-cursor', nextCursor:'next-cursor', transactions, removed, delta:{ added:transactions.length, modified:0, removed:removed.length }, createdAt:'2026-09-07T13:59:00.000Z' },
    }]
  },
  acknowledgeSourceReceipt:acknowledge,
})
const verifiedAccounts = accounts => ({ verifyAccountReceipt:async value => {
  assert.deepEqual(value, accountReceipt)
  return accounts
} })

test('generic household-state writes require reviewed Action Mode for members and administrators', async () => {
  for (const session of [{ member:'Nyla', role:'member' }, { member:'Larry', role:'admin' }]) {
    for (const key of ['homehq_items_v1', 'family_calendar_events_v1', 'lslj_finance_v9', 'brevity_household_inventory_v1']) {
      const dataStore = memoryStore()
      const result = await writeHouseholdRecord({ dataStore, session, memberPermissions:enabled, body:{ key, value:'{}', expectedVersion:0 }, now })
      assert.equal(result.statusCode, 403, `${session.role}:${key}`)
      assert.equal(result.body.code, 'ACTION_REVIEW_REQUIRED', key)
      assert.match(result.body.error, /reviewed Action Mode/i, key)
      assert.equal(dataStore.writes.length, 0, key)
    }
  }
})

test('Plaid source ingestion is administrator-only and limited to its two source keys', async () => {
  const memberStore = memoryStore()
  const denied = await writePlaidSourceRecord({
    dataStore:memberStore,
    session:{ member:'Lorenzo', role:'member' },
    body:sourceBody('plaid_actuals_cache', [actual()]),
    now,
  })
  assert.equal(denied.statusCode, 403)
  assert.match(denied.body.error, /administrator/i)
  assert.equal(memberStore.writes.length, 0)

  const unsupported = await writePlaidSourceRecord({
    dataStore:memoryStore(),
    session:{ member:'Larry', role:'admin' },
    body:sourceBody('family_calendar_events_v1', []),
    now,
  })
  assert.equal(unsupported.statusCode, 400)
  assert.equal(unsupported.body.code, 'INVALID_SOURCE_INGESTION')
})

test('a valid Plaid transaction snapshot creates atomically with source attribution', async () => {
  const dataStore = memoryStore()
  let acknowledgedAfterWrite = false
  const result = await writePlaidSourceRecord({
    dataStore,
    session:{ member:'Larry', role:'admin' },
    body:sourceBody('plaid_actuals_cache', [actual()]),
    now,
    ...stagedSource({ acknowledge:async () => {
      acknowledgedAfterWrite = dataStore.writes.length === 1
      return { acknowledged:true }
    } }),
  })
  assert.equal(result.statusCode, 200)
  assert.equal(result.body.record.version, 1)
  assert.equal(result.body.record.updatedBy, 'Larry')
  assert.equal(result.body.record.source, 'plaid')
  assert.deepEqual(dataStore.writes[0].options, { onlyIfNew:true })
  assert.equal(acknowledgedAfterWrite, true)
})

test('transaction source ingestion requires an exact server-staged receipt and snapshot', async () => {
  const candidate = [actual()]
  const missing = sourceBody('plaid_actuals_cache', candidate)
  delete missing.sourceReceipts
  const missingResult = await writePlaidSourceRecord({
    dataStore:memoryStore(), session:{member:'Larry',role:'admin'}, body:missing, now,
    verifySourceReceipts:async () => { const error=new Error('missing'); error.code='PLAID_RECEIPT_INVALID'; throw error },
  })
  assert.equal(missingResult.statusCode,409)
  assert.equal(missingResult.body.code,'SOURCE_RECEIPT_REJECTED')

  const spoofed = await writePlaidSourceRecord({
    dataStore:memoryStore(), session:{member:'Larry',role:'admin'}, body:sourceBody('plaid_actuals_cache',candidate), now,
    ...stagedSource({ transactions:[actual('different-source-row')] }),
  })
  assert.equal(spoofed.statusCode,422)
  assert.equal(spoofed.body.code,'SOURCE_SNAPSHOT_MISMATCH')
})

test('a failed household snapshot CAS never acknowledges or advances a staged cursor', async () => {
  const oldValue=JSON.stringify([actual('old')])
  const existing={key:'plaid_actuals_cache',value:oldValue,hash:hashValue(oldValue),version:2}
  const concurrent={key:'plaid_actuals_cache',value:oldValue,hash:hashValue(oldValue),version:3}
  let acknowledgementCalls=0
  const result=await writePlaidSourceRecord({
    dataStore:memoryStore(existing,{concurrentRecord:concurrent}),
    session:{member:'Larry',role:'admin'},
    body:sourceBody('plaid_actuals_cache',[actual('new')],2),
    now,
    ...stagedSource({ transactions:[actual('new')], removed:['old'], acknowledge:async () => { acknowledgementCalls += 1 } }),
  })
  assert.equal(result.body.conflict,true)
  assert.equal(acknowledgementCalls,0)
})

test('an acknowledgement outage preserves the durable snapshot and requests a stale safe retry', async () => {
  const dataStore=memoryStore()
  const result=await writePlaidSourceRecord({
    dataStore,
    session:{member:'Larry',role:'admin'},
    body:sourceBody('plaid_actuals_cache',[actual()]),
    now,
    ...stagedSource({ acknowledge:async () => { throw new Error('cursor store unavailable') } }),
  })
  assert.equal(dataStore.writes.length,1)
  assert.equal(result.statusCode,200)
  assert.equal(result.body.record.version,1)
  assert.equal(result.body.sourceAcknowledgementPending,true)
  assert.match(result.body.error,/saved.*cursor.*not be acknowledged/i)
})

test('source ingestion requires an exact version, matching hash, and valid Plaid schema', async () => {
  const valid = sourceBody('plaid_actuals_cache', [actual()])
  const missingVersion = await writePlaidSourceRecord({ dataStore:memoryStore(), session:{member:'Larry',role:'admin'}, body:{ ...valid, expectedVersion:undefined }, now })
  assert.equal(missingVersion.statusCode, 400)
  assert.match(missingVersion.body.error, /expectedVersion/i)

  const badHash = await writePlaidSourceRecord({ dataStore:memoryStore(), session:{member:'Larry',role:'admin'}, body:{ ...valid, hash:'tampered' }, now })
  assert.equal(badHash.statusCode, 400)
  assert.match(badHash.body.error, /hash/i)

  const badSchema = await writePlaidSourceRecord({
    dataStore:memoryStore(), session:{member:'Larry',role:'admin'},
    body:sourceBody('plaid_actuals_cache', [{ ...actual(), amount:'450', injected:true }]), now,
    ...stagedSource({ transactions:[{ ...actual(), amount:'450', injected:true }] }),
  })
  assert.equal(badSchema.statusCode, 422)
  assert.equal(badSchema.body.code, 'SOURCE_SCHEMA_REJECTED')
})

test('an identical valid source snapshot verifies its version without version churn', async () => {
  const value=JSON.stringify([actual()])
  const existing={key:'plaid_actuals_cache',value,hash:hashValue(value),version:8,updatedAt:'2026-09-07T13:00:00.000Z',updatedBy:'Larry',source:'plaid'}
  const dataStore=memoryStore(existing)
  const result=await writePlaidSourceRecord({
    dataStore,
    session:{member:'Larry',role:'admin'},
    body:sourceBody('plaid_actuals_cache',[actual()],8),
    now,
    ...stagedSource(),
  })
  assert.equal(result.statusCode,200)
  assert.equal(result.body.unchanged,true)
  assert.equal(result.body.record.version,8)
  assert.equal(dataStore.writes.length,0)
})

test('a concurrent Plaid source write is returned as a version conflict', async () => {
  const oldValue=JSON.stringify([actual('old')])
  const existing={key:'plaid_actuals_cache',value:oldValue,hash:hashValue(oldValue),version:2}
  const newValue=JSON.stringify([actual('newer')])
  const concurrent={key:'plaid_actuals_cache',value:newValue,hash:hashValue(newValue),version:3,updatedBy:'Larry',source:'plaid'}
  const result=await writePlaidSourceRecord({
    dataStore:memoryStore(existing,{concurrentRecord:concurrent}),
    session:{member:'Larry',role:'admin'},
    body:sourceBody('plaid_actuals_cache',[actual('mine')],2),
    now,
    ...stagedSource({ transactions:[actual('mine')], removed:['old'] }),
  })
  assert.equal(result.statusCode,200)
  assert.equal(result.body.conflict,true)
  assert.equal(result.body.actualVersion,3)
  assert.equal(result.body.record.updatedBy,'Larry')
})

test('Plaid balance ingestion updates only source-owned fields on an existing finance plan', async () => {
  const finance={
    calendarDataVersion:6,
    accounts:[{id:'operating',name:'Operating Account',type:'checking',balance:100,notes:'Household operating account'}],
    transactions:[{id:'mortgage',name:'Mortgage',amount:2000,type:'expense'}],
  }
  const value=JSON.stringify(finance)
  const existing={key:'lslj_finance_v9',value,hash:hashValue(value),version:4,updatedBy:'Larry'}
  const next={...finance,accounts:[{...finance.accounts[0],balance:756.74,plaidAccountId:'source-account',plaidItemId:'source-item',plaidName:'Bank Checking',plaidOfficialName:'',plaidType:'depository',plaidSubtype:'checking',institution:'Pinnacle',mask:'607'}]}
  const dataStore=memoryStore(existing)
  const plaidAccounts=[{accountId:'source-account',itemId:'source-item',name:'Bank Checking',officialName:'',type:'depository',subtype:'checking',institution:'Pinnacle',mask:'607',balance:756.74}]
  const result=await writePlaidSourceRecord({dataStore,session:{member:'Larry',role:'admin'},body:sourceBody('lslj_finance_v9',next,4),now,...verifiedAccounts(plaidAccounts)})
  assert.equal(result.statusCode,200)
  assert.equal(result.body.record.version,5)
  assert.equal(JSON.parse(result.body.record.value).accounts[0].plaidItemId,'source-item')
  assert.deepEqual(dataStore.writes[0].options,{onlyIfMatch:'etag-current'})
})

test('Plaid balances cannot seed finance data or change household-managed finance fields', async () => {
  const finance={accounts:[{id:'operating',name:'Operating Account',type:'checking',balance:100}],transactions:[]}
  const sourceAccounts=[{accountId:'source-account',name:'Operating Account',type:'depository',subtype:'checking',balance:100}]
  const create=await writePlaidSourceRecord({dataStore:memoryStore(),session:{member:'Larry',role:'admin'},body:sourceBody('lslj_finance_v9',finance,0),now,...verifiedAccounts(sourceAccounts)})
  assert.equal(create.statusCode,422)
  assert.match(create.body.error,/cannot initialize/i)

  const value=JSON.stringify(finance)
  const existing={key:'lslj_finance_v9',value,hash:hashValue(value),version:2}
  for (const changed of [
    {...finance,transactions:[{id:'injected'}]},
    {...finance,accounts:[{...finance.accounts[0],name:'Renamed by browser'}]},
    {...finance,accounts:[...finance.accounts,{id:'injected',name:'Injected',type:'checking',balance:1}]},
  ]) {
    const dataStore=memoryStore(existing)
    const result=await writePlaidSourceRecord({dataStore,session:{member:'Larry',role:'admin'},body:sourceBody('lslj_finance_v9',changed,2),now,...verifiedAccounts(sourceAccounts)})
    assert.equal(result.statusCode,422)
    assert.equal(result.body.code,'SOURCE_SCHEMA_REJECTED')
    assert.equal(dataStore.writes.length,0)
  }
})

test('Plaid balance ingestion rejects missing, forged, and inexact server receipts', async () => {
  const finance={accounts:[{id:'operating',name:'Operating Account',type:'checking',balance:100}],transactions:[]}
  const value=JSON.stringify(finance)
  const existing={key:'lslj_finance_v9',value,hash:hashValue(value),version:2}
  const verified=[{accountId:'source-account',name:'Operating Account',type:'depository',subtype:'checking',balance:756.74}]
  const exact={...finance,accounts:[{...finance.accounts[0],balance:756.74,plaidAccountId:'source-account',plaidName:'Operating Account',plaidOfficialName:'',plaidType:'depository',plaidSubtype:'checking',institution:'',mask:'',plaidCurrentBalance:undefined}]}

  const missing=sourceBody('lslj_finance_v9',exact,2)
  delete missing.accountSourceReceipt
  const rejected=await writePlaidSourceRecord({
    dataStore:memoryStore(existing),session:{member:'Larry',role:'admin'},body:missing,now,
    verifyAccountReceipt:async()=>{const error=new Error('missing');error.code='PLAID_ACCOUNT_RECEIPT_INVALID';throw error},
  })
  assert.equal(rejected.statusCode,409)
  assert.equal(rejected.body.code,'SOURCE_RECEIPT_REJECTED')

  const fabricated={...exact,accounts:[{...exact.accounts[0],balance:999999}]}
  const mismatch=await writePlaidSourceRecord({
    dataStore:memoryStore(existing),session:{member:'Larry',role:'admin'},body:sourceBody('lslj_finance_v9',fabricated,2),now,
    ...verifiedAccounts(verified),
  })
  assert.equal(mismatch.statusCode,422)
  assert.equal(mismatch.body.code,'SOURCE_SNAPSHOT_MISMATCH')
})

test('shared-state reads distinguish absent records from storage failures', async () => {
  const absent = await readHouseholdRecords({ async getWithMetadata() { return null } })
  assert.deepEqual(absent, {})

  const outage = new Error('blob service unavailable')
  await assert.rejects(
    readHouseholdRecords({ async getWithMetadata() { throw outage } }),
    /blob service unavailable/,
  )
})

test('shared-state keys map to their server-enforced permission domains', () => {
  assert.equal(KEY_WRITE_DOMAINS.plaid_actuals_cache, 'finance')
  assert.equal(KEY_WRITE_DOMAINS.homehq_items_v1, 'projects')
  assert.equal(KEY_WRITE_DOMAINS.family_calendar_events_v1, 'calendar')
  assert.equal(KEY_WRITE_DOMAINS.brevity_household_schedule_v1, 'planning')
  assert.equal(KEY_WRITE_DOMAINS.brevity_household_maintenance_v1, 'planning')
  assert.equal(KEY_WRITE_DOMAINS.brevity_household_inventory_v1, 'planning')
  assert.equal(KEY_WRITE_DOMAINS.brevity_daily_financial_alignment_v1, 'finance')
  assert.equal(KEY_WRITE_DOMAINS.brevity_household_finance_bridge_v1, 'finance')
})

test('obsolete manual balance overrides cannot be synchronized', async () => {
  assert.equal(KEY_WRITE_DOMAINS.lslj_bal_overrides_v1,undefined)
  assert.equal(ADMIN_WRITE_KEYS.has('lslj_bal_overrides_v1'),false)
  const dataStore=memoryStore()
  const result=await writeHouseholdRecord({
    dataStore,
    session:{member:'Larry',role:'admin'},
    memberPermissions:{planning:true,calendar:true,projects:true,finance:true},
    body:{key:'lslj_bal_overrides_v1',value:'{"2026-09-07":999999}',expectedVersion:0},
    now,
  })
  assert.equal(result.statusCode,400)
  assert.match(result.body.error,/cannot be synchronized/i)
  assert.equal(dataStore.writes.length,0)
})

test('finance-sensitive alignment and bridge records remain administrator-only', () => {
  for (const key of ['brevity_daily_financial_alignment_v1', 'brevity_household_finance_bridge_v1']) {
    assert.ok(ADMIN_WRITE_KEYS.has(key), key)
    const result = sharedStateWritePermission({
      session:{ member:'Lorenzo', role:'member' },
      key,
      memberPermissions:{ ...enabled, finance:true },
    })
    assert.equal(result.allowed, false, key)
    assert.equal(result.domain, 'finance', key)
  }
})

test('daily-plan writes require planning permission', async () => {
  const dataStore = dailyPlanStore()
  const result = await putPlan('2026-09-07', { date:'2026-09-07', theme:'Grow', finance:{ bills:[] } }, 0, {
    dataStore,
    session:{ member:'Nyla', role:'member' },
    memberPermissions:{ ...enabled, planning:false },
    now,
  })
  assert.equal(result.forbidden, true)
  assert.equal(result.permission.domain, 'planning')
  assert.equal(dataStore.writes.length, 0)
})

test('a planning member may edit a daily plan but cannot change its finance section', async () => {
  const current = {
    id:'daily-plan-2026-09-07', date:'2026-09-07', theme:'Focus',
    finance:{ owner:'Larry', bills:[{ id:'mortgage', amount:1000 }], purchases:[] },
    version:3,
  }
  const allowedStore = dailyPlanStore(current)
  const allowed = await putPlan('2026-09-07', { ...current, theme:'Steady focus' }, 3, {
    dataStore:allowedStore,
    session:{ member:'Nyla', role:'member' },
    memberPermissions:enabled,
    now,
  })
  assert.equal(allowed.conflict, false)
  assert.equal(allowed.plan.version, 4)
  assert.equal(allowedStore.writes.length, 1)
  assert.deepEqual(allowedStore.writes[0].options, { onlyIfMatch:'plan-etag-current' })

  const deniedStore = dailyPlanStore(current)
  const denied = await putPlan('2026-09-07', { ...current, finance:{ ...current.finance, bills:[{ id:'mortgage', amount:1200 }] } }, 3, {
    dataStore:deniedStore,
    session:{ member:'Nyla', role:'member' },
    memberPermissions:enabled,
    now,
  })
  assert.equal(denied.forbidden, true)
  assert.equal(denied.permission.domain, 'finance')
  assert.equal(deniedStore.writes.length, 0)
})

test('daily-plan finance permission ignores owner and empty client defaults but not financial truth', async () => {
  const current = {
    id:'daily-plan-2026-09-07', date:'2026-09-07', theme:'Focus', version:3,
    finance:{ bills:[{ id:'mortgage', amount:1000 }] },
  }
  const normalized = {
    ...current,
    theme:'Steady focus',
    finance:{ owner:'Larry', bills:[{ id:'mortgage', amount:1000 }], purchases:[], transfers:[], accountsToFund:[], incomePipeline:[], decisionRule:'' },
  }
  const dataStore = dailyPlanStore(current)
  const allowed = await putPlan('2026-09-07', normalized, 3, {
    dataStore,
    session:{ member:'Nyla', role:'member' },
    memberPermissions:enabled,
    now,
  })
  assert.equal(allowed.conflict, false)
  assert.equal(dataStore.writes.length, 1)
})

test('administrator daily-plan writes may update embedded finance data', async () => {
  const current = { id:'daily-plan-2026-09-07', date:'2026-09-07', finance:{ bills:[] }, version:1 }
  const dataStore = dailyPlanStore(current)
  const result = await putPlan('2026-09-07', { ...current, finance:{ bills:[{ id:'phone', amount:450 }] } }, 1, {
    dataStore,
    session:{ member:'Larry', role:'admin' },
    now,
  })
  assert.equal(result.conflict, false)
  assert.equal(result.plan.finance.bills[0].amount, 450)
  assert.equal(dataStore.writes.length, 1)
})

test('ordinary daily-plan saves cannot forge Action Mode recovery identity',async()=>{
  const current={id:'daily-plan-2026-09-07',date:'2026-09-07',theme:'Focus',finance:{bills:[]},version:2,lastActionId:'old-action',updatedBy:'Larry'}
  const dataStore=dailyPlanStore(current)
  const result=await putPlan('2026-09-07',{...current,theme:'Member edit',lastActionId:'execute-forged',updatedBy:'Ask Brevity · Larry'},2,{
    dataStore,session:{member:'Nyla',role:'member'},memberPermissions:enabled,now,
  })
  assert.equal(result.conflict,false)
  assert.equal(result.plan.lastActionId,'')
  assert.equal(result.plan.updatedBy,'Nyla')
  assert.equal(dataStore.writes[0].value.lastActionId,'')
  assert.equal(dataStore.writes[0].value.updatedBy,'Nyla')
})

test('daily-plan creation and replacement use atomic blob preconditions', async () => {
  const createdStore = dailyPlanStore()
  const created = await putPlan('2026-09-07', { date:'2026-09-07', theme:'Focus', finance:{ bills:[] } }, 0, {
    dataStore:createdStore,
    session:{ member:'Larry', role:'admin' },
    now,
  })
  assert.equal(created.conflict, false)
  assert.deepEqual(createdStore.writes[0].options, { onlyIfNew:true })

  const current = { id:'daily-plan-2026-09-07', date:'2026-09-07', theme:'Focus', finance:{ bills:[] }, version:2 }
  const concurrent = { ...current, theme:'Newer device', version:3 }
  const concurrentStore = dailyPlanStore(current, { concurrentPlan:concurrent })
  const result = await putPlan('2026-09-07', { ...current, theme:'My change' }, 2, {
    dataStore:concurrentStore,
    session:{ member:'Larry', role:'admin' },
    now,
  })
  assert.equal(result.conflict, true)
  assert.equal(result.current.theme, 'Newer device')
  assert.equal(result.current.version, 3)
})

test('daily-plan storage failures are not mistaken for a missing record', async () => {
  const outage = new Error('blob service unavailable')
  await assert.rejects(
    putPlan('2026-09-07', { date:'2026-09-07', finance:{ bills:[] } }, 0, {
      dataStore:dailyPlanStore(null, { readError:outage }),
      session:{ member:'Larry', role:'admin' },
      now,
    }),
    /blob service unavailable/,
  )
})

test('Today fails closed when active-sermon storage is unavailable', async () => {
  const plan = { id:'daily-plan-2026-09-07', date:'2026-09-07', spiritual:{ devotionFocus:'Retained' }, version:2 }
  const dataStore = {
    async getWithMetadata(key) {
      if (key.includes('/daily-plans/')) return { data:plan, etag:'plan-etag' }
      throw Object.assign(new Error('active sermon store unavailable'), { statusCode:503 })
    },
  }
  await assert.rejects(getPlan('2026-09-07', dataStore), /active sermon store unavailable/)

  const withoutSermon = await getPlan('2026-09-07', {
    async getWithMetadata(key) {
      if (key.includes('/daily-plans/')) return { data:plan, etag:'plan-etag' }
      throw Object.assign(new Error('not found'), { name:'NotFoundError' })
    },
  })
  assert.equal(withoutSermon.spiritual.devotionFocus, 'Retained')
})

test('daily generator context distinguishes missing prior data from a Blob outage', async () => {
  assert.equal(await readOptionalHouseholdRecord({ async getWithMetadata() { return null } }, 'missing'), null)
  assert.equal(await readOptionalHouseholdRecord({ async getWithMetadata() { throw Object.assign(new Error('missing'), { status:404 }) } }, 'missing'), null)
  await assert.rejects(
    readOptionalHouseholdRecord({ async getWithMetadata() { throw Object.assign(new Error('blob outage'), { statusCode:503 }) } }, 'active-sermon'),
    /blob outage/,
  )
})

test('empty finance defaults do not prevent a member from creating a daily plan', () => {
  const permission = dailyPlanWritePermission({
    session:{ member:'Nyla', role:'member' },
    memberPermissions:enabled,
    currentPlan:null,
    nextPlan:{ finance:{ owner:'Larry', bills:[], purchases:[], transfers:[], accountsToFund:[], incomePipeline:[], decisionRule:'' } },
  })
  assert.equal(permission.allowed, true)
  assert.equal(permission.domain, 'planning')
})
