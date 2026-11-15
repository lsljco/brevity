import {transactionMatchesRule} from './transactionRules.js'
import {criteriaForSavedRule} from './ruleCriteria.js'
import {vendorForExpense} from './vendorModel.js'
const norm=value=>String(value||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()
const generic=new Set(['income','expense','payment','transfer','payroll','budget','monthly','weekly','bank','card','credit','debit','inc','llc','the'])
const meaningful=value=>norm(value).split(' ').filter(t=>t.length>2&&!generic.has(t))
const phrase=(text,value)=>{const n=norm(value);return meaningful(value).length>0&&(` ${norm(text)} `).includes(` ${n} `)}
const category=plan=>String(plan.cat||plan.category||'').trim()
const direction=tx=>Number(tx.amount)<0?'income':'expense'
const source=tx=>tx.originalStatement||tx.original_description||tx.name||''
const fingerprint=value=>JSON.stringify(value)

// Only identity evidence can suggest a category. Equal amounts alone never do.
export function buildRuleSuggestions({planned=[],transactions=[],rules=[],accounts=[],overrides={},directory={vendors:[],links:{}}}){
 const posted=transactions.filter(t=>!t.pending&&Number.isFinite(Number(t.amount))&&Number(t.amount)!==0)
 const vendors=(directory?.vendors||[]).filter(v=>!v.archived)
 const plans=planned.filter(p=>['income','expense'].includes(p.type)&&category(p)&&!p.deleted&&!p._deleted)
 const suggestions=new Map(),unresolved=[]
 for(const tx of posted){
  if(overrides[tx.id]?._deleted||overrides[tx.id]?.category&&overrides[tx.id].category!=='Uncategorized')continue
  const matching=rules.filter(r=>transactionMatchesRule(tx,{...r,applyToExisting:true},accounts))
  // Preserve explicit existing rule precedence. Never create a competing rule.
  if(matching.length){
   const rule=matching.at(-1)
   const hasPast=rule.applyToExisting||!rule.createdDate
   if(hasPast&&rule.actions?.assignVendor?.on&&rule.actions.assignVendor.value)continue
   let criteria;try{criteria=criteriaForSavedRule(rule)}catch{unresolved.push({transaction:tx,reason:'Existing rule needs manual review.'});continue}
   const value=rule.actions?.updateCategory?.value
   if(!value){unresolved.push({transaction:tx,reason:'Existing rule has no category assignment.'});continue}
   const plannedVendors=[...new Set(plans.filter(p=>category(p)===value&&p.type===direction(tx)).map(p=>p.vendorId).filter(id=>vendors.some(v=>v.id===id)))]
   const suggestedVendor=rule.actions?.assignVendor?.on?rule.actions.assignVendor.value:(plannedVendors.length===1?plannedVendors[0]:'')
   const id=`existing:${rule.id}`
   if(!suggestions.has(id))suggestions.set(id,{id,ruleId:rule.id,title:rule.name,criteria,category:value,vendorId:suggestedVendor,accountId:rule.conditions?.accounts?.on?rule.conditions.accounts.value:'',createdDate:rule.createdDate,reason:'Reuse your existing category rule, complete its vendor assignment, and include matching past posted transactions.',transactions:[],evidence:fingerprint(rule)})
   suggestions.get(id).transactions.push(tx);continue
  }
  const assigned=vendorForExpense(directory,'posted',tx)
  const candidatePlans=plans.filter(p=>{
   if(p.type!==direction(tx))return false
   if(p.acct&&!accounts.some(a=>a.id===p.acct&&(a.id===(tx.accountId||tx.acct)||a.plaidAccountId===(tx.accountId||tx.acct))))return false
   const vendor=vendors.find(v=>v.id===p.vendorId)
   return p.vendorId&&assigned===p.vendorId || [p.name,...(vendor?[vendor.name,...(vendor.aliases||[])]:[])].some(label=>phrase(source(tx),label)||phrase(tx.merchant_name,label))
  })
  const choices=new Map(candidatePlans.map(p=>[`${category(p)}|${p.vendorId||''}`,p]))
  if(choices.size!==1){unresolved.push({transaction:tx,reason:choices.size?'More than one projected category or vendor matches.':'No reliable identity match to a projected income or expense.'});continue}
  const plan=[...choices.values()][0]
  const vendorCandidates=vendors.filter(v=>v.id===plan.vendorId||v.id===assigned||[v.name,...(v.aliases||[])].some(label=>phrase(source(tx),label)||phrase(tx.merchant_name,label)))
  const vendor=vendors.find(v=>v.id===plan.vendorId)||(vendorCandidates.length===1?vendorCandidates[0]:null)
  // Exact observed identity plus direction and account is deliberately narrow.
  const field=tx.merchant_name?'merchantName':'originalStatement',value=tx.merchant_name||source(tx)
  if(!value||value.length>300){unresolved.push({transaction:tx,reason:'Statement text needs a shorter reviewed matching criterion.'});continue}
  const accountId=accounts.find(a=>a.id===(tx.accountId||tx.acct)||a.plaidAccountId===(tx.accountId||tx.acct))?.id
  if(!accountId){unresolved.push({transaction:tx,reason:'Link this bank account before suggesting a rule.'});continue}
  const criteria=[{field,operator:'exactly',value,join:'and'},{field:'direction',operator:'equals',value:direction(tx),join:'and'}]
  const id=fingerprint([criteria,accountId,category(plan),vendor?.id||''])
  if(!suggestions.has(id))suggestions.set(id,{id,criteria,category:category(plan),vendorId:vendor?.id||'',accountId,title:`${plan.name} categorization`,reason:`Matches projected ${plan.type}: ${plan.name}.`,transactions:[],evidence:fingerprint(plan)})
  suggestions.get(id).transactions.push(tx)
 }
 return {suggestions:[...suggestions.values()],unresolved,postedCount:posted.length}
}
export function suggestionOperation(row,today){
 if(!row.vendorId)throw Error('Choose a vendor or payer before approving this suggestion.')
 return {type:row.ruleId?'transaction.rule.update':'transaction.rule.create',...(row.ruleId?{targetId:row.ruleId}:{}),description:`${row.reason} Apply ${row.category} and the selected vendor to all matching past and future posted transactions.`,payload:{title:row.title,criteria:row.criteria,category:row.category,vendorId:row.vendorId,accountId:row.accountId,applyToExisting:true,createdDate:row.createdDate||today}}
}
