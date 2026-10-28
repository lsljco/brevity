import { lazy, Suspense } from 'react'
import HouseholdFinanceIntelligence from './HouseholdFinanceIntelligence.jsx'
import './FinanceMeetingsRuntime.css'

const FinanceMeetingsBridge=lazy(()=>import('./FinanceMeetingsBridge.jsx'))

// Household planning detail remains available without preceding the meeting brief.
export default function DailyAlignment(props) {
  return <><Suspense fallback={<div className="app-view-loading">Loading Finance Meetings…</div>}><FinanceMeetingsBridge {...props}/></Suspense><details className="fm-household-detail"><summary>Household obligations & maintenance planning</summary><HouseholdFinanceIntelligence/></details></>
}
