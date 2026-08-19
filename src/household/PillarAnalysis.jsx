import { useEffect, useState } from 'react'
import { generatePillarAnalysis } from './pillarAnalysisApi.js'
import { useDailyPlan } from './useDailyPlan.js'
import './PillarAnalysis.css'

function List({ items = [], empty = 'None identified.' }) {
  return items.length ? <ul>{items.map((item,index)=><li key={`${index}-${typeof item==='string'?item:item.title||item.owner}`}>{typeof item==='string'?item:item.title}</li>)}</ul> : <p className="pillar-analysis-empty">{empty}</p>
}

export default function PillarAnalysis({ pillar, currentMember = 'Larry' }) {
  const { plan, state:planState, error:planError } = useDailyPlan()
  const [result,setResult]=useState(null)
  const [state,setState]=useState('idle')
  const [error,setError]=useState('')

  const run = async force => {
    if (!plan?.date) return
    setState('loading'); setError('')
    try {
      const response = await generatePillarAnalysis({ pillar:pillar.id, date:plan.date, plan, currentMember, force })
      setResult(response)
      setState('ready')
    } catch (err) {
      setState('error'); setError(err.message || 'Could not generate this pillar analysis.')
    }
  }

  useEffect(()=>{ if(planState==='ready' && plan?.date) run(false) },[pillar.id,plan?.date,planState])

  const analysis=result?.analysis
  return <div className="pillar-analysis-page">
    <header className="pillar-analysis-hero">
      <div className="pillar-analysis-icon"><i className={`ti ${pillar.icon}`} /></div>
      <div className="pillar-analysis-title"><span>Seven Pillars · AI Analysis</span><h1>{pillar.label}</h1><p>{pillar.description}</p></div>
      <button type="button" className="pillar-analysis-refresh" disabled={state==='loading'||planState==='loading'} onClick={()=>run(true)}><i className="ti ti-refresh" /> {state==='loading'?'Analyzing…':'Refresh Analysis'}</button>
    </header>

    {planError && <div className="pillar-analysis-error">Household plan: {planError}</div>}
    {error && <div className="pillar-analysis-error">{error}</div>}
    {state==='loading' && !analysis && <div className="pillar-analysis-loading"><div className="pillar-analysis-pulse"/><h2>Analyzing {pillar.label}</h2><p>Applying the same Seven Pillars reasoning framework used by the household’s scheduled daily automation.</p></div>}

    {analysis && <>
      <section className="pillar-analysis-command"><div><span>Today’s Focus</span><h2>{analysis.headline}</h2><p>{analysis.executiveSummary}</p></div><aside><strong>{analysis.todayFocus}</strong><small>{result.cached?'Daily analysis cache':'Fresh AI analysis'} · {new Date(result.generatedAt).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})}</small></aside></section>

      <section className="pillar-analysis-section"><div className="pillar-analysis-heading"><span>Analysis</span><h2>What Matters Today</h2></div><div className="pillar-analysis-grid">{analysis.analysisPoints.map((item,index)=><article key={`${index}-${item.title}`}><span>{String(index+1).padStart(2,'0')}</span><h3>{item.title}</h3><p>{item.detail}</p></article>)}</div></section>

      <section className="pillar-analysis-two-column">
        <div className="pillar-analysis-section"><div className="pillar-analysis-heading"><span>Decision Board</span><h2>Decisions Required</h2></div><List items={analysis.decisions} empty="No decisions identified." /></div>
        <div className="pillar-analysis-section"><div className="pillar-analysis-heading"><span>Open Loop</span><h2>Confirm / Resolve</h2></div><List items={analysis.openItems} empty="No open items identified." /></div>
      </section>

      <section className="pillar-analysis-section"><div className="pillar-analysis-heading"><span>Ownership</span><h2>Who Does What</h2></div><div className="pillar-owner-grid">{analysis.owners.map((item,index)=><article key={`${index}-${item.owner}-${item.action}`}><strong>{item.owner}</strong><p>{item.action}</p><small>Evidence: {item.evidence}</small></article>)}</div></section>

      <section className="pillar-analysis-two-column">
        <div className="pillar-analysis-section"><div className="pillar-analysis-heading"><span>Family Alignment</span><h2>Discussion Prompts</h2></div><List items={analysis.discussionPrompts} /></div>
        <div className="pillar-analysis-section pillar-analysis-standard"><div className="pillar-analysis-heading"><span>Success Standard</span><h2>Done Means Done</h2></div><p>{analysis.successStandard}</p><blockquote>{analysis.governingPrinciple}</blockquote></div>
      </section>
    </>}
  </div>
}
