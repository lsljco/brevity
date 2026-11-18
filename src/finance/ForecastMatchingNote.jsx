import {reconciliationStateLabel} from './reconciliation.js'
import {fmtMoney} from './projection.js'

export function forecastMatchingRows(rows,transaction,kind='actual') {
  const same=item=>item===transaction||Boolean(item?.id&&transaction?.id&&item.id===transaction.id)
  return (rows||[]).filter(row=>same(row[kind])||(kind==='actual'?row.candidates:row.expectedCandidates)?.some(same))
}

export default function ForecastMatchingNote({rows,transaction,kind='actual'}) {
  return forecastMatchingRows(rows,transaction,kind).map((row,index)=><p key={index} style={{margin:'4px 0 0',fontSize:11,color:row.state==='matched'?'#7DCBA4':'var(--muted)'}}>
    {row.approved?'Approved match':row.state==='unplanned-actual'?'Outside plan':reconciliationStateLabel(row.state)}
    {row.expected&&row.actual&&<> · Planned {fmtMoney(row.expected.expectedAmount)} · Bank {fmtMoney(Math.abs(Number(row.actual.amount)))}{row.amountVariance!==0&&<> · Difference {fmtMoney(row.amountVariance)}</>}{row.timingVariance>0&&<> · Posted {row.actual.date}</>}</>}
  </p>)
}
