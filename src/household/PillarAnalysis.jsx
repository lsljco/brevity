import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { collectPillarContext, generatePillarAnalysis, PILLAR_ANALYSIS_EVENT, pillarAnalysisContextSignature, readPillarAnalysis } from './pillarAnalysisApi.js'
import { useDailyPlan } from './useDailyPlan.js'
import SermonRepository from './SermonRepository.jsx'
import './PillarAnalysis.css'

function List({ items = [], empty = 'Nothing needs special attention.' }) {
  return items.length ? <ul>{items.map((item,index)=><li key={`${index}-${typeof item==='string'?item:item.title||item.owner}`}>{typeof item==='string'?item:item.title}</li>)}</ul> : <p className="pillar-analysis-empty">{empty}</p>
}
const sameMember = (left, right) => String(left || '').trim().toLowerCase() === String(right || '').trim().toLowerCase()

export default function PillarAnalysis({ pillar, currentMember = 'Larry' }) {
  const { plan, state:planState, error:planError } = useDailyPlan()
  const [result,setResult]=useState(null)
  const [state,setState]=useState('idle')
  const [error,setError]=useState('')
  const [contextRevision,setContextRevision]=useState(0)
  const planRef=useRef(plan)
  const inFlightRef=useRef('')
  const requestSequenceRef=useRef(0)
  planRef.current=plan
  const contextSignature=useMemo(()=>pillarAnalysisContextSignature({pillarData:plan?.[pillar.id] || {},localContext:collectPillarContext(pillar.id)}),[contextRevision,pillar.id,plan])

  const run = useCallback(async force => {
    const currentPlan=planRef.current
    if (!currentPlan?.date) return
    const localContext=collectPillarContext(pillar.id)
    const requestContextSignature=pillarAnalysisContextSignature({pillarData:currentPlan[pillar.id] || {},localContext})
    const requestKey=`${pillar.id}:${currentPlan.date}:${currentMember}:${requestContextSignature}`
    if(inFlightRef.current===requestKey)return
    const requestSequence=++requestSequenceRef.current
    inFlightRef.current=requestKey
    setState('loading'); setError('')
    try {
      const response = await generatePillarAnalysis({ pillar:pillar.id, date:currentPlan.date, plan:currentPlan, currentMember, force, localContext })
      if(!response || requestSequenceRef.current!==requestSequence)return
      setResult(response)
      setState('ready')
    } catch (err) {
      if(requestSequenceRef.current!==requestSequence)return
      setState('error'); setError(err.message || 'Could not generate this pillar analysis.')
    } finally {
      if(inFlightRef.current===requestKey)inFlightRef.current=''
    }
  }, [currentMember, pillar.id])

  useEffect(()=>{
    const refresh=()=>setContextRevision(value=>value+1)
    const storageRefresh=event=>{if(!event.key||['lslj_finance_v9','plaid_actuals_cache','lslj_budget_v1','lslj_actuals_v1','lslj_tx_overrides_v1','lslj_tx_rules_v1','fp_goals','homehq_items_v1','family_calendar_events_v1','brevity_icloud_calendar_cache_v1','brevity_household_maintenance_v1','brevity_household_inventory_v1','brevity_household_schedule_v1'].includes(event.key))refresh()}
    window.addEventListener('brevity-app-refreshed',refresh)
    window.addEventListener('brevity-shared-state-updated',refresh)
    window.addEventListener('brevity-icloud-calendar-refreshed',refresh)
    window.addEventListener('brevity-family-calendar-updated',refresh)
    window.addEventListener('storage',storageRefresh)
    return()=>{window.removeEventListener('brevity-app-refreshed',refresh);window.removeEventListener('brevity-shared-state-updated',refresh);window.removeEventListener('brevity-icloud-calendar-refreshed',refresh);window.removeEventListener('brevity-family-calendar-updated',refresh);window.removeEventListener('storage',storageRefresh)}
  },[])

  useEffect(()=>{
    if(planState!=='ready' || !plan?.date) return
    const cached = readPillarAnalysis(plan.date, pillar.id, currentMember, globalThis.localStorage, contextSignature)
    if (cached) { setResult(cached); setState('ready'); return }
    run(false)
  },[contextRevision,contextSignature,currentMember,pillar.id,plan,planState,run])

  useEffect(()=>{
    const receive = event => {
      if (event.detail?.pillar !== pillar.id || event.detail?.date !== plan?.date || !sameMember(event.detail?.member,currentMember) || event.detail?.contextSignature !== contextSignature) return
      setResult(event.detail)
      setState('ready')
      setError('')
    }
    window.addEventListener(PILLAR_ANALYSIS_EVENT, receive)
    return () => window.removeEventListener(PILLAR_ANALYSIS_EVENT, receive)
  },[contextSignature,currentMember,pillar.id,plan?.date])

  const analysis=result?.pillar===pillar.id && result?.date===plan?.date && sameMember(result?.member,currentMember) && result?.contextSignature===contextSignature ? result.analysis : null
  const decisions=analysis?.decisions || []
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
      <section className="pillar-analysis-command"><div><span>Today’s Focus</span><h2>{analysis.headline}</h2><p>{analysis.executiveSummary}</p></div><aside><strong>{analysis.todayFocus}</strong><small>{result.quality?.status==='fallback'?'Source-grounded safe analysis':result.cached?'Daily analysis cache':'Fresh AI analysis'} · {new Date(result.generatedAt).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})}</small></aside></section>

      <section className="pillar-analysis-section"><div className="pillar-analysis-heading"><span>Key Message</span><h2>What Matters Today</h2></div><div className="pillar-analysis-grid">{(analysis.analysisPoints || []).map((item,index)=><article key={`${index}-${item.title}`}><span>{String(index+1).padStart(2,'0')}</span><h3>{item.title}</h3><p>{item.detail}</p></article>)}</div></section>

      <section className="pillar-analysis-section"><div className="pillar-analysis-heading"><span>Evidence & Provenance</span><h2>What This Is Based On</h2></div><div className="pillar-analysis-grid">{(analysis.evidence || []).map((item,index)=><article key={`${index}-${item.source}`}><span>{String(index+1).padStart(2,'0')}</span><h3>{item.source}</h3><p>{item.detail}</p></article>)}</div></section>

      <section className="pillar-analysis-section"><div className="pillar-analysis-heading"><span>Apply It Today</span><h2>Meaningful Next Moves</h2></div><div className="pillar-action-grid">{(analysis.actionableInsights || []).map((item,index)=><article key={`${index}-${item.title}`}><span>{String(index+1).padStart(2,'0')}</span><h3>{item.title}</h3><p>{item.whyItMatters}</p><small><strong>Next move</strong>{item.nextMove}</small></article>)}</div></section>

      <section className="pillar-analysis-two-column">
        <div className="pillar-analysis-section"><div className="pillar-analysis-heading"><span>Reflect & Grow</span><h2>Questions Worth Considering</h2></div><List items={analysis.reflectionPrompts} /></div>
        <div className="pillar-analysis-section"><div className="pillar-analysis-heading"><span>Awareness</span><h2>What to Watch For</h2></div><List items={analysis.watchFor} /></div>
      </section>

      {decisions.length > 0 && <section className="pillar-analysis-section"><div className="pillar-analysis-heading"><span>Real Choices</span><h2>Decisions That Need Attention</h2></div><List items={decisions} /></section>}

      <section className="pillar-analysis-section pillar-analysis-standard"><div className="pillar-analysis-heading"><span>Growth Signal</span><h2>How Progress Will Show</h2></div><p>{analysis.growthSignal}</p><blockquote>{analysis.governingPrinciple}</blockquote></section>
    </>}
    {pillar.id==='spiritual'&&planState==='ready'&&<SermonRepository notes={plan?.spiritual?.sermonNotes} source={plan?.spiritual?.sermonSource}/>}
  </div>
}
