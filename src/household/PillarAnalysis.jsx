import { useCallback, useEffect, useRef, useState } from 'react'
import { generatePillarAnalysis, PILLAR_ANALYSIS_EVENT, readPillarAnalysis } from './pillarAnalysisApi.js'
import { useDailyPlan } from './useDailyPlan.js'
import SermonRepository from './SermonRepository.jsx'
import './PillarAnalysis.css'

function List({ items = [], empty = 'Nothing needs special attention.' }) {
  return items.length ? <ul>{items.map((item,index)=><li key={`${index}-${typeof item==='string'?item:item.title||item.owner}`}>{typeof item==='string'?item:item.title}</li>)}</ul> : <p className="pillar-analysis-empty">{empty}</p>
}

export default function PillarAnalysis({ pillar, currentMember = 'Larry' }) {
  const { plan, state:planState, error:planError } = useDailyPlan()
  const [result,setResult]=useState(null)
  const [state,setState]=useState('idle')
  const [error,setError]=useState('')
  const planRef=useRef(plan)
  const inFlightRef=useRef('')
  planRef.current=plan

  const run = useCallback(async force => {
    const currentPlan=planRef.current
    if (!currentPlan?.date) return
    const requestKey=`${pillar.id}:${currentPlan.date}`
    if(inFlightRef.current===requestKey)return
    inFlightRef.current=requestKey
    setState('loading'); setError('')
    try {
      const response = await generatePillarAnalysis({ pillar:pillar.id, date:currentPlan.date, plan:currentPlan, currentMember, force })
      setResult(response)
      setState('ready')
    } catch (err) {
      setState('error'); setError(err.message || 'Could not generate this pillar analysis.')
    } finally {
      if(inFlightRef.current===requestKey)inFlightRef.current=''
    }
  }, [currentMember, pillar.id])

  useEffect(()=>{
    if(planState!=='ready' || !plan?.date) return
    const cached = readPillarAnalysis(plan.date, pillar.id)
    if (cached) { setResult(cached); setState('ready'); return }
    run(false)
  },[pillar.id,plan?.date,planState,run])

  useEffect(()=>{
    const receive = event => {
      if (event.detail?.pillar !== pillar.id || event.detail?.date !== plan?.date) return
      setResult(event.detail)
      setState('ready')
      setError('')
    }
    window.addEventListener(PILLAR_ANALYSIS_EVENT, receive)
    return () => window.removeEventListener(PILLAR_ANALYSIS_EVENT, receive)
  },[pillar.id,plan?.date])

  const analysis=result?.pillar===pillar.id && result?.date===plan?.date ? result.analysis : null
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
      <section className="pillar-analysis-command"><div><span>Today’s Focus</span><h2>{analysis.headline}</h2><p>{analysis.executiveSummary}</p></div><aside><strong>{analysis.todayFocus}</strong><small>{result.cached?'Daily analysis cache':'Fresh AI analysis'} · {new Date(result.generatedAt).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})}</small></aside></section>

      <section className="pillar-analysis-section"><div className="pillar-analysis-heading"><span>Key Message</span><h2>What Matters Today</h2></div><div className="pillar-analysis-grid">{(analysis.analysisPoints || []).map((item,index)=><article key={`${index}-${item.title}`}><span>{String(index+1).padStart(2,'0')}</span><h3>{item.title}</h3><p>{item.detail}</p></article>)}</div></section>

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
