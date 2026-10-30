import {budgetCategoryForTransaction,isTransferTransaction} from './reportingData.js'

// Explain the existing reporting scope without guessing account ownership or
// reclassifying transfers. Values are cents until the presentation boundary.
export function budgetCoverage({rawActuals=[],includedActuals=[],accountMap={},accountIds=[],month,includeUnmapped=false}={}) {
 const selected=new Set(accountIds),final=new Map(includedActuals.map(t=>[t.id,t]))
 const groups=Object.fromEntries(['expenses','transfers','hidden','otherExcluded','pending','outside','unmapped','invalid'].map(k=>[k,{count:0,cents:0}]))
 let scopedPostedDebitCents=0
 const add=(key,cents)=>{groups[key].count++;groups[key].cents+=cents}
 for(const source of rawActuals){
  if(!String(source.date||'').startsWith(`${month}-`))continue
  const n=Number(source.amount)
  if(source.amount==null||source.amount===''||!Number.isFinite(n)){add('invalid',0);continue}
  if(n<=0)continue
  const amount=Math.round(n*100),mapped=accountMap[source.accountId]
  if(!mapped&&!source.pending)add('unmapped',amount)
  if(mapped&&!selected.has(mapped)){if(!source.pending)add('outside',amount);continue}
  if(!mapped&&!includeUnmapped)continue
  if(source.pending){add('pending',amount);continue}
  scopedPostedDebitCents+=amount
  const t=final.get(source.id)
  if(!t||t._deleted){add('hidden',amount);continue}
  const category=budgetCategoryForTransaction(t,{includeAllCredits:true})
  if(category&&category!=='Income')add('expenses',amount)
  else if(isTransferTransaction(t))add('transfers',amount)
  else add('otherExcluded',amount)
 }
 return {scopedPostedDebits:scopedPostedDebitCents/100,...Object.fromEntries(Object.entries(groups).map(([key,v])=>[key,{count:v.count,amount:v.cents/100}]))}
}

// A successfully refreshed empty ledger is zero activity; a missing snapshot is unknown.
export function hasBudgetActualsSnapshot(rawActuals = [], freshnessStatus = 'unknown') {
 return rawActuals.length > 0 || freshnessStatus === 'fresh'
}
