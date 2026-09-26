import { useMemo, useState } from 'react'
import { calendarAppointmentsForPlan } from '../family/calendarOverlay.js'
import { calendarSnapshotHealth } from '../family/calendarSnapshot.js'
import { buildHouseholdMaintenanceWeek, householdOccurrence, HOUSEHOLD_MAINTENANCE_STORAGE_KEY, normalizeHouseholdMaintenanceState, occurrenceStatus } from './householdMaintenanceData.js'
import { formatDailyPlanDate } from './alignmentDate.js'
import { scheduleDates } from './UpcomingScheduleDates.js'
import { useDailyPlan } from './useDailyPlan.js'
import { useRollingMealPlan } from '../meals/useRollingMealPlan.js'
import TodayDashboard from './TodayDashboard.jsx'
import './UpcomingSchedule.css'

export default function UpcomingSchedule({ today, calendarData, currentMember, canViewFinance, onBack, onOpenPillar, onOpenCalendar, onOpenMealPlan }) {
  const dates = useMemo(() => scheduleDates(today), [today])
  const [date, setDate] = useState(dates[1])
  const selectedDate = dates.includes(date) ? date : dates[1]
  const { plan, state, error, reload } = useDailyPlan(selectedDate)
  const mealPlan = useRollingMealPlan({ startDate: selectedDate, count: 1, requireFresh: true })
  const meals = mealPlan.data?.days?.find(day => day.date === selectedDate)?.resolvedMeals || {}
  const appointments = useMemo(() => calendarAppointmentsForPlan(plan, calendarData?.events), [plan, calendarData?.events])
  const calendarHealth = useMemo(() => calendarSnapshotHealth(calendarData), [calendarData])
  const chores = useMemo(() => {
    let saved
    try { saved = JSON.parse(localStorage.getItem(HOUSEHOLD_MAINTENANCE_STORAGE_KEY) || '{}') } catch { saved = {} }
    const maintenance = normalizeHouseholdMaintenanceState(saved)
    return (buildHouseholdMaintenanceWeek(selectedDate, maintenance).find(day => day.date === selectedDate)?.tasks || [])
      .map(task => ({ ...task, status: occurrenceStatus(task, householdOccurrence(maintenance, task)) }))
  }, [selectedDate])

  return <div className="household-today-workspace upcoming-schedule">
    <div className="upcoming-schedule-navigation"><button type="button" onClick={onBack}>Back to Today</button><label>Choose a day<select aria-label="Choose a day" value={selectedDate} onChange={event => setDate(event.target.value)}>{dates.map((day, index) => <option key={day} value={day}>{index === 0 ? 'Today · ' : index === 1 ? 'Tomorrow · ' : ''}{formatDailyPlanDate(day)}</option>)}</select></label><span>Viewing this day’s Seven Pillars. Calendar appointments are read-only.</span></div>
    {state === 'loading' && <p className="today-sync-banner" role="status">Loading this day’s shared plan…</p>}
    {state === 'error' && <div className="today-sync-banner today-sync-banner--error" role="alert">{error}<button type="button" onClick={reload}>Retry</button></div>}
    {state === 'ready' && <TodayDashboard key={selectedDate} plan={plan} meals={meals} mealPlanState={mealPlan.state} mealPlanError={mealPlan.error} readOnly canViewFinance={canViewFinance} browsingDate calendarAppointments={appointments} calendarHealth={calendarHealth} householdChores={chores} currentMember={currentMember} onOpenPillar={onOpenPillar} onOpenCalendar={onOpenCalendar} onOpenMealPlan={onOpenMealPlan} />}
  </div>
}
