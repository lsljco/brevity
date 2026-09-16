import { lazy, Suspense } from 'react'
import HouseholdFinanceIntelligence from './HouseholdFinanceIntelligence.jsx'
import './FinanceMeetingsRuntime.css'

const FinanceMeetingsBridge=lazy(()=>import('./FinanceMeetingsBridge.jsx'))

// Finance Meetings is the operating rhythm; household obligations sit above it
// as planning intelligence without changing posted bank truth.
export default function DailyAlignment(props) {
  return <><div style={{padding:'18px 24px 0'}}><HouseholdFinanceIntelligence/></div><Suspense fallback={<div className="app-view-loading">Loading Finance Meetings…</div>}><FinanceMeetingsBridge {...props}/></Suspense></>
}
