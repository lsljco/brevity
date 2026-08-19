import './TodayDashboard.css'
import { countOpenDecisions, assignmentsForMember, normalizeDailyPlan } from './dailyPlan.js'

const PILLARS = [
  ['spiritual', 'Spiritual Maturity', 'ti-sun'],
  ['health', 'Health & Nutrition', 'ti-heart'],
  ['fitness', 'Physical Fitness', 'ti-run'],
  ['household', 'Household Management', 'ti-home'],
  ['education', 'Education / Think Tank', 'ti-book'],
  ['finance', 'Finance', 'ti-building-bank'],
  ['ministry', 'Ministry & Fellowship', 'ti-users'],
]

const arrayLength = value => Array.isArray(value) ? value.length : 0

function formatDate(dateKey) {
  const date = new Date(`${dateKey}T12:00:00`)
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}

function PillarCard({ id, label, icon, plan }) {
  const value = plan?.[id] || {}
  const summaries = {
    spiritual: value.devotionFocus || 'Devotion focus needs confirmation',
    health: value.dinner ? `Dinner: ${value.dinner}` : 'Terica: meal plan needs confirmation',
    fitness: value.location ? `${value.location}${value.workout ? ` · ${value.workout}` : ''}` : 'Location and workout need decision',
    household: `${arrayLength(value.appointments)} appointments · ${arrayLength(value.priorities)} priorities`,
    education: value.thinkTankTopic || 'Think Tank topic needs confirmation',
    finance: `${arrayLength(value.bills)} bills · ${arrayLength(value.transfers)} transfers · ${arrayLength(value.accountsToFund)} funding decisions`,
    ministry: `${arrayLength(value.meetings)} meetings · ${arrayLength(value.fellowshipFollowUps)} follow-ups`,
  }

  return <article className="today-pillar-card"><div className="today-pillar-icon"><i className={`ti ${icon}`} /></div><div><span className="today-pillar-label">{label}</span><strong>{summaries[id] || 'Needs confirmation'}</strong></div></article>
}

export default function TodayDashboard({ plan, currentMember = 'Larry', onStartAlignment, onStartRecap, onOpenPillar }) {
  const dailyPlan = normalizeDailyPlan(plan)
  const openDecisions = countOpenDecisions(dailyPlan)
  const myAssignments = assignmentsForMember(dailyPlan, currentMember)
  const aligned = Boolean(dailyPlan.morningAlignment?.completedAt)
  const closed = Boolean(dailyPlan.recap?.completedAt)

  return <div className="today-dashboard">
    <header className="today-hero">
      <div><p className="today-kicker">Household Command Center</p><h1>Today</h1><p>{formatDate(dailyPlan.date)}</p></div>
      <div className="today-hero-actions">
        <button className="today-alignment-button" onClick={onStartAlignment}><i className="ti ti-target-arrow" /> {aligned ? 'Review Alignment' : 'Start Alignment'}</button>
        <button className="today-alignment-button today-alignment-button--secondary" onClick={onStartRecap}><i className="ti ti-clipboard-check" /> {closed ? 'Review Recap' : 'Close Today'}</button>
      </div>
    </header>

    <section className="today-focus-card"><div><span>Today's Focus</span><h2>{dailyPlan.theme || 'Set today’s household focus'}</h2>{dailyPlan.governingPrinciple && <p>{dailyPlan.governingPrinciple}</p>}</div><div className="today-decision-count"><strong>{openDecisions}</strong><span>{openDecisions === 1 ? 'decision needs attention' : 'decisions need attention'}</span></div></section>

    <section className="today-section"><div className="today-section-heading"><div><span>Seven Pillars</span><h2>Household Status</h2></div><small>Brevity is the source of truth. Calendar remains the timed alert layer.</small></div><div className="today-pillar-grid">{PILLARS.map(([id, label, icon]) => <button key={id} className="today-pillar-button" onClick={() => onOpenPillar?.(id)}><PillarCard id={id} label={label} icon={icon} plan={dailyPlan} /></button>)}</div></section>

    <section className="today-section"><div className="today-section-heading"><div><span>Ownership</span><h2>{currentMember}'s Day</h2></div><small>Only assignments owned by or explicitly involving this household member.</small></div>{myAssignments.length ? <div className="today-assignment-list">{myAssignments.map(item => <div className="today-assignment" key={item.id}><div><strong>{item.title}</strong>{item.notes && <span>{item.notes}</span>}</div><span className={`today-status today-status--${item.status}`}>{item.status}</span></div>)}</div> : <div className="today-empty">No assignments have been assigned to {currentMember} yet.</div>}</section>

    <section className="today-section"><div className="today-section-heading"><div><span>Daily Outcomes</span><h2>Top 3</h2></div><small>Outcomes, not generic tasks.</small></div><ol className="today-top-three">{[0,1,2].map(index => <li key={index}>{dailyPlan.topPriorities?.[index]?.title || 'Priority not set'}</li>)}</ol></section>
  </div>
}
