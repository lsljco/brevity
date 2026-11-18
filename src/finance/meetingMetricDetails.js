const known=value=>value!==null&&value!==undefined&&Number.isFinite(Number(value))
const round=value=>Math.round(value*100)/100
const cashRows=(packet)=> (packet.cashAccounts||[]).map(a=>({id:a.id,label:a.name||'Cash account',amount:a.balance,meta:'Selected account balance'}))
const ledgerRows=(items,kind)=>items.filter(t=>kind==='net'||t.kind===kind).map(t=>({id:t.id,label:t.title,amount:kind==='net'?-t.amount:Math.abs(t.amount),meta:[t.date,t.accountName,t.category,'Posted'].filter(Boolean).join(' · ')}))
function reconcile(rows,total,packet,path){
 if(!known(total))return []
 const difference=round(Number(total)-rows.reduce((sum,row)=>sum+Number(row.amount),0))
 if(difference){
  const adjustments=(packet.adjustments||[]).filter(a=>a.field?.startsWith(path)).map(a=>a.reason).filter(Boolean)
  rows.push({id:'reported-adjustment',label:'Reported adjustment',amount:difference,meta:adjustments.join(' · ')||'Reported total differs from the source records; review report adjustments.'})
 }
 return rows
}
export function meetingMetricDetails(packet,label,amount,type){
 const scope=packet.scope.map(a=>a.name||a.id).join(', ')||'No selected accounts'
 let period=packet.period,rows=[],note=''
 const due=packet.payables.filter(x=>x.status!=='Reconciled to posted charge'&&Number(x.amount)>0)
 const forecastRows=(items,sign=1)=>items.map(row=>({id:row.id,label:row.title,amount:sign*Number(row.amount),meta:[`Forecast: ${row.date}`,row.owner,row.status].filter(Boolean).join(' · ')}))
 if(label==='Open commitments'){
  rows=packet.openActions.map(a=>{
   const linked=[...packet.payables,...packet.projectedInflows].filter(row=>a.transactionId&&row.sourceId===a.transactionId)
   return {id:a.id,label:a.text,valueLabel:a.overdue?'Overdue':a.status||'Open',meta:[a.owner||'Owner not set',a.due?`Due: ${a.due}`:'Due date not set',a.financialEffect,...linked.map(row=>`Cash forecast: ${row.date} · ${row.title} · $${Number(row.amount).toFixed(2)}`),!linked.length&&(a.transactionId?'Linked cash entry has no occurrence in this forecast horizon.':'No linked cash forecast.')].filter(Boolean).join(' · ')}
  })
  note=`As of ${packet.asOf}. Cash forecast: ${packet.horizon.from} through ${packet.horizon.to}. Unlinked follow-ups do not reserve cash.`
 }else if(label==='Cash balance'){
  rows=reconcile(cashRows(packet),amount,packet,'cashBalance');note=`Account balances as of ${packet.asOf}; ${packet.sources.balanceDataStatus} bank snapshot.`
 }else if(label==='Due today / tomorrow'){
  rows=forecastRows(due);period=packet.horizon;note='Remaining scheduled payments. Bank activity already matched to a payment reduces its remaining forecast impact.'
 }else if(label==='Scheduled cash scenario'){
  rows=[...reconcile(cashRows(packet),packet.cashBalance,packet,'cashBalance'),...forecastRows(packet.projectedInflows),...forecastRows(due,-1)];period=packet.horizon;note='Cash balance + remaining projected inflows − remaining projected obligations. Pending holds can overlap; this is a planning scenario.'
 }else{
  const prior=label==='Prior-period net',kind=label==='Posted income'?'income':label==='Posted spending'?'expense':'net'
  if(prior)period=packet.period.prior
  rows=reconcile(ledgerRows(prior?packet.priorItems||[]:packet.postedItems||[],kind),amount,packet,prior?'prior/':'posted/')
  note=`${period.from} through ${period.to}. Posted transactions only; pending items and transfers excluded.${kind==='net'?' Inflows are positive and expenses are negative.':''} ${packet.sources.transactionFreshnessStatus} bank activity.`
 }
 return {label,amount,valueType:type==='count'?'count':'money',children:rows,note,source:scope,emptyMessage:known(amount)?'No records make up this value for the selected scope.':'This value is unavailable for the selected source coverage.'}
}
