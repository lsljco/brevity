import {normalizeMerchantName} from './financialTruth.js'

// Household plan prefixes identify the contributor, not the destination account.
const contributors={NS:'Nyla',LJ:'Larry',LS:'Lorenzo',TS:'Terica',JS:'Javin'}
const ignored=new Set(['income','transfer','payroll','salary','deposit','payment','credit','debit','funds','direct','bank','checking','savings','account','pending','telephone','online','monthly','weekly','family','household','severance'])
const words=text=>normalizeMerchantName({name:String(text||'').replace(/(\d)([a-z])/ig,'$1 $2').replace(/['’]s\b/g,'')}).split(' ').filter(Boolean)
export const bankDescriptions=actual=>[actual.name,actual.merchant_name,actual.originalStatement,actual.original_description].filter(Boolean)
export function incomeSourceMatches(plan,actual,{allowContributor=true}={}){
 if(plan.type!=='income'||Number(actual.amount)>=0)return false
 const owner=plan.owner||contributors[String(plan.name||'').match(/^([A-Z]{2})\b/)?.[1]]
 const planWords=words(plan.name).filter(w=>w.length>=4&&!/\d/.test(w)&&!ignored.has(w)&&!Object.values(contributors).some(n=>n.toLowerCase()===w))
 return bankDescriptions(actual).some(description=>{
  const tokens=words(description), normalized=tokens.join(' ')
  if(/\b(refund|reversal)\b/.test(normalized))return false
  // A named payroll contribution can arrive as an internal bank transfer.
  // This links cash arrival only; it never reclassifies transfers as earned income.
  if(allowContributor&&owner&&/\b(payroll|salary)\b/.test(normalized)&&tokens.some(w=>w===String(owner).toLowerCase()||w===`${String(owner).toLowerCase()}s`))return true
  const phrases=new Set(tokens.flatMap((_,i)=>[tokens[i],tokens.slice(i,i+2).join(''),tokens.slice(i,i+3).join('')]))
  return planWords.length>0&&planWords.every(w=>phrases.has(w))
 })
}
export function withinCashMatchTolerance(plan,actual){
 const planned=Math.round(Math.abs(Number(plan.amount))*100),amount=Math.round(Math.abs(Number(actual.amount))*100)
 return planned>0&&Math.abs(amount-planned)<=Math.max(200,Math.min(2500,Math.round(planned*.02)))
}
