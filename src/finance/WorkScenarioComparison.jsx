import {Line} from 'react-chartjs-2'
import {WORK_SCENARIOS,createWorkScenario,summarizeWorkScenario} from './workScenarios.js'
import {OPPORTUNITY_SCENARIOS} from './opportunityIncome.js'
const money=n=>n===null?'Awaiting compensation':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(n)
export default function WorkScenarioComparison({plans,selected,draft,onSelect}) {
  const opportunities=OPPORTUNITY_SCENARIOS.some(s=>s.id===selected)
  const comparisons=(opportunities?OPPORTUNITY_SCENARIOS:WORK_SCENARIOS).map(config=>{
    const assumptions=selected===config.id?draft:(plans.find(p=>p.id===config.id)?.assumptions||createWorkScenario(config.id))
    try{return {...config,...summarizeWorkScenario(assumptions),saved:plans.some(p=>p.id===config.id)}}catch{return {...config,error:true}}
  })
  const months=[...new Set(comparisons.flatMap(s=>s.monthly?[...s.monthly.keys()]:[]))].sort()
  return <section aria-label="Return-to-work scenario comparison">
    <h3>{opportunities?'October 15 opportunity models':'Your return-to-work scenarios'}</h3>
    <div className="recovery-actions"><button aria-pressed={!opportunities} onClick={()=>onSelect(WORK_SCENARIOS[0].id)}>Household scenarios</button><button aria-pressed={opportunities} onClick={()=>onSelect(OPPORTUNITY_SCENARIOS[0].id)}>October 15 opportunities</button></div>
    <p>October 2026–December 2027 · each plan starts with $17,000 of worksheet opening funds. Compare monthly household surplus, taxes and planned debt payoffs. All amounts are hypothetical.</p>
    <div className="recovery-comparison work-scenario-comparison">{comparisons.map(s=><button key={s.id} aria-pressed={selected===s.id} onClick={()=>onSelect(s.id)}><strong>{s.title}</strong>{s.error?<small>Check worksheet inputs</small>:<><span>{money(s.monthlyBefore)}</span><small>{opportunities?'November surplus including modeled job':`Monthly surplus ${s.allocation?'before Texas':'after recurring bills'}`}</small>{s.allocation>0&&<small>Texas: −{money(s.allocation)} · Available: {money(s.monthlyAfter)}</small>}<span>{money(s.closing)}</span><small>December 2027 cash after planned payoffs</small><small>{s.incomePending?'Rate needed to assess cash shortfalls':s.negative?'Cash shortfall under this payoff schedule':'No modeled cash shortfall'}</small><small>{s.saved?'Saved scenario':'Worksheet template · review to save'}</small></>}</button>)}</div>
    <div className="recovery-chart"><Line data={{labels:months,datasets:comparisons.filter(s=>!s.error).map((s,i)=>({label:s.title,data:months.map(m=>s.monthly.get(m)??null),borderColor:['#bf9465','#aaa69d','#d7bd77','#72b6a3','#83a8c9','#bd97b6','#caa689','#a4b675'][i],pointRadius:2}))}} options={{maintainAspectRatio:false,plugins:{legend:{labels:{color:'#aaa69d'}}},scales:{y:{ticks:{callback:value=>money(value)}}}}}/></div>
    <p>{opportunities?'Alternative jobs for Larry, each added to the $6,604.09 baseline. Full-month income begins November 2026; renewals are assumed through December 2027. Net pay uses the worksheet’s estimated take-home percentage. Wipro includes bonus averaged monthly. No Lorenzo income or Texas costs are added to these eight models.':'Vizient includes $15,000 net wages and a separate $7,500 Texas allocation. Its chart uses the $22,104.09 household surplus after Texas, not the $29,604.09 subtotal. Income and Texas costs begin together.'}</p>
  </section>
}
