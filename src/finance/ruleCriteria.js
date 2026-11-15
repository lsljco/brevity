// Shared by rule preview, saved-rule matching and server validation.
export const RULE_FIELDS = {originalStatement:'Original bank statement',merchantName:'Merchant name',amount:'Amount',direction:'Money direction',account:'Bank account'}
export const RULE_OPERATORS = {originalStatement:{contains:'Contains',exactly:'Exactly matches',starts:'Starts with'},merchantName:{contains:'Contains',exactly:'Exactly matches',starts:'Starts with'},amount:{equals:'Equals',greater:'Greater than',less:'Less than',between:'Between'},direction:{equals:'Is'},account:{equals:'Is'}}
export function normalizeRuleCriteria(criteria){
 if(!Array.isArray(criteria)||criteria.length<1||criteria.length>5)throw Error('Add between one and five criteria.')
 return criteria.map((c,i)=>{
  if(!c||typeof c!=='object'||Object.keys(c).some(k=>!['field','operator','value','max','join'].includes(k))||(!Object.hasOwn(RULE_OPERATORS,c.field)||!Object.hasOwn(RULE_OPERATORS[c.field],c.operator)))throw Error(`Choose a valid field and comparison for criterion ${i+1}.`)
  if(i>0&&!['and','or'].includes(c.join))throw Error('Choose AND or OR between criteria.')
  const result={field:c.field,operator:c.operator,join:i===0?'and':c.join}
  if(c.field==='amount'){
   const amount=v=>{if(!['string','number'].includes(typeof v)||String(v).trim()===''||!Number.isFinite(Number(v))||Number(v)<0)throw Error('Enter a non-negative dollar amount.');return Number(v)}
   result.value=amount(c.value)
   if(c.operator==='between'){result.max=amount(c.max);if(result.max<result.value)throw Error('The upper amount must be at least the lower amount.')}
  }else{
   if(typeof c.value!=='string'||!c.value.trim()||c.value.length>300)throw Error(`Enter a value for criterion ${i+1} (up to 300 characters).`)
   result.value=c.value.trim()
   if(c.field==='direction'&&!['income','expense'].includes(result.value))throw Error('Choose money in or money out.')
  }
  return result
 })
}
export function ruleAccountMatches(transaction,selected,accounts=[]){
 const account=accounts.find(a=>String(a.id)===String(selected))
 return [String(selected),String(account?.plaidAccountId||'')].filter(Boolean).includes(String(transaction.accountId||transaction.acct||''))
}
function matches(transaction,c,accounts){
 if(c.field==='account')return ruleAccountMatches(transaction,c.value,accounts)
 if(c.field==='direction'){const n=Number(transaction.amount);return Number.isFinite(n)&&(c.value==='income'?n<0:n>0)}
 if(c.field==='amount'){
  if(transaction.amount==null||transaction.amount==='')return false
  const n=Math.abs(Number(transaction.amount));if(!Number.isFinite(n))return false
  return c.operator==='equals'?n===c.value:c.operator==='greater'?n>c.value:c.operator==='less'?n<c.value:n>=c.value&&n<=c.max
 }
 const source=String(c.field==='merchantName'?(transaction.merchant_name||transaction.name||''):(transaction.originalStatement||transaction.original_description||transaction.name||'')).trim().toLowerCase(),value=c.value.toLowerCase()
 return c.operator==='exactly'?source===value:c.operator==='starts'?source.startsWith(value):source.includes(value)
}
export function matchesRuleCriteria(transaction,criteria,accounts=[]){
 let normalized;try{normalized=normalizeRuleCriteria(criteria)}catch{return false}
 let group=true,any=false
 for(const c of normalized){if(c.join==='or'){any=any||group;group=true}group=matches(transaction,c,accounts)&&group}
 return any||group
}
export function describeRuleCriteria(criteria,accounts=[]){
 let normalized;try{normalized=normalizeRuleCriteria(criteria)}catch{return 'Complete the criteria to preview this rule.'}
 const groups=[[]]
 for(const c of normalized){
  if(c.join==='or')groups.push([])
  const value=c.field==='account'?(accounts.find(a=>String(a.id)===c.value)?.name||c.value):c.field==='direction'?(c.value==='income'?'Money in':'Money out'):c.field==='amount'?`$${c.value.toFixed(2)}${c.operator==='between'?` and $${c.max.toFixed(2)}`:''}`:`“${c.value}”`
  groups.at(-1).push(`${RULE_FIELDS[c.field]} ${RULE_OPERATORS[c.field][c.operator].toLowerCase()} ${value}`)
 }
 return groups.map(g=>g.length>1?`(${g.join(' AND ')})`:g[0]).join(' OR ')
}
