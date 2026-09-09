import { randomUUID } from 'node:crypto'
import { getStore } from '@netlify/blobs'
import { deleteRecurringOccurrence, editRecurringOccurrence } from '../../src/finance/recurrenceEditing.js'
import { applyBudgetTarget } from '../../src/finance/budgetBreakdown.js'
import { createEmptyDailyPlan } from '../../src/household/dailyPlan.js'
import { applyHouseholdRecordOperation, householdRecordForOperation, householdResourceKeyForAction } from '../../src/household/householdActionModel.js'
import { createRollingMealDay, validateMealSubstitution } from '../../src/meals/mealPlanData.js'
import { permissionForOperation, selectedOperation } from './assistant-action-contract.mjs'

const HOUSEHOLD_ID = process.env.BREVITY_HOUSEHOLD_ID || 'lslj-family'
const SHARED_STORE = 'brevity-household-state'
const PLAN_STORE = 'brevity-household'
const MEAL_STORE = 'brevity-meals'
const SHARED_KEYS = {
  projects:'homehq_items_v1', calendar:'family_calendar_events_v1', overrides:'lslj_tx_overrides_v1',
  rules:'lslj_tx_rules_v1', budget:'lslj_budget_v1', forecasts:'brevity_finance_scenarios_v1', finance:'lslj_finance_v9',
  meetings:'brevity_finance_meetings_v1',
}
const clone = value => value == null ? value : JSON.parse(JSON.stringify(value))
const nowIso = now => now().toISOString()
const hashValue = (value = '') => {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16)
}

export function resourceForOperation(operation) {
  if (operation.type === 'meal.substitute') return `meal:${operation.targetDate}`
  if (operation.type === 'sermon.activate') return 'sermon:active'
  const householdKey=householdResourceKeyForAction(operation.type)
  if (householdKey) return `shared:${householdKey}`
  if (operation.type.startsWith('meeting.')) return `shared:${SHARED_KEYS.meetings}`
  if (operation.domain === 'planning') return `plan:${operation.targetDate}`
  if (operation.domain === 'projects') return `shared:${SHARED_KEYS.projects}`
  if (operation.type.startsWith('calendar.')) return 'calendar:apple-family'
  if (operation.type === 'transaction.categorize' || operation.type === 'transaction.update') return `shared:${SHARED_KEYS.overrides}`
  if (operation.type === 'transaction.rule.create' || operation.type === 'transaction.rule.delete') return `shared:${SHARED_KEYS.rules}`
  if (operation.type === 'budget.update') return `shared:${SHARED_KEYS.budget}`
  if (operation.type === 'forecast.update') return `shared:${SHARED_KEYS.forecasts}`
  if (operation.type === 'finance.account.link') return `shared:${SHARED_KEYS.finance}`
  if (operation.type.startsWith('recurring.')) return `shared:${SHARED_KEYS.finance}`
  throw new Error(`No action resource exists for ${operation.type}.`)
}

export function recordForOperation(value, operation) {
  if (operation.type.startsWith('household.')) return householdRecordForOperation(value,operation)
  if (operation.type === 'sermon.activate') return value || null
  if (operation.type === 'decision.update') return (value?.decisions || []).find(item => item.id === operation.targetId)
  if (operation.type === 'assignment.update') return (value?.assignments || []).find(item => item.id === operation.targetId)
  if (operation.type === 'plan.overview.update') return value || null
  if (operation.type === 'plan.pillar.update') return value?.[operation.payload?.pillar] || null
  if (operation.type === 'plan.alignment.update') return value?.morningAlignment || null
  if (operation.type === 'plan.recap.update') return value?.recap || null
  if (operation.type === 'project.update' || operation.type === 'project.delete') return (Array.isArray(value) ? value : []).find(item => item.id === operation.targetId)
  if (operation.type === 'forecast.update') return ['model','planningExpense','expenseMode'].includes(operation.targetId) ? value : (value?.scenarios || []).find(item => item.id === operation.targetId)
  if (operation.type === 'finance.account.link') return (value?.accounts || []).find(item => item.id === operation.targetId)
  if (operation.type.startsWith('recurring.') && operation.type !== 'recurring.create') return (value?.transactions || []).find(item => item.id === operation.targetId)
  if (operation.type === 'meeting.action.update') return (value?.openActions || []).find(item => item.id === operation.targetId)
  if (operation.type === 'meeting.correction.update') return (value?.corrections || []).find(item => item.id === operation.targetId)
  if (operation.type === 'meeting.history.update') return (value?.meetings || []).find(item => item.id === operation.targetId)
  if (operation.type === 'transaction.rule.delete') return (Array.isArray(value) ? value : []).find(item => item.id === operation.targetId)
  return null
}

function mergeAllowed(record, payload) { return { ...record, ...clone(payload), updatedAt:new Date().toISOString() } }

export function applyRecordOperation(value, operation, createId = randomUUID, context = {}) {
  const before = clone(value)
  const payload = operation.payload || {}
  if (operation.type.startsWith('household.')) return applyHouseholdRecordOperation(value,operation,{...context,createId})
  if (operation.type === 'sermon.activate') {
    let candidate
    try { candidate=JSON.parse(payload.candidateJson) } catch { throw new Error('The reviewed sermon candidate is unreadable.') }
    const currentVersion=Number(context.recordVersion??value?.version??0)
    if (operation.targetId !== 'active-sermon' || candidate?.id !== payload.draftId || candidate?.sourceHash !== payload.sourceHash || Number(candidate?.baseActiveVersion) !== currentVersion) {
      throw Object.assign(new Error('The active sermon changed after this candidate was created. Refresh and review the current source before activating another sermon.'),{code:'VERSION_CONFLICT'})
    }
    if (!candidate?.sermonNotes || !candidate?.formation || candidate?.source?.sourceHash !== payload.sourceHash) throw new Error('The retained sermon candidate is incomplete or does not match its source fingerprint.')
    const activatedAt=nowIso(context.now||(()=>new Date()))
    const after={
      id:`active-sermon-${payload.sourceHash.slice(0,16)}`,
      draftId:payload.draftId,
      sourceHash:payload.sourceHash,
      source:{...clone(candidate.source),sourceHash:payload.sourceHash},
      sermonNotes:clone(candidate.sermonNotes),
      formation:clone(candidate.formation),
      model:String(candidate.model||''),
      activatedAt,
      activatedBy:context.actor||'Household member',
    }
    return {before,after}
  }
  if (operation.type === 'plan.overview.update') {
    const after = { ...(value || {}), ...clone(payload.patch) }
    if (payload.origin === 'generated-draft') after.generatedBy = 'brevity-daily-household-plan'
    if (JSON.stringify(after) === JSON.stringify(value)) throw new Error('The daily-plan overview already has the reviewed values. Refresh before preparing another change.')
    return { before, after }
  }
  if (operation.type === 'plan.pillar.update') {
    const pillar = payload.pillar
    const current = value?.[pillar] || {}
    const patch = clone(payload.patch)
    const nextPillar = pillar === 'education' && patch.isaiah
      ? { ...current, ...patch, isaiah:{ ...(current.isaiah || {}), ...patch.isaiah } }
      : { ...current, ...patch }
    const after = { ...(value || {}), [pillar]:nextPillar }
    if (payload.origin === 'generated-draft') after.generatedBy = 'brevity-daily-household-plan'
    if (JSON.stringify(after) === JSON.stringify(value)) throw new Error(`The ${pillar} daily plan already has the reviewed values. Refresh before preparing another change.`)
    return { before, after }
  }
  if (operation.type === 'plan.alignment.update') {
    const after = { ...(value || {}), morningAlignment:{ ...(value?.morningAlignment || {}), ...clone(payload.patch) } }
    if (JSON.stringify(after) === JSON.stringify(value)) throw new Error('Morning Alignment already has the reviewed values. Refresh before preparing another change.')
    return { before, after }
  }
  if (operation.type === 'plan.recap.update') {
    const after = { ...(value || {}), recap:{ ...(value?.recap || {}), ...clone(payload.patch) } }
    if (JSON.stringify(after) === JSON.stringify(value)) throw new Error('The daily recap already has the reviewed values. Refresh before preparing another change.')
    return { before, after }
  }
  if(['meeting.action.update','meeting.correction.update','meeting.history.update'].includes(operation.type)){
    const collection=operation.type==='meeting.action.update'?'openActions':operation.type==='meeting.correction.update'?'corrections':'meetings'
    let found=false
    const afterItems=(value?.[collection]||[]).map(item=>{
      if(item.id!==operation.targetId)return item
      found=true
      return{...item,...clone(payload),updatedAt:nowIso(context.now||(()=>new Date())),updatedBy:context.actor||'Household member'}
    })
    if(!found)throw new Error('That Finance Meeting record no longer exists. Refresh Brevity and review the current meeting data.')
    return{before,after:{...value,[collection]:afterItems}}
  }
  if(operation.type==='meeting.action.create'){
    const createdAt=nowIso(context.now||(()=>new Date()))
    const item={id:createId(),text:payload.text,owner:payload.owner||'',due:payload.due||'',meetingDate:payload.meetingDate||createdAt.slice(0,10),financialEffect:payload.financialEffect||'',status:'open',createdAt,cadence:payload.cadence||'weekly',createdBy:context.actor||'Household member'}
    return{before,after:{...(value&&!Array.isArray(value)?value:{}),openActions:[item,...(value?.openActions||[])]},createdId:item.id}
  }
  if(operation.type==='meeting.correction.create'){
    const createdAt=nowIso(context.now||(()=>new Date()))
    const item={id:createId(),label:payload.label,value:payload.value,source:payload.source||'User Confirmed',scope:payload.scope||'this occurrence',reason:payload.reason||'',origin:payload.origin||'manually entered',meetingDate:payload.meetingDate||createdAt.slice(0,10),status:'proposed',createdAt,cadence:payload.cadence||'weekly',createdBy:context.actor||'Household member'}
    return{before,after:{...(value&&!Array.isArray(value)?value:{}),corrections:[item,...(value?.corrections||[])]},createdId:item.id}
  }
  if(operation.type==='meeting.session.create'){
    const changedAt=nowIso(context.now||(()=>new Date())),meetingDate=payload.meetingDate||payload.endedAt.slice(0,10)
    const actions=(payload.actions||[]).map(item=>({id:createId(),text:item.text,owner:item.owner||'',due:item.due||'',meetingDate,financialEffect:item.financialEffect||'',status:'open',createdAt:changedAt,cadence:payload.cadence,createdBy:context.actor||'Household member'}))
    const corrections=(payload.corrections||[]).map(item=>({id:createId(),label:item.label,value:item.value,source:item.source||'Proposed',scope:item.scope||'this occurrence',reason:item.reason||'',origin:item.origin||'meeting transcript analysis',meetingDate,status:'proposed',createdAt:changedAt,cadence:payload.cadence,createdBy:context.actor||'Household member'}))
    const meeting={id:createId(),cadence:payload.cadence,startedAt:payload.startedAt,endedAt:payload.endedAt,summary:payload.summary||'',notes:payload.notes||'',transcript:payload.transcript||'',createdAt:changedAt,createdBy:context.actor||'Household member'}
    const current=value&&!Array.isArray(value)?value:{}
    return{before,after:{...current,openActions:[...actions,...(current.openActions||[])],corrections:[...corrections,...(current.corrections||[])],meetings:[meeting,...(current.meetings||[])]},createdId:meeting.id}
  }
  if(operation.type==='meeting.workspace.update'){
    const current=value&&!Array.isArray(value)?value:{}
    if(operation.targetId==='snapshot')return{before,after:{...current,snapshot:{...(current.snapshot||{}),...clone(payload)}}}
    const notes={...(current.cadenceNotes||{})},cadenceNotes={...(notes[payload.cadence]||{}),[payload.noteIndex]:payload.note}
    return{before,after:{...current,cadenceNotes:{...notes,[payload.cadence]:cadenceNotes}}}
  }
  if(operation.type==='meal.substitute'){
    const errors=validateMealSubstitution({date:operation.targetDate,mealType:payload.mealType,mealId:payload.mealId})
    if(errors.length)throw new Error(errors.join(' '))
    if(!value?.meals?.[payload.mealType])throw new Error('That meal-plan day is not available. Refresh Brevity and try again.')
    const changedAt=nowIso(context.now||(()=>new Date())),previousMealId=value.meals[payload.mealType]
    return{before,after:{...value,meals:{...value.meals,[payload.mealType]:payload.mealId},substitutions:{...(value.substitutions||{}),[payload.mealType]:{previousMealId,mealId:payload.mealId,changedAt,changedBy:context.actor||'Household member',actionId:operation.id}}}}
  }
  if (operation.type === 'decision.create') {
    const item = { id:createId(), title:payload.title || operation.description, notes:payload.notes || '', owner:payload.owner || 'Family', participants:payload.participants || [], status:payload.status || 'needs-decision', due:payload.date || operation.targetDate || '', createdAt:new Date().toISOString() }
    return { before, after:{ ...value, decisions:[...(value?.decisions || []), item] }, createdId:item.id }
  }
  if (operation.type === 'decision.update') {
    let found = false
    const next = { ...value, decisions:(value?.decisions || []).map(item => { if (item.id !== operation.targetId) return item; found = true; return mergeAllowed(item, payload) }) }
    if (!found) throw new Error('That decision no longer exists. Refresh Brevity and ask again.')
    return { before, after:next }
  }
  if (operation.type === 'assignment.create') {
    const item = { id:createId(), title:payload.title || operation.description, notes:payload.notes || '', owner:payload.owner || 'Family', participants:payload.participants || [], status:payload.status || 'pending', date:operation.targetDate || payload.date || '', priority:payload.priority || 'normal', calendarSync:false, createdAt:new Date().toISOString() }
    return { before, after:{ ...value, assignments:[...(value?.assignments || []), item] }, createdId:item.id }
  }
  if (operation.type === 'assignment.update') {
    let found = false
    const next = { ...value, assignments:(value?.assignments || []).map(item => { if (item.id !== operation.targetId) return item; found = true; return mergeAllowed(item, payload) }) }
    if (!found) throw new Error('That assignment no longer exists. Refresh Brevity and ask again.')
    return { before, after:next }
  }
  if (operation.type === 'project.create') {
    const changedAt=nowIso(context.now||(()=>new Date()))
    const projectFields={...clone(payload)}
    delete projectFields.date;delete projectFields.endDate;delete projectFields.owner
    const item = {
      id:createId(),type:'Renovation',room:'Kitchen',roomCustom:'',title:payload.title || operation.description,
      notes:'',status:'To Do',priority:'Medium',startDate:payload.date || operation.targetDate || '',
      due:payload.endDate || payload.date || operation.targetDate || '',estcost:'',actcost:'',
      raci:payload.raci || { responsible:payload.owner ? [payload.owner] : [], accountable:[], consulted:[], informed:[] },
      pushToFamilyCalendar:false,cname:'',cphone:'',cemail:'',caddress:'',bizLicense:false,coi:false,workersComp:false,
      photos:[],files:[],...projectFields,createdAt:changedAt,updatedAt:changedAt,updatedBy:context.actor||'Household member',
    }
    return { before, after:[...(Array.isArray(value) ? value : []), item], createdId:item.id }
  }
  if (operation.type === 'project.update') {
    let found = false
    const projectChanges = { ...payload }
    if (payload.date !== undefined) { projectChanges.startDate = payload.date; delete projectChanges.date }
    if (payload.endDate !== undefined) { projectChanges.due = payload.endDate; delete projectChanges.endDate }
    const changedAt=nowIso(context.now||(()=>new Date()))
    const after = (Array.isArray(value) ? value : []).map(item => { if (item.id !== operation.targetId) return item; found = true; return {...item,...clone(projectChanges),updatedAt:changedAt,updatedBy:context.actor||'Household member'} })
    if (!found) throw new Error('That project no longer exists. Refresh Brevity and ask again.')
    return { before, after }
  }
  if (operation.type === 'project.delete') {
    const projects=Array.isArray(value) ? value : []
    if (!projects.some(item => item.id === operation.targetId)) throw new Error('That project no longer exists. Refresh Brevity and ask again.')
    return { before, after:projects.filter(item => item.id !== operation.targetId) }
  }
  if (operation.type === 'transaction.categorize') {
    if (!operation.targetId || !payload.category) throw new Error('A transaction and category are required.')
    return { before, after:{ ...(value || {}), [operation.targetId]:{ ...(value?.[operation.targetId] || {}), id:operation.targetId, category:payload.category } } }
  }
  if (operation.type === 'transaction.update') {
    if (!operation.targetId) throw new Error('A bank transaction id is required.')
    const allowed={}
    for(const field of ['name','category'])if(payload[field]!==undefined)allowed[field]=clone(payload[field])
    return { before, after:{ ...(value || {}), [operation.targetId]:{ ...(value?.[operation.targetId] || {}), ...allowed, id:operation.targetId } } }
  }
  if (operation.type === 'transaction.rule.create') {
    const item={id:createId(),name:payload.title||`Categorize ${payload.matchText}`,createdDate:payload.createdDate,applyToExisting:false,conditions:{originalStatement:{on:true,value:payload.matchText},accounts:{on:Boolean(payload.accountId),value:payload.accountId||''}},actions:{updateCategory:{on:true,value:payload.category}},splits:[]}
    return {before,after:[...(Array.isArray(value)?value:[]),item],createdId:item.id}
  }
  if (operation.type === 'transaction.rule.delete') {
    const items=Array.isArray(value)?value:[]
    if(!items.some(item=>item.id===operation.targetId))throw new Error('That categorization rule no longer exists. Refresh Brevity and try again.')
    return {before,after:items.filter(item=>item.id!==operation.targetId)}
  }
  if (operation.type === 'budget.update') {
    if (operation.targetId !== payload.lineId) throw new Error('The reviewed budget line no longer matches the requested target.')
    return { before, after:applyBudgetTarget(value, payload) }
  }
  if (operation.type === 'forecast.update') {
    if (['model','planningExpense','expenseMode'].includes(operation.targetId)) {
      const after = { ...(value || {}) }
      if (payload.planningExpense !== undefined) after.planningExpense = Math.max(0, Number(payload.planningExpense) || 0)
      if (payload.expenseMode !== undefined) {
        if (!['scenario', 'operating'].includes(payload.expenseMode)) throw new Error('Forecast expense mode must be scenario or operating.')
        after.expenseMode = payload.expenseMode
      }
      return { before, after }
    }
    let found = false
    const after = { ...(value || {}), scenarios:(value?.scenarios || []).map(scenario => {
      if (scenario.id !== operation.targetId) return scenario
      found = true
      const next = { ...scenario }
      for (const field of ['title', 'description']) if (payload[field] !== undefined) next[field] = payload[field]
      if (payload.incomeId) {
        let incomeFound = false
        next.incomes = (scenario.incomes || []).map(income => {
          if (income.id !== payload.incomeId) return income
          incomeFound = true
          const updated = { ...income }
          for (const field of ['monthlyNet', 'annualGross', 'contribution', 'remote', 'employment', 'notes']) if (payload[field] !== undefined) updated[field] = payload[field]
          return updated
        })
        if (!incomeFound) throw new Error('That forecast income record no longer exists. Refresh Brevity and ask again.')
      }
      return next
    }) }
    if (!found) throw new Error('That forecast scenario no longer exists. Refresh Brevity and ask again.')
    return { before, after }
  }
  if (operation.type === 'finance.account.link') {
    const accounts = [...(value?.accounts || [])]
    const sourceId = String(payload.plaidAccountId || '')
    const original = accounts.find(account => account.id === operation.targetId)
    if (!original) throw new Error('That Brevity account no longer exists. Refresh Finance and review the current account list.')
    if (!sourceId) throw new Error('Choose a returned bank account before reviewing this link.')
    const alreadyUsed = accounts.find(account => account.id !== operation.targetId && account.plaidAccountId === sourceId)
    if (alreadyUsed) throw new Error(`That bank account is already linked to ${alreadyUsed.name || 'another Brevity account'}.`)
    if (original.plaidAccountId === sourceId) throw new Error('That bank account is already linked here. Refresh balances instead.')
    const sourceFields = ['plaidItemId','plaidName','plaidOfficialName','plaidType','plaidSubtype','institution','mask','plaidCurrentBalance','plaidAvailableBalance']
    const afterAccounts = accounts.map(account => {
      if (account.id !== operation.targetId) return account
      const next = { ...account, plaidAccountId:sourceId }
      sourceFields.forEach(field => { delete next[field] })
      return next
    })
    return { before, after:{ ...(value || {}), accounts:afterAccounts } }
  }
  if (operation.type === 'recurring.create') {
    const transactions = [...(value?.transactions || [])]
    const accounts = [...(value?.accounts || [])]
    const accountIds = new Set(accounts.map(item => item.id))
    if (!accountIds.has(payload.accountId)) throw new Error('That scheduled transaction account no longer exists. Refresh Brevity and review the current account list.')
    if (payload.transactionType === 'transfer' && !accountIds.has(payload.transferAccountId)) throw new Error('That scheduled transfer destination no longer exists. Refresh Brevity and review the current account list.')
    const item = {
      id:createId(),
      name:payload.title,
      amount:Number(payload.amount),
      type:payload.transactionType,
      freq:payload.frequency,
      start:payload.date || operation.targetDate,
      end:payload.endDate || '',
      cat:payload.transactionType === 'transfer' ? 'Transfer' : payload.category || 'Other',
      acct:payload.accountId,
      ...(payload.transactionType === 'transfer' ? { transferTo:payload.transferAccountId } : {}),
      ...(payload.notes ? { notes:payload.notes } : {}),
      skips:[],
    }
    return { before, after:{ ...(value || {}), transactions:[...transactions, item] }, createdId:item.id }
  }
  if (operation.type === 'recurring.update' || operation.type === 'recurring.delete') {
    const transactions = [...(value?.transactions || [])]
    const original = transactions.find(item => item.id === operation.targetId)
    if (!original) throw new Error('That recurring record no longer exists. Refresh Brevity and ask again.')
    if (!operation.targetDate) throw new Error('Choose the occurrence date for this recurring change.')
    const scope = operation.selectedScope === 'this-and-future' ? 'future' : 'one'
    if (operation.type === 'recurring.update' && original.freq !== 'once' && scope === 'one' && (payload.frequency !== undefined || payload.endDate !== undefined)) {
      throw new Error('Frequency and end-date changes must apply to this and future items.')
    }
    const recurringChanges = {}
    for (const field of ['amount', 'notes']) if (payload[field] !== undefined) recurringChanges[field] = payload[field]
    if (payload.title !== undefined) recurringChanges.name = payload.title
    if (payload.category !== undefined) recurringChanges.cat = payload.category
    if (payload.frequency !== undefined) recurringChanges.freq = payload.frequency
    if (payload.endDate !== undefined) recurringChanges.end = payload.endDate
    if (payload.transactionType !== undefined) recurringChanges.type = payload.transactionType
    if (payload.accountId !== undefined) recurringChanges.acct = payload.accountId
    if (payload.transferAccountId !== undefined) recurringChanges.transferTo = payload.transferAccountId
    if (payload.transactionType !== undefined && payload.transactionType !== 'transfer') recurringChanges.transferTo = ''
    const comparison = {
      amount:[Number(payload.amount), Number(original.amount)],
      notes:[String(payload.notes ?? ''), String(original.notes ?? '')],
      title:[String(payload.title ?? ''), String(original.name ?? '')],
      category:[String(payload.category ?? ''), String(original.cat ?? '')],
      frequency:[String(payload.frequency ?? ''), String(original.freq ?? '')],
      endDate:[String(payload.endDate ?? ''), String(original.end ?? '')],
      transactionType:[String(payload.transactionType ?? ''), String(original.type ?? '')],
      accountId:[String(payload.accountId ?? ''), String(original.acct ?? '')],
      transferAccountId:[String(payload.transferAccountId ?? ''), String(original.transferTo ?? '')],
      date:[String(payload.date ?? ''), String(operation.targetDate ?? '')],
    }
    const meaningfulChange = Object.keys(payload).some(field => comparison[field] && comparison[field][0] !== comparison[field][1])
    if (operation.type === 'recurring.update' && !meaningfulChange) throw new Error('That scheduled transaction already has the reviewed values. Refresh before preparing another change.')
    const accountIds = new Set((value?.accounts || []).map(item => item.id))
    if (payload.accountId !== undefined && !accountIds.has(payload.accountId)) throw new Error('That scheduled transaction account no longer exists. Refresh Brevity and review the current account list.')
    if (payload.transferAccountId && !accountIds.has(payload.transferAccountId)) throw new Error('That scheduled transfer destination no longer exists. Refresh Brevity and review the current account list.')
    const resultingType = recurringChanges.type ?? original.type
    const resultingAccount = recurringChanges.acct ?? original.acct
    const resultingTransferAccount = recurringChanges.transferTo ?? original.transferTo
    if (resultingType === 'transfer') {
      if (!resultingTransferAccount || resultingAccount === resultingTransferAccount) throw new Error('A scheduled transfer requires different source and destination accounts.')
      if (!accountIds.has(resultingAccount) || !accountIds.has(resultingTransferAccount)) throw new Error('The scheduled transfer account list changed. Refresh Brevity and review the current accounts.')
      if (payload.category !== undefined && payload.category !== 'Transfer') throw new Error('A scheduled transfer must use the Transfer category.')
      recurringChanges.cat = 'Transfer'
    } else if (payload.transferAccountId) {
      throw new Error('Only a forecast-only planned transfer can include a destination account.')
    }
    const destinationDate = payload.date || operation.targetDate
    const resultingEnd = recurringChanges.end !== undefined ? recurringChanges.end : original.end
    if (operation.type === 'recurring.update' && scope === 'future' && resultingEnd && resultingEnd < destinationDate && recurringChanges.freq !== 'once') {
      throw new Error('The reviewed series end date cannot be before its new effective date.')
    }
    if (payload.date !== undefined) recurringChanges.start = payload.date
    const result = operation.type === 'recurring.delete'
      ? deleteRecurringOccurrence(original, operation.targetDate, scope)
      : editRecurringOccurrence(original, recurringChanges, operation.targetDate, scope, createId, destinationDate)
    const deleteIds = new Set(result.deleteIds)
    const upserts = new Map(result.upserts.map(item => [item.id, item]))
    const afterTransactions = transactions.filter(item => !deleteIds.has(item.id) && !upserts.has(item.id))
    return { before, after:{ ...value, transactions:[...afterTransactions, ...upserts.values()] } }
  }
  throw new Error(`The ${operation.type} action is not supported by this executor.`)
}

const missingBlob=error=>error?.status===404||error?.statusCode===404||error?.name==='NotFoundError'
const readStoreEntry=async(store,key)=>{
  if(typeof store.getWithMetadata==='function')return store.getWithMetadata(key,{type:'json'}).catch(error=>{if(missingBlob(error))return null;throw error})
  const data=await store.get(key,{type:'json'}).catch(error=>{if(missingBlob(error))return null;throw error})
  return data==null?null:{data,etag:null}
}
const conditionalStoreJson=async(store,key,value,entry)=>{
  if(entry&&!entry.etag)throw Object.assign(new Error('Household data did not include a safe version marker. Refresh and review the current record before applying this action.'),{code:'VERSION_CONFLICT'})
  const options=entry?{onlyIfMatch:entry.etag}:{onlyIfNew:true}
  const result=await store.setJSON(key,value,options)
  if(result?.modified===false)throw Object.assign(new Error('Household data changed during this action. Refresh and review the newer version.'),{code:'VERSION_CONFLICT'})
  return result
}

export function createProductionActionResources({ now = () => new Date(), sharedStore, planStore, mealStore, sermonStore } = {}) {
  const shared = sharedStore || getStore({ name:SHARED_STORE, consistency:'strong', siteID:process.env.NETLIFY_SITE_ID, token:process.env.NETLIFY_TOKEN })
  const plans = planStore || getStore({ name:PLAN_STORE, consistency:'strong', siteID:process.env.NETLIFY_SITE_ID, token:process.env.NETLIFY_TOKEN })
  let meals = mealStore
  const mealStorage = () => meals || (meals=getStore({ name:MEAL_STORE, consistency:'strong', siteID:process.env.NETLIFY_SITE_ID, token:process.env.NETLIFY_TOKEN }))
  const sermons = sermonStore || plans
  const sharedKey = key => `${HOUSEHOLD_ID}/records/${key}`
  const planKey = date => `${HOUSEHOLD_ID}/daily-plans/${date}`
  const mealKey = date => `${HOUSEHOLD_ID}/days/${date}`
  const activeSermonKey = `${HOUSEHOLD_ID}/spiritual/active-sermon`
  return {
    async read(resource) {
      if (resource.startsWith('shared:')) { const key=resource.slice(7), entry=await readStoreEntry(shared,sharedKey(key)),record=entry?.data; return { value:record?.value ? JSON.parse(record.value) : key===SHARED_KEYS.finance?{accounts:[],transactions:[]}:key===SHARED_KEYS.overrides||key===SHARED_KEYS.budget?{}:[], version:Number(record?.version||0), record, etag:entry?.etag||null } }
      if (resource.startsWith('plan:')) {
        const date=resource.slice(5),entry=await readStoreEntry(plans,planKey(date)),value=entry?.data
        return { value:value||createEmptyDailyPlan(date), version:Number(value?.version||0), missing:!value, etag:entry?.etag||null }
      }
      if(resource.startsWith('meal:')){
        const date=resource.slice(5),entry=await readStoreEntry(mealStorage(),mealKey(date)),value=entry?.data
        const preview=value||createRollingMealDay(date,{householdId:HOUSEHOLD_ID,now:nowIso(now)})
        return{value:preview,version:Number(value?.version||0),missing:!value,etag:entry?.etag||null}
      }
      if(resource==='sermon:active'){
        const entry=await readStoreEntry(sermons,activeSermonKey),record=entry?.data
        return{value:record?.deleted?null:record||null,version:Number(record?.version||0),missing:!record||Boolean(record.deleted),record,etag:entry?.etag||null}
      }
      throw new Error(`Cannot read ${resource}.`)
    },
    async write(resource, value, expectedVersion, actor, mutationId = '') {
      const occurredAt=nowIso(now)
      if (resource.startsWith('shared:')) {
        const key=resource.slice(7), storageKey=sharedKey(key),entry=await readStoreEntry(shared,storageKey),current=entry?.data,version=Number(current?.version||0)
        if(version!==expectedVersion)throw Object.assign(new Error('Household data changed after your review. Refresh and try again.'),{code:'VERSION_CONFLICT'})
        const serialized=JSON.stringify(value), record={key,value:serialized,hash:hashValue(serialized),version:version+1,updatedAt:occurredAt,updatedBy:actor,...(current?.plaidAccountReceipt?{plaidAccountReceipt:current.plaidAccountReceipt}:{}),...(mutationId?{lastActionId:mutationId}:{})}
        await conditionalStoreJson(shared,storageKey,record,entry); return { version:record.version, value }
      }
      if(resource.startsWith('meal:')){
        const date=resource.slice(5),storageKey=mealKey(date),store=mealStorage(),entry=await readStoreEntry(store,storageKey),current=entry?.data,version=Number(current?.version||0)
        if(version!==expectedVersion)throw Object.assign(new Error('The meal plan changed after your review. Refresh and try again.'),{code:'VERSION_CONFLICT'})
        const record={...value,date,version:version+1,updatedAt:occurredAt,updatedBy:actor,lastActionId:mutationId||''}
        await conditionalStoreJson(store,storageKey,record,entry);return{version:record.version,value:record}
      }
      if(resource==='sermon:active'){
        const entry=await readStoreEntry(sermons,activeSermonKey),current=entry?.data,version=Number(current?.version||0)
        if(version!==expectedVersion)throw Object.assign(new Error('The active sermon changed after your review. Refresh and try again.'),{code:'VERSION_CONFLICT'})
        const record=value==null
          ?{version:version+1,deleted:true,updatedAt:occurredAt,updatedBy:actor,lastActionId:mutationId||''}
          :{...withoutManagedMetadata(value),version:version+1,updatedAt:occurredAt,updatedBy:actor,lastActionId:mutationId||''}
        await conditionalStoreJson(sermons,activeSermonKey,record,entry)
        return{version:record.version,value:record.deleted?null:record}
      }
      const date=resource.slice(5),storageKey=planKey(date),entry=await readStoreEntry(plans,storageKey),current=entry?.data,version=Number(current?.version||0)
      if(version!==expectedVersion)throw Object.assign(new Error('The daily plan changed after your review. Refresh and try again.'),{code:'VERSION_CONFLICT'})
      const record={...value,date,version:version+1,updatedAt:occurredAt,updatedBy:actor,...(mutationId?{lastActionId:mutationId}:{})}
      await conditionalStoreJson(plans,storageKey,record,entry); return {version:record.version,value:record}
    },
  }
}

const withoutManagedMetadata = value => {
  if(!value||Array.isArray(value)||typeof value!=='object')return value
  const result=clone(value)
  delete result.version
  delete result.updatedAt
  delete result.updatedBy
  delete result.lastActionId
  return result
}
export const sameResourceValue=(resource,left,right)=>JSON.stringify(resource.startsWith('plan:')||resource.startsWith('meal:')||resource==='sermon:active'?withoutManagedMetadata(left):left)===JSON.stringify(resource.startsWith('plan:')||resource.startsWith('meal:')||resource==='sermon:active'?withoutManagedMetadata(right):right)
export const resourceLastWriter=(resource,current)=>resource.startsWith('shared:')||resource==='sermon:active'?current?.record?.updatedBy:current?.value?.updatedBy
export const resourceLastActionId=(resource,current)=>resource.startsWith('shared:')||resource==='sermon:active'?current?.record?.lastActionId:current?.value?.lastActionId

export function assertExactExpectedVersions(proposal, operations = proposal?.operations || []) {
  const resources=new Set(operations.filter(operation=>!operation.type?.startsWith('calendar.')).map(resourceForOperation))
  for(const resource of resources){
    const hasVersion=Object.prototype.hasOwnProperty.call(proposal?.expectedVersions||{},resource)
    const version=proposal?.expectedVersions?.[resource]
    if(!hasVersion||typeof version!=='number'||!Number.isInteger(version)||version<0){
      throw Object.assign(new Error('This proposal does not retain an exact reviewed record version. Refresh and prepare a new Action Mode review.'),{code:'VERSION_CONFLICT'})
    }
  }
  return true
}

// Prepare every before/after image before the first mutation. The returned
// plan is safe to persist in the Action Mode recovery journal.
export async function prepareRecordOperations({ proposal, selections = {}, session, permissions, resources, now = () => new Date(), createId = randomUUID }) {
  const operations = proposal.operations.map(operation => selectedOperation(operation, selections[operation.id]))
  assertExactExpectedVersions(proposal,operations)
  const grouped = new Map()
  for (const operation of operations) {
    if (operation.type.startsWith('calendar.')) continue
    const resource = resourceForOperation(operation)
    if (!grouped.has(resource)) grouped.set(resource, [])
    grouped.get(resource).push(operation)
  }
  const prepared=[]
  for (const [resource, resourceOperations] of grouped) {
    const current=await resources.read(resource); let value=current.value
    const reviewedVersion=proposal.expectedVersions[resource]
    if(Number(current.version)!==reviewedVersion)throw Object.assign(new Error('Household data changed after your review. Refresh and try again.'),{code:'VERSION_CONFLICT'})
    for(const operation of resourceOperations){
      const record=recordForOperation(value,operation)
      const permission=permissionForOperation({operation,member:session.member,role:session.role,permissions,currentRecord:record})
      if(!permission.allowed)throw Object.assign(new Error(permission.reason),{code:'FORBIDDEN'})
      const result=applyRecordOperation(value,operation,createId,{now,actor:session.member,recordVersion:current.version}); value=result.after
    }
    prepared.push({resource,before:current.value,after:value,beforeVersion:current.version,afterVersion:current.version+1})
  }
  return {operations,prepared,preparedAt:nowIso(now)}
}

// A retry may arrive after storage accepted a conditional write but before
// the function persisted the journal's `mutated` state. In that case the
// exact version, writer marker, and planned value prove that this write is the
// one being recovered. Any other newer version remains a hard conflict.
export async function commitPreparedRecordOperations({ prepared = [], session, resources, mutationId = '' }) {
  const actor=`Ask Brevity · ${session.member}`
  const changes=[]
  for(const change of prepared){
    const current=await resources.read(change.resource)
    if(Number(current.version)===Number(change.beforeVersion)){
      const saved=await resources.write(change.resource,change.after,change.beforeVersion,actor,mutationId)
      changes.push({...change,after:saved.value,afterVersion:saved.version})
      continue
    }
    const recovered=Number(current.version)===Number(change.afterVersion)
      &&(mutationId?resourceLastActionId(change.resource,current)===mutationId:resourceLastWriter(change.resource,current)===actor)
      &&sameResourceValue(change.resource,current.value,change.after)
    if(!recovered)throw Object.assign(new Error('Household data changed while Action Mode was recovering. Refresh and review the newer version.'),{code:'VERSION_CONFLICT'})
    changes.push({...change,after:current.value,afterVersion:current.version})
  }
  return changes
}

export async function executeRecordOperations({ proposal, selections = {}, session, permissions, resources, now = () => new Date() }) {
  const plan=await prepareRecordOperations({proposal,selections,session,permissions,resources,now})
  const changes=await commitPreparedRecordOperations({prepared:plan.prepared,session,resources})
  return { operations:plan.operations, changes, executedAt:nowIso(now) }
}

export async function captureExpectedVersions(proposal, resources) {
  const expectedVersions={}
  for(const operation of proposal.operations){
    if(operation.type.startsWith('calendar.'))continue
    const resource=resourceForOperation(operation)
    if(expectedVersions[resource]===undefined){
      const version=(await resources.read(resource)).version
      if(typeof version!=='number'||!Number.isInteger(version)||version<0)throw Object.assign(new Error('Household data did not provide an exact version for Action Mode review.'),{code:'VERSION_CONFLICT'})
      expectedVersions[resource]=version
    }
  }
  return {...proposal,expectedVersions}
}
