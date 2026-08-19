import { useMemo, useState } from 'react'
import { createEmptyDailyPlan, createPlanItem, normalizeDailyPlan } from './dailyPlan.js'
import { generateDailyProposal } from './dailyProposalApi.js'
import { saveDailyPlan } from './householdApi.js'

const nextDateKey = dateKey => {
  const date = new Date(`${dateKey}T12:00:00`)
  date.setDate(date.getDate() + 1)
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`
}

const seedTomorrow = sourcePlan => {
  const source = normalizeDailyPlan(sourcePlan)
  const targetDate = nextDateKey(source.date)
  const next = createEmptyDailyPlan(targetDate)
  next.topPriorities = (source.recap.carryovers || []).slice(0, 3).map((title, index) => createPlanItem({ id: `carryover-${targetDate}-${index}`, title, owner: 'Family', status: 'pending' }))
  next.recap.tomorrowPrep = [...(source.recap.tomorrowPrep || [])]
  return next
}

export default function TomorrowProposal({ plan }) {
  const targetDate = useMemo(() => nextDateKey(plan.date), [plan.date])
  const [proposal, setProposal] = useState(null)
  const [state, setState] = useState('idle')
  const [message, setMessage] = useState('')

  const generate = async () => {
    setState('loading'); setMessage('')
    try {
      const result = await generateDailyProposal(plan, targetDate)
      setProposal(result.proposal)
      setState('ready')
    } catch (error) {
      setState('error'); setMessage(error.message || 'Could not generate tomorrow’s proposal.')
    }
  }

  const accept = async () => {
    if (!proposal) return
    setState('saving'); setMessage('')
    try {
      const next = seedTomorrow(plan)
      next.theme = proposal.theme
      next.governingPrinciple = proposal.governingPrinciple
      next.topPriorities = proposal.topPriorities.map((title, index) => createPlanItem({ id: `ai-priority-${targetDate}-${index}`, title, owner: 'Family', status: 'pending' }))
      next.spiritual.devotionFocus = proposal.spiritualFocus
      next.education.thinkTankTopic = proposal.thinkTankTopic
      next.ministry.contentFocus = proposal.ministryFocus
      next.decisions = proposal.decisionPrompts.map((title, index) => createPlanItem({ id: `ai-decision-${targetDate}-${index}`, title, owner: 'Family', status: 'needs-decision', requiresDecision: true, notificationLevel: 'action' }))
      await saveDailyPlan(next)
      setState('saved'); setMessage(`Tomorrow’s proposed plan was saved for ${targetDate}. Review it during Morning Alignment before it becomes authoritative.`)
    } catch (error) {
      setState('error'); setMessage(error.message || 'Could not save tomorrow’s proposal.')
    }
  }

  return <section className="today-section tomorrow-proposal">
    <div className="today-section-heading"><div><span>Prepare Tomorrow</span><h2>Proposed Daily Brief</h2></div><small>AI proposes. The family approves during Morning Alignment.</small></div>
    {!proposal ? <div className="tomorrow-proposal-empty"><p>Use today’s recap, carryovers and unresolved decisions to prepare a proposed brief for {targetDate}.</p><button type="button" className="alignment-primary" disabled={state==='loading'} onClick={generate}>{state==='loading'?'Generating…':'Generate Tomorrow Proposal'}</button></div> : <div className="tomorrow-proposal-card">
      <span>Theme</span><h3>{proposal.theme}</h3><p>{proposal.governingPrinciple}</p>
      <ol>{proposal.topPriorities.map(item=><li key={item}>{item}</li>)}</ol>
      <div className="tomorrow-proposal-notes"><div><strong>Spiritual</strong><p>{proposal.spiritualFocus}</p></div><div><strong>Think Tank</strong><p>{proposal.thinkTankTopic}</p></div><div><strong>Ministry</strong><p>{proposal.ministryFocus}</p></div></div>
      <div className="tomorrow-proposal-actions"><button type="button" className="alignment-secondary" onClick={generate}>Regenerate</button><button type="button" className="alignment-primary" disabled={state==='saving'||state==='saved'} onClick={accept}>{state==='saving'?'Saving…':state==='saved'?'Saved':'Accept as Tomorrow Draft'}</button></div>
    </div>}
    {message&&<div className={`today-sync-banner${state==='error'?' today-sync-banner--error':''}`}>{message}</div>}
  </section>
}
