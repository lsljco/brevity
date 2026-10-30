import {budgetCategoryForTransaction,isTransferTransaction} from './reportingData.js'
const clean=value=>String(value||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()
// Inference is deliberately reversible. Reviewed overrides and saved rules win.
export function categorizeExpense(transaction,{overrides={},scheduled=[],budget={}}={}) {
 if(Number(transaction.amount)<=0||isTransferTransaction(transaction))return transaction
 const manual=overrides[transaction.id]
 if(manual?.category||transaction._categoryResolved)return {...transaction,_categoryResolved:true,_categorySource:manual?.category?'reviewed':transaction._categorySource||'rule'}
 const merchant=clean(transaction.merchant_name||transaction.name)
 const past=Object.values(overrides).filter(t=>t.category&&t.category!=='Uncategorized'&&clean(t.merchant_name||t.name)===merchant)
 const prior=[...new Set(past.map(t=>t.category))]
 let category,reason
 if(prior.length===1){category=prior[0];reason='Matches your previously reviewed merchant category.'}
 else if(/\b(amazon|walmart|target|paypal|venmo|cash app)\b/.test(merchant)){category='Uncategorized';reason='This merchant serves multiple purposes. Choose a category or save a rule.'}
 else {
  const plans=scheduled.filter(p=>p.type==='expense'&&p.cat&&(transaction.vendorId&&p.vendorId===transaction.vendorId||clean(p.name)===merchant))
  const choices=[...new Set(plans.map(p=>p.cat))]
  if(choices.length===1){category=choices[0];reason='Matches the category of an existing plan.'}
  else if(/\b(chick fil a|mcdonalds|chipotle|restaurant|starbucks)\b/.test(merchant)){category='Dining Out';reason='Recognized restaurant or café.'}
  else if(/\b(fresh market|kroger|publix|aldi|trader joe|whole foods)\b/.test(merchant)){category='Groceries';reason='Recognized grocery merchant.'}
  else {category=budgetCategoryForTransaction(transaction);reason='Recognized bank category.';if(!category||category==='Other'||/^(general[ _]merchandise|shopping|unknown|uncategorized)$/i.test(String(transaction.category||''))){category='Uncategorized';reason='Not enough evidence to choose a category.'}}
 }
 // Preserve an existing broad Food plan until a separate child budget is used.
 if(['Dining Out','Groceries'].includes(category)&&scheduled.some(p=>p.cat==='Food')&&!scheduled.some(p=>p.cat===category)&&!Object.values(budget.categoryLimits||{}).some(e=>e.category===category))category='Food'
 return {...transaction,category,_categoryResolved:true,categoryReason:reason,categorySuggestion:category==='Uncategorized'?(transaction.category||''):undefined}
}

export function categorizeExpenses(transactions,options={}) {
 const overrides=Object.fromEntries(Object.entries(options.overrides||{}).map(([id,override])=>[id,{...transactions.find(t=>t.id===id),...override}]))
 return transactions.map(transaction=>categorizeExpense(transaction,{...options,overrides}))
}
