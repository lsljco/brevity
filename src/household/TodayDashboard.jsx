import { useEffect, useMemo, useState } from 'react'
import { decisionCount, localDateKey, ownerName, PILLARS } from './dailyPlan.js'
import { householdRepository } from './householdRepository.js'
import './todayDashboard.css'

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
  year: 'numeric',
})

function splitList(value) {
  return value
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean)
}

function joinList(value) {
  return (value || []).join('\n')
}

function PillarCard({ pillar, children, meta }) {
  return (
    <section className="today-pillar-card">
      <header className="today-pillar-header">
        <div className="today-pillar-title">
          <span className="today-pillar-icon"><i className={`ti ${pillar.icon}`} /></span>
          <div>
            <p className="today-eyebrow">Seven Pillars</p>
            <h2>{pillar.label}</h2>
          </div>
        </div>
        {meta && <span className="today-meta-chip">{meta}</span>}
      </header>
      <div className="today-pillar-body">{children}</div>
    </section>
  )
}

function Field({ label, value, onChange, placeholder, multiline = false }) {
  const Component = multiline ? 'textarea' : 'input'
  return (
    <label className="today-field">
      <span>{label}</span>
      <Component
        value={value || ''}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        rows={multiline ? 3 : undefined}
      />
    </label>
  )
}

export default function TodayDashboard() {
  const todayKey = useMemo(() => localDateKey(), [])
  const [plan, setPlan] = useState(null)
  const [saveState, setSaveState] = useState('saved')

  useEffect(() => {
    let cancelled = false
    householdRepository.getDailyPlan(todayKey).then((result) => {
      if (!cancelled) setPlan(result)
    })
    return () => { cancelled = true }
  }, [todayKey])

  const patchPlan = (patch) => {
    setPlan((current) => ({ ...current, ...patch }))
    setSaveState('unsaved')
  }

  const patchPillar = (pillarId, patch) => {
    setPlan((current) => ({
      ...current,
      pillars: {
        ...current.pillars,
        [pillarId]: { ...current.pillars[pillarId], ...patch },
      },
    }))
    setSaveState('unsaved')
  }

  const save = async () => {
    setSaveState('saving')
    const saved = await householdRepository.saveDailyPlan(plan)
    setPlan(saved)
    setSaveState('saved')
  }

  if (!plan) {
    return <div className="today-loading">Loading today’s household plan…</div>
  }

  const { spiritual, nutrition, fitness, household, education, finances, ministry } = plan.pillars
  const openDecisions = decisionCount(plan)

  return (
    <div className="today-page">
      <header className="today-hero">
        <div>
          <p className="today-eyebrow">Household Operating System</p>
          <h1>Today</h1>
          <p className="today-date">{dateFormatter.format(new Date(`${plan.date}T12:00:00`))}</p>
        </div>
        <div className="today-hero-actions">
          <span className={`today-save-state today-save-state--${saveState}`}>{saveState}</span>
          <button className="today-primary-button" onClick={save} disabled={saveState === 'saving'}>
            <i className="ti ti-device-floppy" /> Save Today
          </button>
        </div>
      </header>

      <section className="today-command-card">
        <div className="today-command-copy">
          <p className="today-eyebrow">Daily Focus</p>
          <Field
            label="Theme"
            value={plan.theme}
            onChange={(theme) => patchPlan({ theme })}
            placeholder="What governs today?"
          />
          <Field
            label="Household focus"
            value={plan.householdFocus}
            onChange={(householdFocus) => patchPlan({ householdFocus })}
            placeholder="What must the family accomplish today?"
          />
        </div>
        <div className="today-command-status">
          <div className="today-decision-number">{openDecisions}</div>
          <div>
            <strong>open decisions</strong>
            <span>Resolve these during Morning Alignment.</span>
          </div>
        </div>
      </section>

      <section className="today-top-three">
        <div className="today-section-heading">
          <div>
            <p className="today-eyebrow">Execution</p>
            <h2>Today’s Top 3</h2>
          </div>
          <span>Household outcomes, not activity</span>
        </div>
        <div className="today-priority-grid">
          {[0, 1, 2].map((index) => (
            <label key={index} className="today-priority-item">
              <span>{index + 1}</span>
              <input
                value={plan.topPriorities[index] || ''}
                onChange={(event) => {
                  const topPriorities = [...plan.topPriorities]
                  topPriorities[index] = event.target.value
                  patchPlan({ topPriorities })
                }}
                placeholder="Define the outcome"
              />
            </label>
          ))}
        </div>
      </section>

      <div className="today-pillar-grid">
        <PillarCard pillar={PILLARS[0]} meta={ownerName(spiritual.ownerId)}>
          <Field label="Scripture" value={spiritual.scripture} onChange={(scripture) => patchPillar('spiritual', { scripture })} placeholder="Scripture focus" />
          <Field label="Devotion focus" value={spiritual.devotionFocus} onChange={(devotionFocus) => patchPillar('spiritual', { devotionFocus })} placeholder="What are we learning?" />
          <Field label="Prayer focus" multiline value={joinList(spiritual.prayerFocus)} onChange={(value) => patchPillar('spiritual', { prayerFocus: splitList(value) })} placeholder="One prayer focus per line" />
          <Field label="Act of obedience" value={spiritual.actOfObedience} onChange={(actOfObedience) => patchPillar('spiritual', { actOfObedience })} placeholder="What will obedience look like today?" />
        </PillarCard>

        <PillarCard pillar={PILLARS[1]} meta={ownerName(nutrition.ownerId)}>
          <div className="today-two-col">
            <Field label="Breakfast" value={nutrition.breakfast} onChange={(breakfast) => patchPillar('nutrition', { breakfast })} placeholder="Breakfast" />
            <Field label="Lunch" value={nutrition.lunch} onChange={(lunch) => patchPillar('nutrition', { lunch })} placeholder="Lunch" />
          </div>
          <Field label="Dinner" value={nutrition.dinner} onChange={(dinner) => patchPillar('nutrition', { dinner })} placeholder="Dinner and serving time" />
          <Field label="Snacks" multiline value={joinList(nutrition.snacks)} onChange={(value) => patchPillar('nutrition', { snacks: splitList(value) })} placeholder="One option per line" />
          <Field label="Groceries needed" multiline value={joinList(nutrition.groceryNeeds)} onChange={(value) => patchPillar('nutrition', { groceryNeeds: splitList(value) })} placeholder="One item per line" />
        </PillarCard>

        <PillarCard pillar={PILLARS[2]} meta={`${fitness.stepGoal?.toLocaleString() || '—'} steps`}>
          <div className="today-two-col">
            <Field label="Location" value={fitness.location} onChange={(location) => patchPillar('fitness', { location })} placeholder="Life Time / outdoor / home" />
            <Field label="Activity" value={fitness.activity} onChange={(activity) => patchPillar('fitness', { activity })} placeholder="Strength / cardio / recovery" />
          </div>
          <Field label="Workout objective" value={fitness.workout} onChange={(workout) => patchPillar('fitness', { workout })} placeholder="Exact workout or objective" />
          <div className="today-two-col">
            <Field label="Depart" value={fitness.departureTime} onChange={(departureTime) => patchPillar('fitness', { departureTime })} placeholder="5:40 AM" />
            <Field label="Return" value={fitness.returnTime} onChange={(returnTime) => patchPillar('fitness', { returnTime })} placeholder="7:30 AM" />
          </div>
        </PillarCard>

        <PillarCard pillar={PILLARS[3]} meta={`${household.appointments.length} appointments`}>
          <Field label="Priorities" multiline value={joinList(household.priorities)} onChange={(value) => patchPillar('household', { priorities: splitList(value) })} placeholder="One household priority per line" />
          <Field label="Errands" multiline value={joinList(household.errands)} onChange={(value) => patchPillar('household', { errands: splitList(value) })} placeholder="One errand per line" />
          <Field label="Open items" multiline value={joinList(household.openItems)} onChange={(value) => patchPillar('household', { openItems: splitList(value) })} placeholder="Items requiring confirmation or follow-up" />
        </PillarCard>

        <PillarCard pillar={PILLARS[4]} meta="Think Tank">
          <Field label="Think Tank topic" value={education.thinkTankTopic} onChange={(thinkTankTopic) => patchPillar('education', { thinkTankTopic })} placeholder="What are we learning or solving?" />
          <Field label="Required deliverable" value={education.thinkTankDeliverable} onChange={(thinkTankDeliverable) => patchPillar('education', { thinkTankDeliverable })} placeholder="What must the discussion produce?" />
          <Field label="Isaiah reading" value={education.isaiahReading} onChange={(isaiahReading) => patchPillar('education', { isaiahReading })} placeholder="Reading / sight words / comprehension" />
        </PillarCard>

        <PillarCard pillar={PILLARS[5]} meta="Stewardship">
          <Field label="Bills" multiline value={joinList(finances.bills)} onChange={(value) => patchPillar('finances', { bills: splitList(value) })} placeholder="Bills requiring attention" />
          <Field label="Transfers" multiline value={joinList(finances.transfers)} onChange={(value) => patchPillar('finances', { transfers: splitList(value) })} placeholder="Transfers to execute" />
          <Field label="Accounts to fund" multiline value={joinList(finances.accountsToFund)} onChange={(value) => patchPillar('finances', { accountsToFund: splitList(value) })} placeholder="Grocery, Fuel, Medical…" />
          <Field label="Income actions" multiline value={joinList(finances.incomeActions)} onChange={(value) => patchPillar('finances', { incomeActions: splitList(value) })} placeholder="Highest-value income actions" />
        </PillarCard>

        <PillarCard pillar={PILLARS[6]} meta="Impartation">
          <Field label="Meetings" multiline value={joinList(ministry.meetings)} onChange={(value) => patchPillar('ministry', { meetings: splitList(value) })} placeholder="Meetings / services" />
          <Field label="Content" multiline value={joinList(ministry.content)} onChange={(value) => patchPillar('ministry', { content: splitList(value) })} placeholder="Teaching / post / music / message work" />
          <Field label="Follow-ups" multiline value={joinList(ministry.followUps)} onChange={(value) => patchPillar('ministry', { followUps: splitList(value) })} placeholder="People to encourage, call, pray for" />
        </PillarCard>
      </div>

      <section className="today-recap-card">
        <div className="today-section-heading">
          <div>
            <p className="today-eyebrow">Close the loop</p>
            <h2>Daily Recap</h2>
          </div>
          <span>Stage tomorrow before bedtime</span>
        </div>
        <div className="today-three-col">
          <Field label="Wins" multiline value={joinList(plan.recap.wins)} onChange={(value) => patchPlan({ recap: { ...plan.recap, wins: splitList(value) } })} placeholder="What worked?" />
          <Field label="Carryovers" multiline value={joinList(plan.recap.carryovers)} onChange={(value) => patchPlan({ recap: { ...plan.recap, carryovers: splitList(value) } })} placeholder="What legitimately carries forward?" />
          <Field label="Tomorrow prep" multiline value={joinList(plan.recap.tomorrowPrep)} onChange={(value) => patchPlan({ recap: { ...plan.recap, tomorrowPrep: splitList(value) } })} placeholder="What must be staged tonight?" />
        </div>
      </section>
    </div>
  )
}
