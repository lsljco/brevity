import FinanceMeetingsBridge from './FinanceMeetingsBridge.jsx'
import HouseholdFinanceIntelligence from './HouseholdFinanceIntelligence.jsx'
import './FinanceMeetingsRuntime.css'

// Finance Meetings is the operating rhythm; household obligations sit above it
// as planning intelligence without changing posted bank truth.
export default function DailyAlignment(props) {
  return <><div style={{padding:'18px 24px 0'}}><HouseholdFinanceIntelligence/></div><FinanceMeetingsBridge {...props}/></>
}
