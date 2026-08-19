import { useState } from 'react'
import { reconcilePlanWithICloud } from '../family/calendarSync.js'
import EveningRecap from './EveningRecap.jsx'
import MorningAlignment from './MorningAlignment.jsx'
import NotificationCenter from './NotificationCenter.jsx'
import TodayDashboard from './TodayDashboard.jsx'
import TomorrowProposal from './TomorrowProposal.jsx'
import { useDailyPlan } from './useDailyPlan.js'
import './HouseholdOS.css'

export default function HouseholdToday({ currentMember = 'Larry', onOpenPillar }) {
  const { plan, state, error, reload, savePlan } = useDailyPlan()
  const [mode, setMode] = useState('today')
  const [calendarMessage, setCalendarMessage] = useState('')

  const persistAndSync = async nextPlan => {
    const saved = await savePlan(nextPlan)
    try {
      const summary = await reconcilePlanWithICloud(saved)
      const changed = summary.created + summary.updated + summary.deleted
      setCalendarMessage(changed ? `Apple Calendar synchronized: ${summary.created} created · ${summary.updated} updated · ${summary.deleted} removed.` : 'Apple Calendar already matched Brevity.')
    } catch (calendarError) {
      if (calendarError.status === 401) setCalendarMessage('Brevity saved the household plan. Apple Calendar is locked on this device, so calendar sync was skipped.')
      else if (calendarError.status === 503) setCalendarMessage('Brevity saved the household plan. Apple Calendar is not configured yet, so calendar sync was skipped.')
      else setCalendarMessage(`Brevity saved the household plan. Calendar sync needs attention: ${calendarError.message}`)
    }
    return saved
  }

  const completeAlignment = async nextPlan => { await persistAndSync(nextPlan); setMode('today') }
  const completeRecap = async nextPlan => { await savePlan(nextPlan); setMode('today') }

  if (mode === 'alignment') return <MorningAlignment plan={plan} onCancel={() => setMode('today')} onComplete={completeAlignment} />
  if (mode === 'recap') return <EveningRecap plan={plan} onCancel={() => setMode('today')} onComplete={completeRecap} />

  return <div className="household-today-workspace">
    {error && <div className="today-sync-banner today-sync-banner--error"><div><strong>Household sync needs attention</strong><span>{error}</span></div><button onClick={reload}>Retry</button></div>}
    {state === 'loading' && <div className="today-sync-banner"><i className="ti ti-cloud-download" /> Loading the shared household plan…</div>}
    {state === 'saving' && <div className="today-sync-banner"><i className="ti ti-cloud-upload" /> Saving household changes…</div>}
    {calendarMessage && <div className="today-sync-banner"><i className="ti ti-calendar-check" /> {calendarMessage}</div>}
    <TodayDashboard plan={plan} currentMember={currentMember} onOpenPillar={onOpenPillar} onStartAlignment={() => setMode('alignment')} onStartRecap={() => setMode('recap')} />
    <NotificationCenter plan={plan} member={currentMember} />
    <TomorrowProposal plan={plan} />
  </div>
}
