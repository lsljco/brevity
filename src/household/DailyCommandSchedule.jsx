const DAYPART_ORDER = ['anchor','focus','flex','wind-down']

const statusLabel = value => String(value || 'pending').replace(/-/g, ' ')

export default function DailyCommandSchedule({ plan, showDecisions = true }) {
  const dayparts = Array.isArray(plan?.dayparts) ? [...plan.dayparts].sort((a, b) => DAYPART_ORDER.indexOf(a.id) - DAYPART_ORDER.indexOf(b.id)) : []
  const decisions = Array.isArray(plan?.decisions) ? plan.decisions : []

  if (!dayparts.length && (!showDecisions || !decisions.length)) return null

  return <>
    {dayparts.length > 0 && <section className="today-section command-schedule">
      <div className="today-section-heading"><div><span>Household Command Schedule</span><h2>Today by Daypart</h2></div><small>{plan?.dayObjective || 'Front-load what matters so the day is not governed by pressure.'}</small></div>
      <div className="command-dayparts">
        {dayparts.map(block => <article className="command-daypart" key={block.id || block.label}>
          <header><div><span>{block.label}</span><strong>{block.window}</strong></div><p>{block.objective}</p></header>
          <div className="command-timeline">
            {(block.items || []).map((item, index) => <div className="command-timeline-row" key={`${item.time}-${index}`}>
              <time>{item.time}</time><div><strong>{item.title}</strong><span>{item.owner}{item.pillar ? ` · ${item.pillar}` : ''}</span></div>
            </div>)}
          </div>
        </article>)}
      </div>
    </section>}

    {showDecisions && decisions.length > 0 && <section className="today-section command-decisions">
      <div className="today-section-heading"><div><span>Decision Board</span><h2>Confirm / Decide / Execute</h2></div><small>Nothing important remains mentally open without an owner and state.</small></div>
      <div className="command-decision-list">
        {decisions.map(item => <div className="command-decision-row" key={item.id || item.title}><div><strong>{item.title}</strong>{item.notes && <span>{item.notes}</span>}</div><div><span>{item.owner || 'Family'}</span><em>{statusLabel(item.status)}</em></div></div>)}
      </div>
    </section>}
  </>
}
