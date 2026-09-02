import FinanceMeetings from './FinanceMeetings.jsx'

// Finance meetings now own the household financial cadence. The former Daily
// Alignment route is preserved as the stable navigation entry so existing
// links keep working while Daily becomes one cadence inside Meetings.
export default function DailyAlignment() {
  return <FinanceMeetings />
}
