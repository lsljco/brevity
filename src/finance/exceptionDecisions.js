import {buildAutoReconciliationReport} from './autoReconciliation.js'
export const EXCEPTION_DISMISSALS_KEY='brevity_exception_dismissals_v1'
export const canAcceptMatch=row=>!(row.plan.type==='expense'&&row.amountVariance<0)
export function buildExceptionMatchReport(input){
 const report=buildAutoReconciliationReport(input)
 const assessed=buildAutoReconciliationReport({...input,allowAmountVariance:true})
 const already=new Set([...report.suggestions,...report.ambiguous].map(row=>row.actual.id))
 const partial=assessed.suggestions.filter(row=>!canAcceptMatch(row)&&!already.has(row.actual.id))
 const partialIds=new Set(partial.map(row=>row.actual.id))
 return {...report,suggestions:[...report.suggestions,...partial],unresolved:report.unresolved.filter(row=>!partialIds.has(row.id))}
}
// Dismissal is presentation only. Changed evidence returns to review.
export function exceptionSignature(kind,row){
 return JSON.stringify(kind==='account'?[kind,row.sourceId,row.suggestion?.id,row.source?.institution,row.source?.mask,row.source?.type,row.source?.subtype]:[kind,row.id,row.evidence])
}
export function readExceptionDismissals(storage){
 try{const value=JSON.parse(storage.getItem(EXCEPTION_DISMISSALS_KEY)||'[]');return Array.isArray(value)?value.filter(v=>typeof v==='string'):[]}catch{return []}
}
export function dismissException(storage,previous,signature){
 const next=[...new Set([...previous,signature])].slice(-2000)
 try{storage.setItem(EXCEPTION_DISMISSALS_KEY,JSON.stringify(next))}catch{/* Current review remains usable if storage is full. */}
 return next
}
export function filterGroupTransactions(rows,{query='',status='all'}={}){
 const search=query.trim().toLowerCase()
 return rows.filter(row=>(status==='all'||(status==='pending')===Boolean(row.pending))&&(!search||[row.name,row.originalStatement,row.merchant_name,row.date,String(Math.abs(Number(row.amount)))].some(value=>String(value||'').toLowerCase().includes(search))))
}
