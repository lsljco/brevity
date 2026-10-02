import { actualTransactionKind, budgetCategoryForTransaction } from './reportingData.js'
import { buildBudgetLines, budgetTargetForLine, buildLegacyBudgetOwners } from './budgetBreakdown.js'
import { calculateTransactionAmountForMonth } from './monthlyCashFlow.js'

const normalize = value => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const median = values => { const a = [...values].sort((a,b)=>a-b); return a.length ? (a[Math.floor((a.length-1)/2)] + a[Math.floor(a.length/2)])/2 : 0 }
const round = value => Math.round(value*100)/100
const iso = date => date.toISOString().slice(0,10)
const dayNumber = date => Date.parse(`${date}T12:00:00Z`)/86400000
export function discoveryMonths(today) {
  const [year,month] = today.split('-').map(Number)
  return Array.from({length:6},(_,i)=>iso(new Date(Date.UTC(year,month-7+i,1))).slice(0,7))
}
export function discoverRecurring(actuals=[], {today, accountMap={}}={}) {
  const months = discoveryMonths(today), currentMonth=today.slice(0,7), groups=new Map(), seen=new Set()
  const eligible=actuals.filter(row=>!row.pending && !row._deleted && row.date>=`${months[0]}-01` && row.date<=today && Number.isFinite(Number(row.amount)) && Number(row.amount)!==0)
  for(const tx of eligible) {
    if(tx.id && seen.has(tx.id))continue
    if(tx.id)seen.add(tx.id)
    const direction=actualTransactionKind(tx)
    if(!['income','expense'].includes(direction))continue
    const name=(tx.vendorId && tx.vendorName && tx.vendorName!=='Unassigned' ? tx.vendorName : tx.merchant_name || tx.name || '').trim()
    if(!name)continue
    const accountId=accountMap[tx.accountId] || ''
    const key=JSON.stringify([tx.vendorId || normalize(name),direction,tx.accountId || 'unmapped'])
    if(!groups.has(key))groups.set(key,{key,name,vendorId:tx.vendorId||'',direction,accountId,sourceAccountId:tx.accountId,category:budgetCategoryForTransaction(tx)||'Other',transactions:[]})
    groups.get(key).transactions.push(tx)
  }
  const suggestions=[]
  for(const group of groups.values()) {
    const history=months.map(month=>{const rows=group.transactions.filter(tx=>tx.date.startsWith(month));return{month,count:rows.length,total:round(rows.reduce((sum,tx)=>sum+Math.abs(Number(tx.amount)),0))}})
    const active=history.filter(row=>row.count), historical=group.transactions.filter(tx=>tx.date<`${currentMonth}-01`).sort((a,b)=>a.date.localeCompare(b.date))
    // Two months surface emerging patterns; never label them confirmed recurring bills.
    if(active.length<2)continue
    const dates=[...new Set(historical.map(tx=>tx.date))], gaps=dates.slice(1).map((date,i)=>dayNumber(date)-dayNumber(dates[i]))
    const biweekly=gaps.length>=5 && gaps.filter(gap=>gap>=12 && gap<=16).length/gaps.length>=0.8
    const weekly=gaps.length>=8 && gaps.filter(gap=>gap>=5 && gap<=9).length/gaps.length>=0.85
    const singleMonthly=active.every(row=>row.count===1)
    const days=historical.map(tx=>Number(tx.date.slice(8))), typicalDay=Math.round(median(days))
    const stableDay=singleMonthly && days.every(day=>Math.abs(day-typicalDay)<=3)
    const frequency=biweekly?'biweekly':weekly?'weekly':'monthly'
    const latest=historical.at(-1), periodTotals=active.map(row=>row.total), monthlyAmount=round(periodTotals.reduce((a,b)=>a+b,0)/active.length)
    const stableAmount=Math.max(...periodTotals)-Math.min(...periodTotals)<=Math.max(1,monthlyAmount*0.05)
    const amount=biweekly||weekly?round(median(historical.map(tx=>Math.abs(Number(tx.amount))))):stableAmount?active.at(-1).total:monthlyAmount
    const current=group.transactions.filter(tx=>tx.date.startsWith(currentMonth))
    let proposedDate=''
    if(biweekly||weekly) {
      const interval=biweekly?14:7
      let next=new Date(`${group.transactions.map(tx=>tx.date).sort().at(-1)}T12:00:00Z`)
      do{next.setUTCDate(next.getUTCDate()+interval)}while(iso(next)<today)
      proposedDate=iso(next)
    } else if(stableDay) {
      const [year,month]=today.split('-').map(Number)
      let offset=current.length?1:0
      const candidate=()=>{const last=new Date(Date.UTC(year,month+offset,0)).getUTCDate();return iso(new Date(Date.UTC(year,month-1+offset,Math.min(typicalDay,last))))}
      proposedDate=candidate()
      if(proposedDate<today){offset++;proposedDate=candidate()}
    }
    suggestions.push({...group,history,monthsSeen:active.length,confidence:active.length===6?'Strong':active.length>=4?'Likely':'Emerging',frequency,amount,monthlyAmount,stableAmount,proposedDate,typicalDay:stableDay?typicalDay:null,currentTotal:round(current.reduce((s,tx)=>s+Math.abs(Number(tx.amount)),0)),currentCount:current.length,multiple:active.some(row=>row.count>1),latestDate:latest.date})
  }
  return {months,suggestions:suggestions.sort((a,b)=>b.monthsSeen-a.monthsSeen||a.name.localeCompare(b.name)),observedMonths:months.filter(month=>eligible.some(tx=>tx.date.startsWith(month))).length}
}

export function recurringCoverage(suggestion,{scheduled=[],budget={},today,accountId=suggestion.accountId,legacyAccountId=''}={}) {
  const date=new Date(`${today.slice(0,7)}-01T12:00:00`), year=date.getFullYear(),month=date.getMonth()
  const sameName=name=>normalize(name)===normalize(suggestion.name)
  const matches=row=>row.type===suggestion.direction && String(row.acct)===String(accountId) && (suggestion.vendorId && row.vendorId?suggestion.vendorId===row.vendorId:sameName(row.vendorName)||sameName(row.name))
  const forecast=scheduled.filter(matches).filter(row=>(!row.end||row.end>=today))
  const lines=buildBudgetLines(scheduled,budget,{accountIds:new Set([accountId])}),owners=buildLegacyBudgetOwners(lines)
  const value=line=>{const target=budgetTargetForLine({budget,line,year,month,legacyYear:year,legacyAccountId,legacyOwners:owners});return target??line.transactions.reduce((sum,tx)=>sum+calculateTransactionAmountForMonth(tx,date),0)}
  const exact=lines.filter(line=>line.direction===suggestion.direction && (sameName(line.name)||(suggestion.vendorId && line.vendorId===suggestion.vendorId)))
  const category=lines.filter(line=>line.direction===suggestion.direction && line.category===suggestion.category && !exact.includes(line))
  return {forecast,exact,exactAmount:round(exact.reduce((sum,line)=>sum+value(line),0)),categoryAmount:round(category.reduce((sum,line)=>sum+value(line),0))}
}

export function discoveryBudgetLineId(suggestion,accountId) {
  const value=JSON.stringify([accountId,suggestion.key])
  let a=2166136261,b=5381
  for(const char of value){a=Math.imul(a^char.charCodeAt(0),16777619);b=Math.imul(b,33)^char.charCodeAt(0)}
  return `discovered:${(a>>>0).toString(36)}-${(b>>>0).toString(36)}`
}
