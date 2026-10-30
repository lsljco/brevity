import {productionVendorRepository} from './vendor-store.mjs'
import {householdCashControls} from '../../src/finance/householdCashControls.js'
import {categorizeExpenses} from '../../src/finance/expenseCategorization.js'
import {createHash} from 'node:crypto'
import {loadFinancePacketSources} from './finance-packet-service.mjs'
import {buildUniquePlaidAccountMap} from '../../src/finance/calendarSemantics.js'
import {budgetCategoryForTransaction,isTransferTransaction} from '../../src/finance/reportingData.js'
import {categorizeExpense} from '../../src/finance/expenseCategorization.js'
import {buildMeetingPacket} from '../../src/finance/meetingPackets.js'

const cents=value=>Math.round(Number(value)*100)
const money=value=>value/100
const validDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(value||'')&&new Date(`${value}T12:00:00Z`).toISOString().slice(0,10)===value
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0,24)

// All aggregation runs over the complete authorized snapshot before pagination.
// The model receives evidence and totals, never responsibility for ledger arithmetic.
export function queryFinanceLedger(source,input={},today){
 const from=input.from||`${today.slice(0,7)}-01`,to=input.to||today
 if(!validDate(from)||!validDate(to)||from>to)throw Error('Choose valid ordered dates in YYYY-MM-DD format.')
 const accounts=source.accounts||[],map=buildUniquePlaidAccountMap(accounts)
 const ids=input.accountIds?.length?input.accountIds:[source.budgetLegacyAccountId].filter(Boolean)
 if(!ids.length||ids.some(id=>!accounts.some(a=>a.id===id)))throw Error('Choose confirmed account IDs from the account directory.')
 const selected=new Set(ids),status=input.status||'posted',limit=Math.min(100,Math.max(1,input.limit||50)),offset=input.offset||0
 if(!['all','posted','pending'].includes(status)||!Number.isInteger(offset)||offset<0)throw Error('Invalid transaction view or page offset.')
 const terms=String(input.search||'').trim().toLowerCase()
 const rows=[],unmapped=[],invalid=[]
 const available=source.transactionFreshnessStatus==='fresh'||(source.actuals||[]).length>0
 const replaced=new Set((source.actuals||[]).filter(t=>!t.pending&&t.pendingTransactionId).map(t=>t.pendingTransactionId)),seen=new Set()
 for(const original of source.actuals||[]){
  if(!original.id||seen.has(original.id)||original._deleted||replaced.has(original.id))continue
  seen.add(original.id)
  if(String(original.date)<from||String(original.date)>to)continue
  if(!map[original.accountId]){unmapped.push(original.id);continue}
  if(!selected.has(map[original.accountId]))continue
  if(status==='posted'&&original.pending||status==='pending'&&!original.pending)continue
  if(original.amount==null||original.amount===''||!Number.isFinite(Number(original.amount))){invalid.push(original.id);continue}
  const t=categorizeExpense(original,{overrides:source.overrides||{},scheduled:source.scheduled||[],budget:source.budget||{}})
  const transfer=isTransferTransaction(t),category=budgetCategoryForTransaction(t,{includeAllCredits:true})||t.category||'Uncategorized'
  const direction=transfer?'transfer':Number(t.amount)<0?'inflow':'expense'
  if(input.category&&String(category).toLowerCase()!==input.category.toLowerCase())continue
  if(input.direction&&input.direction!=='all'&&direction!==input.direction)continue
  if(terms&&![t.name,t.merchant_name,t.originalStatement,t.notes,...(t.tags||[])].some(v=>String(v||'').toLowerCase().includes(terms)))continue
  rows.push({id:t.id,date:t.date,accountId:map[t.accountId],name:t.name||'',merchant:t.merchant_name||t.merchantName||null,originalStatement:t.originalStatement||t.original_description||t.name||'',amount:Number(t.amount),direction,category,pending:Boolean(t.pending),notes:t.notes||'',tags:t.tags||[],goal:t.goal||'',categorySource:t._categorySource||'bank-or-reviewed'})
 }
 rows.sort((a,b)=>b.date.localeCompare(a.date)||a.id.localeCompare(b.id))
 const version=digest(rows)
 if(input.snapshot&&input.snapshot!==version)throw Error('The ledger changed between pages. Restart at offset zero to avoid skipping or double-counting records.')
 let inflows=0,outflows=0,expenses=0,transfersOut=0,transfersIn=0
 const categories={}
 for(const row of rows){const amount=cents(row.amount);if(amount>0)outflows+=amount;else inflows-=amount
  if(row.direction==='expense'){expenses+=amount;categories[row.category]=(categories[row.category]||0)+amount}
  if(row.direction==='transfer'){if(amount>0)transfersOut+=amount;else transfersIn-=amount}
 }
 return {state:available?'available':'unavailable',scope:{accounts:accounts.filter(a=>selected.has(a.id)).map(a=>({id:a.id,name:a.name})),from,to,status,category:input.category||null,search:terms||null,direction:input.direction||'all'},freshness:{status:source.transactionFreshnessStatus,checkedAt:source.transactionCheckedAt||null},coverage:{unmappedCount:unmapped.length,unmappedIds:unmapped.slice(0,100),invalidCount:invalid.length,invalidIds:invalid.slice(0,100),notice:'Unmapped records are excluded. Imported history may be incomplete; source freshness is not a bank statement reconciliation.'},totals:available?{transactionCount:rows.length,cashInflows:money(inflows),cashOutflows:money(outflows),netCashMovement:money(inflows-outflows),reportedExpenses:money(expenses),transferOutflows:money(transfersOut),transferInflows:money(transfersIn),categories:Object.fromEntries(Object.entries(categories).map(([k,v])=>[k,money(v)]))}:null,rows:rows.slice(offset,offset+limit),page:{offset,limit,snapshot:version,nextOffset:offset+limit<rows.length?offset+limit:null},notice:'Totals include every matching record, not only this page. Positive amounts are bank debits. Transfers affect cash movement but are excluded from reported expenses. Pending is separate from posted. No records or payments were changed.'}
}

export function createFinanceAssistantReader({load=loadFinancePacketSources,loadVendors=async()=>productionVendorRepository().read()}={}){
 return async(input,canonical)=>{
  if(canonical.access?.finance!==true)return {state:'forbidden',notice:'Financial reporting access is required.'}
  try{
   if(input.mode==='billing'){
    const record=await loadVendors()
    const vendors=(record.value?.vendors||[]).filter(v=>!v.archived&&(canonical.access.vendorAdmin===true||v.accessMembers?.includes(canonical.signedInMember)))
    return {state:'available',version:record.version,records:vendors.map(v=>({id:v.id,name:v.name,statementDate:v.statementDate||null,paymentDueDate:v.paymentDueDate||null,minimumDue:v.minimumDue??null,statementBalance:v.statementBalance??null,autopay:v.autopay||'unknown',hasProtectedLogin:Boolean(v.loginBlobId),supportingDocumentCount:(v.documents||[]).length})),notice:'Saved billing-cycle evidence, not live creditor balances. Missing fields are unknown. Verify statement date before relying on amounts. Login secrets are never returned to the assistant. No payments were scheduled.'}
   }
   const source=await load()
   if(input.mode==='controls')return {state:'available',controls:householdCashControls(source,{from:input.from||canonical.householdDate.slice(0,7)+'-01',to:input.to||canonical.householdDate})}
   source.actuals=categorizeExpenses(source.actuals||[],{overrides:source.overrides,scheduled:source.scheduled,budget:source.budget})
   if(input.mode==='accounts')return {state:'available',accounts:(source.accounts||[]).map(a=>({id:a.id,name:a.name,type:a.type,balance:a.balance??null})),balanceStatus:source.balanceDataStatus,checkedAt:source.balanceCheckedAt||null,defaultAccountId:source.budgetLegacyAccountId||null,notice:'Stored account balances are not guaranteed currently available cash. Personal account ownership must be confirmed.'}
   if(input.mode==='meeting'){
    const ids=input.accountIds?.length?input.accountIds:[source.budgetLegacyAccountId].filter(Boolean)
    if(!ids.length||ids.some(id=>!source.accounts.some(a=>a.id===id)))throw Error('Choose confirmed account IDs.')
    const selected=new Set(ids),accounts=source.accounts.filter(a=>selected.has(a.id)),scheduled=source.scheduled.filter(t=>selected.has(t.acct))
    return {state:'available',packet:buildMeetingPacket({...source,accounts,scheduled,cadence:input.cadence==='annual'?'yearly':input.cadence||'daily',mode:'current',now:new Date(`${canonical.householdDate}T12:00:00Z`)}),notice:'Calculated meeting draft from saved records. No meeting edits, assignments or payments were saved. Use prepare_action_review for requested supported writes.'}
   }
   return queryFinanceLedger(source,input,canonical.householdDate)
  }catch{return {state:'unavailable',notice:'The requested financial evidence could not be loaded or the query is invalid. Do not invent totals. Confirm account IDs, dates and snapshot before retrying.'}}
 }
}
