import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CALENDAR_STALE_AFTER_MS } from '../family/calendarSnapshot.js'
import { useRollingMealPlan } from '../meals/useRollingMealPlan.js'
import { collectPillarContext, generatePillarAnalysis, PILLAR_ANALYSIS_EVENT, pillarAnalysisContextSignature, readPillarAnalysis } from './pillarAnalysisApi.js'
import { useDailyPlan } from './useDailyPlan.js'
import SermonRepository from './SermonRepository.jsx'
import './PillarAnalysis.css'

function List({ items = [], empty = 'Nothing needs special attention.' }) {
  return items.length ? <ul>{items.map((item,index)=><li key={`${index}-${typeof item==='string'?item:item.title||item.owner}`}>{typeof item==='string'?item:item.title}</li>)}</ul> : <p className="pillar-analysis-empty">{empty}</p>
}
const sameMember = (left, right) => String(left || '').trim().toLowerCase() === String(right || '').trim().toLowerCase()
const calendarCoverageFromContext = context => context?.appleCalendarCoverage || context?.calendar?.appleCalendarCoverage
const analysisStatusLabel = result => {
  if (result?.quality?.status === 'insufficient-data') return 'Needs a source update'
  if (result?.quality?.status === 'evidence-fallback') return 'Built from Brevity records'
  if (result?.quality?.status === 'repaired') return 'Quality-checked AI analysis'
  return result?.cached ? 'Saved daily analysis' : 'Fresh AI analysis'
}
const applyRollingHealthPlan = (plan,rollingPlan) => {
  const day=rollingPlan?.days?.find(item=>item.date===plan?.date)
  if(!day)return plan
  const meals=Object.entries(day.resolvedMeals || {}).filter(([,meal])=>meal)
  return {
    ...plan,
    health:{
      ...plan.health,
      ...Object.fromEntries(meals.map(([mealType,meal])=>[mealType,meal.name])),
      mealPlanSource:'rolling',
      mealPlanVersion:day.version,
      mealDetails:meals.map(([mealType,meal])=>({mealType,name:meal.name,prepMinutes:meal.prepMinutes})),
    },
  }
}

export default function PillarAnalysis({ pillar, currentMember = 'Larry' }) {
  const { plan, state:planState, error:planError, reload:reloadPlan } = useDailyPlan()
  const isHealth=pillar.id==='health'
  const rollingMeals=useRollingMealPlan({enabled:isHealth,startDate:plan?.date,requireFresh:true,reloadOnRefreshEvents:true})
  const analysisPlan=useMemo(()=>pillar.id==='health'?applyRollingHealthPlan(plan,rollingMeals.data):plan,[pillar.id,plan,rollingMeals.data])
  const [result,setResult]=useState(null)
  const [state,setState]=useState('idle')
  const [error,setError]=useState('')
  const [planRefreshError,setPlanRefreshError]=useState('')
  const [contextRevision,setContextRevision]=useState(0)
  const planRef=useRef(plan)
  const contextRef=useRef({})
  const inFlightRef=useRef('')
  const requestSequenceRef=useRef(0)
  const currentScopeRef=useRef('')
  const errorScopeRef=useRef('')
  const forceAfterMealReloadRef=useRef(false)
  planRef.current=analysisPlan
  const localContext=useMemo(()=>collectPillarContext(pillar.id,analysisPlan?.date),[analysisPlan?.date,contextRevision,pillar.id])
  const contextSignature=useMemo(()=>pillarAnalysisContextSignature({pillarData:analysisPlan?.[pillar.id] || {},localContext}),[analysisPlan,localContext,pillar.id])
  contextRef.current=localContext
  const analysisSourceReady=planState==='ready'&&!planRefreshError&&(!isHealth||rollingMeals.state==='ready')
  const currentScopeKey=analysisSourceReady&&analysisPlan?.date?`${pillar.id}:${analysisPlan.date}:${currentMember}:${contextSignature}`:''
  currentScopeRef.current=currentScopeKey

  const run = useCallback(async force => {
    const currentPlan=planRef.current
    if (!currentPlan?.date) return
    const localContext=contextRef.current
    const requestContextSignature=pillarAnalysisContextSignature({pillarData:currentPlan[pillar.id] || {},localContext})
    const requestKey=`${pillar.id}:${currentPlan.date}:${currentMember}:${requestContextSignature}`
    if(currentScopeRef.current!==requestKey)return
    if(inFlightRef.current===requestKey){setState('loading');setError('');errorScopeRef.current='';return}
    const requestSequence=++requestSequenceRef.current
    inFlightRef.current=requestKey
    setState('loading'); setError(''); errorScopeRef.current=''
    try {
      const response = await generatePillarAnalysis({ pillar:pillar.id, date:currentPlan.date, plan:currentPlan, currentMember, force, localContext })
      if(!response || requestSequenceRef.current!==requestSequence || currentScopeRef.current!==requestKey)return
      setResult(response)
      setState('ready')
    } catch (err) {
      if(requestSequenceRef.current!==requestSequence || currentScopeRef.current!==requestKey)return
      errorScopeRef.current=requestKey
      setState('error'); setError(err.message || 'Could not generate this pillar analysis.')
    } finally {
      if(inFlightRef.current===requestKey)inFlightRef.current=''
    }
  }, [currentMember, pillar.id])

  const refreshAnalysis=useCallback(async()=>{
    if(!isHealth){run(true);return}
    forceAfterMealReloadRef.current=true
    try{
      await rollingMeals.reload({supersede:true})
    }catch{
      forceAfterMealReloadRef.current=false
    }
  },[isHealth,rollingMeals.reload,run])

  useEffect(()=>{forceAfterMealReloadRef.current=false},[pillar.id,plan?.date])
  useEffect(()=>{setPlanRefreshError('')},[plan?.date])
  useEffect(()=>{if(isHealth&&rollingMeals.state==='error')forceAfterMealReloadRef.current=false},[isHealth,rollingMeals.state])
  useEffect(()=>{if(planState==='ready')setPlanRefreshError('')},[plan,planState])

  useEffect(()=>{
    const coverage=calendarCoverageFromContext(localContext)
    const verifiedAt=Date.parse(coverage?.lastSuccessfulSyncAt || '')
    if(coverage?.stale||!Number.isFinite(verifiedAt))return
    const delay=Math.max(0,(verifiedAt+CALENDAR_STALE_AFTER_MS)-Date.now()+50)
    const timer=setTimeout(()=>setContextRevision(value=>value+1),Math.min(delay,2_147_483_647))
    return()=>clearTimeout(timer)
  },[localContext])

  useEffect(()=>{
    const refresh=event=>{
      if(event?.type==='brevity-app-refreshed'&&event.detail?.date){
        const refreshDate=event.detail.date
        setPlanRefreshError(event.detail?.plan?.date===refreshDate&&plan?.date===refreshDate?'':'The latest application refresh could not verify today’s household plan.')
      }
      setContextRevision(value=>value+1)
    }
    const storageRefresh=event=>{if(!event.key||['lslj_finance_v9','plaid_actuals_cache','brevity_plaid_transaction_freshness_v1','lslj_budget_v1','lslj_actuals_v1','lslj_tx_overrides_v1','lslj_tx_rules_v1','fp_goals','homehq_items_v1','family_calendar_events_v1','brevity_icloud_calendar_cache_v1','brevity_household_maintenance_v1','brevity_household_inventory_v1','brevity_household_schedule_v1'].includes(event.key))refresh()}
    window.addEventListener('brevity-app-refreshed',refresh)
    window.addEventListener('brevity-shared-state-updated',refresh)
    window.addEventListener('brevity-icloud-calendar-refreshed',refresh)
    window.addEventListener('brevity-family-calendar-updated',refresh)
    window.addEventListener('storage',storageRefresh)
    return()=>{window.removeEventListener('brevity-app-refreshed',refresh);window.removeEventListener('brevity-shared-state-updated',refresh);window.removeEventListener('brevity-icloud-calendar-refreshed',refresh);window.removeEventListener('brevity-family-calendar-updated',refresh);window.removeEventListener('storage',storageRefresh)}
  },[plan?.date])

  useEffect(()=>{
    if(planState!=='ready' || planRefreshError || !analysisPlan?.date || (isHealth&&rollingMeals.state!=='ready')) return
    const force=isHealth&&forceAfterMealReloadRef.current
    forceAfterMealReloadRef.current=false
    if(!force){
      const cached = readPillarAnalysis(analysisPlan.date, pillar.id, currentMember, globalThis.localStorage, contextSignature)
      if (cached) { errorScopeRef.current=''; setError(''); setResult(cached); setState('ready'); return }
    }
    run(Boolean(force))
  },[analysisPlan,contextRevision,contextSignature,currentMember,isHealth,pillar.id,planRefreshError,planState,rollingMeals.state,run])

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

  const analysis=analysisSourceReady&&result?.pillar===pillar.id && result?.date===plan?.date && sameMember(result?.member,currentMember) && result?.contextSignature===contextSignature ? result.analysis : null
  const visibleError=errorScopeRef.current===currentScopeKey?error:''
  const decisions=analysis?.decisions || []
  return <div className="pillar-analysis-page">
    <header className="pillar-analysis-hero">
      <div className="pillar-analysis-icon"><i className={`ti ${pillar.icon}`} /></div>
      <div className="pillar-analysis-title"><span>Seven Pillars · AI Analysis</span><h1>{pillar.label}</h1><p>{pillar.description}</p></div>
      <button type="button" className="pillar-analysis-refresh" disabled={state==='loading'||planState!=='ready'||Boolean(planRefreshError)||(isHealth&&rollingMeals.state!=='ready')} onClick={refreshAnalysis}><i className="ti ti-refresh" /> {isHealth&&rollingMeals.state==='loading'?'Loading Meals…':state==='loading'?'Analyzing…':'Refresh Analysis'}</button>
    </header>

    {planError && <div className="pillar-analysis-error" role="alert"><strong>Household plan unavailable.</strong> {planError} <button type="button" onClick={reloadPlan}>Retry daily plan</button></div>}
    {!planError&&planRefreshError&&<div className="pillar-analysis-error" role="alert"><strong>Household plan could not be reverified.</strong> {planRefreshError} <button type="button" onClick={reloadPlan}>Retry daily plan</button></div>}
    {isHealth&&rollingMeals.state==='error'&&<div className="pillar-analysis-error" role="alert"><strong>Health analysis is paused.</strong> Today’s rolling meal plan could not be verified: {rollingMeals.error} <button type="button" onClick={()=>rollingMeals.reload({supersede:true})?.catch?.(()=>undefined)}>Retry meal plan</button></div>}
    {visibleError && <div className="pillar-analysis-error">{visibleError}</div>}
    {isHealth&&rollingMeals.state==='loading'&&<div className="pillar-analysis-loading"><div className="pillar-analysis-pulse"/><h2>Loading today’s meal plan</h2><p>Health analysis will begin after Brevity verifies the rolling plan for {plan?.date}.</p></div>}
    {analysisSourceReady&&state==='loading' && !analysis && <div className="pillar-analysis-loading"><div className="pillar-analysis-pulse"/><h2>Analyzing {pillar.label}</h2><p>Applying the same Seven Pillars reasoning framework used by the household’s scheduled daily automation.</p></div>}

    {analysis && <>
      <section className="pillar-analysis-command"><div><span>Today’s Focus</span><h2>{analysis.headline}</h2><p>{analysis.executiveSummary}</p></div><aside><strong>{analysis.todayFocus}</strong><small>{analysisStatusLabel(result)} · {new Date(result.generatedAt).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})}</small></aside></section>

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
