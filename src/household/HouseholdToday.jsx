import { useState } from 'react'
import MorningAlignment from './MorningAlignment.jsx'
import TodayDashboard from './TodayDashboard.jsx'
import { useDailyPlan } from './useDailyPlan.js'

export default function HouseholdToday({ currentMember = 'Larry', onOpenPillar }) {
  const { plan, state, error, reload, savePlan } = useDailyPlan()
  const [alignmentOpen, setAlignmentOpen] = useState(false)

  const completeAlignment = async nextPlan => {
    await savePlan(nextPlan)
    setAlignmentOpen(false)
  }

  if (alignmentOpen) {
    return (
      <MorningAlignment
        plan={plan}
        onCancel={() => setAlignmentOpen(false)}
        onComplete={completeAlignment}
      />
    )
  }

  return (
    <div className="household-today-workspace">
      {error && (
        <div className="today-sync-banner today-sync-banner--error">
          <div>
            <strong>Household sync needs attention</strong>
            <span>{error}</span>
          </div>
          <button onClick={reload}>Retry</button>
        </div>
      )}
      {state === 'loading' && (
        <div className="today-sync-banner">
          <i className="ti ti-cloud-download" /> Loading the shared household plan…
        </div>
      )}
      {state === 'saving' && (
        <div className="today-sync-banner">
          <i className="ti ti-cloud-upload" /> Saving household changes…
        </div>
      )}
      <TodayDashboard
        plan={plan}
        currentMember={currentMember}
        onOpenPillar={onOpenPillar}
        onStartAlignment={() => setAlignmentOpen(true)}
      />
    </div>
  )
}
