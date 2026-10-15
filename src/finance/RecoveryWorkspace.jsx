import {useEffect,useMemo,useState} from 'react'
import {Line} from 'react-chartjs-2'
import {RECOVERY_DEFAULT,RECOVERY_ID,projectRecovery,validateRecovery} from './recoveryScenario.js'
import {cashForecastScope} from './calendarSemantics.js'
import {buildOutstandingCashForecast} from './outstandingCashForecast.js'
import {getHouseholdDateKey} from './financeTime.js'
import {prepareDirectAction} from '../assistant/assistantApi.js'
import {requestActionReview} from '../assistant/actionEvents.js'
import {getAcknowledgedSharedStateVersion,SHARED_STATE_EVENT} from '../household/sharedState.js'
import {SCENARIO_STORAGE_KEY} from './scenarioModelingData.js'
import './RecoveryWorkspace.css'
const money=value=>value===null?'Unavailable':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(value)
const load=()=>{try{return JSON.parse(localStorage.getItem(SCENARIO_STORAGE_KEY)||'{}').recoveryPlans||[]}catch{return []}}
const variants=['baseline','conservative','expected','optimistic']
const colors=['#aaa69d','#bf9465','#72b6a3','#d7bd77']
const fields=[['monthlySurplus','Confirmed monthly surplus','number'],['paycheck','Net biweekly paycheck','number'],['monthlyIncome','Monthly payroll cap','number'],['firstPayDate','Hypothetical first payday','date'],['texasMonthly','Monthly Texas allocation','number'],['texasStart','Texas allocation begins','date'],['texasEnd','Texas allocation ends','date'],['contingency','Conservative monthly contingency','number'],['taxAmount','Property tax obligation','number'],['taxDate','Hypothetical tax payment date','date'],['relocation','One-time relocation cost','number'],['relocationDate','Relocation payment date','date'],['reserve','Minimum cash reserve','number'],['extraDebt','Maximum extra debt payment / month','number'],['start','Planning starts','date'],['end','Planning ends','date']]
export default function RecoveryWorkspace({financeData={accounts:[],transactions:[]},actuals=[],debts=[],freshness='',readOnly=false}){
  const [plans,setPlans]=useState(load),[id,setId]=useState(RECOVERY_ID)
  const saved=plans.find(p=>p.id===id)
  const [draft,setDraft]=useState(()=>load().find(p=>p.id===RECOVERY_ID)?.assumptions||{...RECOVERY_DEFAULT})
  const [variant,setVariant]=useState('expected'),[period,setPeriod]=useState('monthly'),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false)
  useEffect(()=>{const refresh=event=>{if(event.type==='storage'&&event.key&&event.key!==SCENARIO_STORAGE_KEY)return;if(event.type===SHARED_STATE_EVENT&&event.detail?.keys?.length&&!event.detail.keys.includes(SCENARIO_STORAGE_KEY))return;const next=load();setPlans(next);const plan=next.find(p=>p.id===id);if(plan)setDraft(plan.assumptions)};window.addEventListener(SHARED_STATE_EVENT,refresh);window.addEventListener('storage',refresh);return()=>{window.removeEventListener(SHARED_STATE_EVENT,refresh);window.removeEventListener('storage',refresh)}},[id])
  const source=useMemo(()=>{
    const scope=cashForecastScope(financeData.accounts,financeData.transactions)
    const today=getHouseholdDateKey()
    const days=Math.max(0,Math.ceil((Date.parse(`${draft.end}T12:00:00Z`)-Date.parse(`${today}T12:00:00Z`))/86400000))+2
    const forecast=buildOutstandingCashForecast(scope.accounts,scope.transactions,actuals,{today,days:Math.min(2200,Number.isFinite(days)?days:500),pastDays:0,reconcile:true})
    return {forecast,debts,scope,today,anchor:forecast.get(today)}
  },[financeData,actuals,debts,draft.end])
  const calculation=useMemo(()=>{try{
    const a=validateRecovery(draft)
    if(a.start<=source.today)throw Error('Choose a future planning start so projections cannot be mistaken for historical cash.')
    if(a.taxRecordId&&!source.scope.transactions.some(t=>t.id===a.taxRecordId&&t.type==='expense'))throw Error('The linked property tax obligation is no longer present; select its exact current record.')
    const projections=variants.map(v=>projectRecovery(a,source,v))
    return {projections,minimum:projectRecovery(a,source,variant,{minimumOnly:true})}
  }catch(e){return {error:e.message}}},[draft,source,variant])
  const result=calculation.projections?.find(p=>p.variant===variant)
  const dirty=JSON.stringify(saved?.assumptions)!==JSON.stringify(draft)
  const update=(key,value)=>{setDraft(d=>({...d,[key]:value}));setError('');setNotice('Unsaved hypothetical preview — operating records are unchanged.')}
  const save=async(copy=false)=>{
    if(readOnly||busy)return
    setBusy(true);setError('')
    try{
      const assumptions=validateRecovery(draft)
      const targetId=copy?`recovery-${crypto.randomUUID()}`:id
      const expectedVersion=getAcknowledgedSharedStateVersion(localStorage,SCENARIO_STORAGE_KEY)
      const response=await prepareDirectAction({summary:`Save hypothetical scenario: ${assumptions.title}`,expectedVersion,operation:{type:'forecast.update',targetId,payload:{recoveryJson:JSON.stringify(assumptions)},description:'Save named assumptions and a version in Scenario Modeling only. No budget, ledger, bank balance, or scheduled transaction changes.'}})
      if(!response?.proposal?.id)throw Error('No review proposal was returned.')
      requestActionReview(response.proposal);setNotice('Review opened. The scenario is saved only after approval. Operating finances remain unchanged.')
    }catch(e){setError(e.message)}finally{setBusy(false)}
  }
  const payPeriods=useMemo(()=>{
    if(!result)return []
    const groups=[]
    for(const row of result.daily){if(!groups.length||row.payday)groups.push({date:row.date,payroll:0,texas:0,tax:0,extraDebt:0,balance:null});const group=groups.at(-1);for(const key of ['payroll','texas','tax','extraDebt'])group[key]+=row[key];group.end=row.date;group.balance=row.balance}
    return groups
  },[result])
  return <section className="recovery-workspace" aria-labelledby="recovery-title">
    <header><p className="scenario-eyebrow">Scenario 001 · Hypothetical planning</p><h2 id="recovery-title">Household Financial Recovery</h2><p>{draft.start}–{draft.end}. Vizient employment, start date, and payroll are unconfirmed. No hypothetical income is realized cash.</p></header>
    <div className="recovery-status" role="note"><strong>{saved?`Saved version ${saved.version} · Owner: ${saved.owner}`:'Initial scenario template · not yet saved to the household'}</strong><p>{dirty?'Showing unsaved assumptions for comparison.':'Showing saved assumptions with current Finance inputs.'} Shared saves use Action Mode audit and Undo. Applying recommendations to operating records requires a separate explicit approval.</p></div>
    <div className="recovery-fields"><label>Named scenario<select value={id} onChange={e=>{setId(e.target.value);setDraft(plans.find(p=>p.id===e.target.value)?.assumptions||{...RECOVERY_DEFAULT})}}><option value={RECOVERY_ID}>Household Financial Recovery</option>{plans.filter(p=>p.id!==RECOVERY_ID).map(p=><option value={p.id} key={p.id}>{p.title}</option>)}</select></label><label>Scenario name<input readOnly={readOnly} value={draft.title} onChange={e=>update('title',e.target.value)}/></label><label>Baseline source<select disabled={readOnly} value={draft.baselineMode} onChange={e=>update('baselineMode',e.target.value)}><option value="confirmed">Confirmed surplus after bills and minimum debt</option><option value="live">Live scheduled Finance activity</option></select></label></div>
    <details><summary>Assumptions and timing</summary><div className="recovery-fields">{fields.map(([key,label,type])=><label key={key}>{label}<input readOnly={readOnly} type={type} step={type==='number'?'0.01':undefined} value={draft[key]} onChange={e=>update(key,type==='number'?Number(e.target.value):e.target.value)}/></label>)}<label>Debt strategy<select disabled={readOnly} value={draft.strategy} onChange={e=>update('strategy',e.target.value)}><option value="highest-rate">Avalanche · highest APR</option><option value="lowest-balance">Snowball · lowest balance</option></select></label><label>Existing property tax obligation<select disabled={readOnly} value={draft.taxRecordId} onChange={e=>update('taxRecordId',e.target.value)}><option value="">Unlinked — subtract modeled tax separately</option>{source.scope.transactions.filter(t=>t.type==='expense').map(t=><option value={t.id} key={t.id}>{t.name} · {t.id}</option>)}</select></label></div><p>When linked in live mode, the existing obligation’s amount and dates govern; modeled tax amount/date are ignored. Confirmed-surplus mode deducts the modeled tax separately. Ensure that obligation is outside your confirmed recurring surplus.</p><p>Texas costs and confirmed monthly surplus are spread evenly by calendar day for planning; use live mode for bill timing. Conservative/expected payroll is capped at the monthly allowance; optimistic includes every biweekly check. Extra debt payments occur at month-end. Minimum payments remain in the baseline; freed minimums are conservatively retained as expenses.</p></details>
    {!readOnly&&<div className="recovery-actions"><button disabled={busy||!dirty||Boolean(calculation.error)} onClick={()=>save()}>Review & save scenario</button><button disabled={busy||Boolean(calculation.error)} onClick={()=>save(true)}>Review named copy</button></div>}
    {(error||calculation.error)&&<p role="alert">{error||calculation.error}</p>}{notice&&<p role="status">{notice}</p>}
    <details><summary>Live sources and reconciliation isolation</summary><p>{freshness||'Bank freshness is not confirmed on this device.'} Scope: all checking and savings accounts. Existing Finance forecast supplies opening cash and recurring obligations. This workspace never writes to the ledger or reconciliation.</p><dl className="recovery-fields"><div><dt>Posted/current bank anchor</dt><dd>{money(source.anchor?.currentBalance??null)}</dd></div><div><dt>Available cash anchor</dt><dd>{money(source.anchor?.anchorBalance??null)}</dd></div><div><dt>Pending adjustment already applied</dt><dd>{money(source.anchor?.pendingDelta??null)}</dd></div><div><dt>Linked source records</dt><dd>{source.scope.accounts.length} accounts · {source.scope.transactions.length} scheduled · {debts.length} debts</dd></div></dl><p>Saved scenario versions contain assumptions only. Live balances and schedules can change the result without changing those assumptions.</p></details>
    {result&&<><div className="recovery-comparison">{calculation.projections.map((p,i)=><button key={p.variant} aria-pressed={variant===p.variant} onClick={()=>setVariant(p.variant)} style={{borderColor:colors[i]}}><strong>{p.variant}</strong><span>{money(p.months.at(-1)?.closing??null)}</span><small>Projected ending cash</small></button>)}</div><p>Steady-month expected surplus: <strong>{money(draft.monthlySurplus+draft.monthlyIncome-draft.texasMonthly)}</strong>. Conservative: <strong>{money(draft.monthlySurplus+draft.monthlyIncome-draft.texasMonthly-draft.contingency)}</strong>. These reference amounts assume two modeled checks; dated results below depend on first payday.</p>
    {result.warnings.map(w=><p className="recovery-warning" role="note" key={w}>{w}</p>)}
    <div className="recovery-chart"><Line data={{labels:result.months.map(m=>m.month),datasets:calculation.projections.map((p,i)=>({label:p.variant,data:p.months.map(m=>m.closing),borderColor:colors[i],backgroundColor:colors[i],pointRadius:2,tension:.15}))}} options={{maintainAspectRatio:false,plugins:{legend:{labels:{color:'#aaa69d'}}},scales:{y:{ticks:{callback:value=>money(value)}}}}}/></div>
    <div className="recovery-actions"><button aria-pressed={period==='monthly'} onClick={()=>setPeriod('monthly')}>Monthly forecast</button><button aria-pressed={period==='pay'} onClick={()=>setPeriod('pay')}>Pay-period forecast</button></div>
    <div className="recovery-table"><table><caption>{variant} · hypothetical {period==='monthly'?'monthly':'pay-period'} projections</caption><thead><tr><th>Period</th>{period==='monthly'&&<th>Baseline net</th>}<th>Payroll</th><th>Texas</th><th>Tax</th>{period==='monthly'&&<><th>Contingency</th><th>Relocation</th></>}<th>Extra debt</th><th>Ending cash</th>{period==='monthly'&&<th>Lowest daily cash</th>}</tr></thead><tbody>{period==='monthly'?result.months.map(m=><tr key={m.month}><th>{m.month}</th>{['baseline','payroll','texas','tax','contingency','relocation','extraDebt','closing','minimum'].map(k=><td key={k} className={m[k]<0?'negative':''}>{money(m[k])}</td>)}</tr>):payPeriods.map(p=><tr key={p.date}><th>{p.date} to {p.end}</th>{['payroll','texas','tax','extraDebt','balance'].map(k=><td key={k}>{money(p[k])}</td>)}</tr>)}</tbody></table></div>
    <h3>Debt repayment projection</h3><div className="recovery-chart"><Line data={{labels:result.months.map(m=>m.month),datasets:[{label:'Selected strategy',data:result.months.map(m=>m.debtBalance),borderColor:'#72b6a3',pointRadius:2},{label:'Minimum payments only',data:calculation.minimum.months.map(m=>m.debtBalance),borderColor:'#bf9465',pointRadius:2}]}} options={{maintainAspectRatio:false}}/></div><p>Additional payments are limited by available cash above the reserve. Interest is estimated monthly; compare with each lender’s terms. Savings below cover only the selected horizon.</p><dl className="recovery-fields"><div><dt>Projected interest</dt><dd>{money(result.totalInterest)}</dd></div><div><dt>Interest saved vs minimum-only</dt><dd>{money(result.totalInterest===null?null:calculation.minimum.totalInterest-result.totalInterest)}</dd></div><div><dt>Remaining debt</dt><dd>{money(result.remainingDebt)}</dd></div><div><dt>All-debt payoff</dt><dd>{result.payoffDate||'Not reached in selected horizon'}</dd></div></dl><ul>{result.completed.map(d=><li key={d.id}>{d.creditor}: {d.date}</li>)}</ul></>}
    <details><summary>Version history</summary>{saved?.history?.length?<ol>{[...saved.history].reverse().map(h=><li key={h.version}>Version {h.version} · {h.changedBy} · {h.changedAt}<button disabled={readOnly} onClick={()=>{setDraft(h.assumptions);setNotice('Historical assumptions loaded as an unsaved draft. Review to save a new version.')}}>Preview assumptions</button></li>)}</ol>:<p>Save through Action Mode to establish ownership and the first audited version.</p>}</details>
    <p>Ask Brevity by text or voice: “Change the Texas allocation in my recovery scenario to $6,000.” Saving assumptions and changing operating budgets are separate reviewed actions.</p>
  </section>
}
