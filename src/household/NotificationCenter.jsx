import { notificationsForMember } from './notifications.js'

export default function NotificationCenter({ plan, member }) {
  const notes = notificationsForMember(plan, member)
  const critical = notes.filter(note => note.level === 'critical')
  const action = notes.filter(note => note.level === 'action')
  const awareness = notes.filter(note => note.level === 'awareness')

  if (!notes.length) return <section className="today-section notification-center"><div className="today-section-heading"><div><span>Attention</span><h2>All Clear</h2></div><small>No unresolved household alerts for {member}.</small></div></section>

  return <section className="today-section notification-center">
    <div className="today-section-heading"><div><span>Attention</span><h2>Household Signals</h2></div><small>Critical and action items deserve attention; awareness items stay quiet.</small></div>
    <div className="notification-groups">
      {[['critical', critical], ['action', action], ['awareness', awareness]].map(([level, items]) => items.length ? <div className={`notification-group notification-group--${level}`} key={level}>
        <strong>{level}</strong>
        {items.map(item => <div className="notification-row" key={item.id}><div><span>{item.title}</span><small>{item.detail}</small></div><em>{item.owner}</em></div>)}
      </div> : null)}
    </div>
  </section>
}
