const normalized=value=>String(value||'').toLowerCase().replace(/[^a-z0-9]/g,'')
// A bank-supplied merchant name is evidence. Raw statement descriptions are not
// guessed into merchant identities, and reviewed directory links take priority.
export function merchantIdentity(tx={}){
 if(tx.vendorId)return {key:`vendor:${tx.vendorId}`,name:tx.vendorName||'Linked vendor',source:'Reviewed vendor link'}
 const name=String(tx.merchant_name||tx.merchantName||'').trim()
 return name?{key:`merchant:${normalized(name)}`,name,source:'Bank-supplied merchant'}:null
}
export function transactionVendorHistory(tx,transactions=[]){
 const identity=merchantIdentity(tx)
 if(!identity)return {identity:null,rows:[],otherExpenses:0,months:[]}
 const seen=new Set(),replaced=new Set(transactions.filter(t=>!t.pending&&t.pendingTransactionId).map(t=>t.pendingTransactionId))
 const rows=transactions.filter(t=>{
  if(!t.id||t._deleted||seen.has(t.id)||replaced.has(t.id)||merchantIdentity(t)?.key!==identity.key)return false
  seen.add(t.id);return true
 }).sort((a,b)=>String(b.date).localeCompare(String(a.date)))
 const months=new Map()
 for(const t of rows){
  if(t.pending||!Number.isFinite(Number(t.amount)))continue
  const key=String(t.date||'').slice(0,7);if(!/^\d{4}-\d{2}$/.test(key))continue
  const m=months.get(key)||{month:key,count:0,expenses:0,credits:0}
  if(Number(t.amount)>0){m.count++;m.expenses+=Math.round(Number(t.amount)*100)}else m.credits+=Math.round(-Number(t.amount)*100)
  months.set(key,m)
 }
 return {identity,rows,otherExpenses:rows.filter(t=>t.id!==tx.id&&!t.pending&&Number(t.amount)>0).length,months:[...months.values()].sort((a,b)=>b.month.localeCompare(a.month)).map(m=>({...m,average:m.count?m.expenses/100/m.count:0,expenses:m.expenses/100,credits:m.credits/100}))}
}
