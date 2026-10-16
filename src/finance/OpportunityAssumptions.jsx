import {opportunityMonthly} from './opportunityIncome.js'
const money=n=>n===null?'Awaiting compensation':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(n)
export default function OpportunityAssumptions({value,onChange,readOnly}) {
  const edit=(key,next)=>onChange({...value,[key]:next})
  let income,error
  try{income=opportunityMonthly(value)}catch(e){error=e.message}
  return <section aria-label="October 15 opportunity assumptions">
    <h4>Opportunity income assumptions</h4>
    <p>Each cash flow row starts with the editable baseline surplus. These assumptions add one job’s estimated net income and deduct its added monthly costs during the selected months. Monthly averages do not establish paycheck or bonus dates.</p>
    <div className="recovery-fields">
      <label>Gross compensation<input readOnly={readOnly} type="number" min="0" step="0.01" value={value.gross??''} placeholder="Rate pending" onChange={e=>edit('gross',e.target.value===''?null:Number(e.target.value))}/></label>
      <label>Compensation basis<select disabled={readOnly} value={value.basis} onChange={e=>edit('basis',e.target.value)}><option value="hourly">Hourly rate</option><option value="annual">Annual total compensation</option></select></label>
      {value.basis==='hourly'&&<><label>Paid hours per week<input readOnly={readOnly} type="number" value={value.hours} onChange={e=>edit('hours',Number(e.target.value))}/></label><label>Paid weeks per year<input readOnly={readOnly} type="number" value={value.weeks} onChange={e=>edit('weeks',Number(e.target.value))}/></label></>}
      <label>Estimated take-home percentage<input readOnly={readOnly} type="number" step="0.001" min="0" max="100" value={value.retention*100} onChange={e=>edit('retention',Number(e.target.value)/100)}/></label>
      <label>Added monthly job costs<input readOnly={readOnly} type="number" min="0" step="0.01" value={value.costs} onChange={e=>edit('costs',Number(e.target.value))}/></label>
      <label>Opportunity income starts<input readOnly={readOnly} type="month" value={value.start} onChange={e=>edit('start',e.target.value)}/></label>
      <label>Renewals assumed through<input readOnly={readOnly} type="month" value={value.end} onChange={e=>edit('end',e.target.value)}/></label>
    </div>
    {error?<p role="alert">{error}</p>:<p>Estimated additional monthly net income: <strong>{money(income?.net??null)}</strong>. Added job costs: <strong>{money(value.costs)}</strong>. {income===null?'Enter compensation to calculate November onward; missing income is not treated as zero.':'The worksheet uses a Phoenix-derived take-home proxy; adjust it for your expected deductions.'}</p>}
  </section>
}
