import FinanceExport from './FinanceExport.jsx'
import {financeReport} from './financeExportData.js'
import {useMemo} from 'react'
import {Line} from 'react-chartjs-2'
import {projectWorksheet} from './recoveryWorksheet.js'
import OpportunityAssumptions from './OpportunityAssumptions.jsx'
const money=value=>value===null?'Awaiting compensation':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(value)
export default function RecoveryWorksheet({worksheet,onChange,readOnly}) {
  const result=useMemo(()=>{try{return projectWorksheet(worksheet)}catch(error){return {error:error.message}}},[worksheet])
  const edit=(id,key,value)=>onChange({...worksheet,rows:worksheet.rows.map(row=>row.id===id?{...row,[key]:value}:row)})
  return <section aria-label="Source worksheet plan"><FinanceExport report={financeReport('Recovery worksheet',result,['Source worksheet calculations; not bank ledger balances.'])}/>
    <p role="note">Hypothetical worksheet · opening funds replace the live cash anchor for this plan. They are not added to bank balances. Month-level ordering follows the supplied sheet; it does not verify receipts or payment dates. Income, Texas allocations, taxes and payoffs are included only where shown in the rows below.</p>
    <details open><summary>Source interpretation and uncertainties</summary><p>{worksheet.sourceNotes}</p></details>
    {worksheet.opportunity&&<OpportunityAssumptions value={worksheet.opportunity} readOnly={readOnly} onChange={opportunity=>onChange({...worksheet,opportunity})}/>}
    {result.error?<p role="alert">{result.error}</p>:<>
      <dl className="recovery-fields"><div><dt>Opening planning funds</dt><dd>{money(result.opening)}</dd></div><div><dt>Modeled obligations</dt><dd>{money(result.obligations)}</dd></div><div><dt>Ending planning balance</dt><dd>{money(result.closing)}</dd></div></dl>
      {result.negative&&<p role="alert">The worksheet balance falls below zero.</p>}
      {result.incomePending&&<p role="status">Compensation is missing. Balances from the opportunity’s start month are unavailable until a rate is supplied.</p>}
      <div className="recovery-chart"><Line data={{labels:result.rows.map(r=>`${r.month||'Opening'} · ${r.label}`),datasets:[{label:'Hypothetical running balance',data:result.rows.map(r=>r.balance),borderColor:'#d7bd77',pointRadius:3}]}} options={{maintainAspectRatio:false,plugins:{legend:{labels:{color:'#aaa69d'}}}}}/></div>
      <div className="recovery-table"><table><caption>Source worksheet · amounts, running balances and strategies</caption><thead><tr><th>Month</th><th>Item</th><th>Amount</th><th>Balance</th><th>Financial strategy</th><th>Household strategy / timing</th></tr></thead><tbody>{result.rows.map(row=><tr key={row.id}><th>{row.month||'Opening'}</th><td>{row.label}</td><td>{money(row.amount)}</td><td className={row.balance<0?'negative':''}>{money(row.balance)}</td><td className="worksheet-note">{row.financialStrategy||'—'}</td><td className="worksheet-note">{row.householdStrategy||'—'}</td></tr>)}</tbody></table></div>
    </>}
    <details><summary>Edit worksheet amounts and strategy notes</summary><p>Edits remain an unsaved hypothetical draft until reviewed. Dates here are planning months, not scheduled transactions.</p>{worksheet.rows.map(row=><fieldset className="worksheet-editor" key={row.id}><legend>{row.label}</legend><div className="recovery-fields"><label>Item name<input readOnly={readOnly} value={row.label} onChange={e=>edit(row.id,'label',e.target.value)}/></label>{row.kind!=='opening'&&<label>Planning month<input readOnly={readOnly} type="month" value={row.month} onChange={e=>edit(row.id,'month',e.target.value)}/></label>}<label>{worksheet.opportunity&&row.kind==='cashflow'?'Baseline surplus before opportunity':'Planning amount'}<input readOnly={readOnly} type="number" step="0.01" value={row.amount} onChange={e=>edit(row.id,'amount',Number(e.target.value))}/></label><label>Financial strategy<textarea readOnly={readOnly} value={row.financialStrategy} onChange={e=>edit(row.id,'financialStrategy',e.target.value)}/></label><label>Household strategy / timing<textarea readOnly={readOnly} value={row.householdStrategy} onChange={e=>edit(row.id,'householdStrategy',e.target.value)}/></label></div></fieldset>)}</details>
  </section>
}
