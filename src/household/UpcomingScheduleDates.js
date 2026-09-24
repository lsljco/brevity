import {nextDailyPlanDate} from './alignmentDate.js'

export function scheduleDates(today) {
  const dates=[today]
  for(let index=0;index<7;index++)dates.push(nextDailyPlanDate(dates.at(-1)))
  return dates
}
