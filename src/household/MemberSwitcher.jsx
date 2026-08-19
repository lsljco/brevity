import { HOUSEHOLD_MEMBERS } from './dailyPlan.js'
import { initialsForMember } from './memberProfile.js'

export default function MemberSwitcher({ member, onChange, compact = false }) {
  return <div className={`member-switcher${compact ? ' member-switcher--compact' : ''}`}>
    <div className="member-switcher-avatar">{initialsForMember(member)}</div>
    <select value={member} onChange={event => onChange(event.target.value)} aria-label="Current household member">
      {HOUSEHOLD_MEMBERS.map(name => <option key={name} value={name}>{name}</option>)}
    </select>
  </div>
}
