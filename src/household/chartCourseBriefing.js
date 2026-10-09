import {isFinished} from './dailyRhythm.js'
export const openCourseDecisions=plan=>(plan.decisions||[]).filter(x=>!isFinished(x)&&!['resolved','done'].includes(String(x.status||'').toLowerCase())&&!x.cancelled)
const describe=x=>`${x.title}${x.startTime||x.time?` at ${x.startTime||x.time}`:''}${x.owner?`, ${x.owner}`:''}`
// The opening reads the same loaded records as Today; no second agent lookup or
// invented agenda is needed before the family hears the first response.
export function chartCourseBriefing({plan,agenda,member,calendarReady=true}){
 const parts=[`Good morning. Let's chart the course for ${plan.date}.`]
 parts.push(plan.household?.keyFocus?`Our agreed focus is ${plan.household.keyFocus}.`:'No household focus has been saved for today yet.')
 const priorities=agenda.priorities||[]
 parts.push(priorities.length?`Our recorded priorities are: ${priorities.slice(0,3).map(describe).join('; ')}.`:'No open priorities are recorded in today’s plan yet.')
 const events=(agenda.pending||[]).filter(x=>x.sourceKind==='appointment')
 parts.push(calendarReady?(events.length?`On the Family and ${member} calendars: ${events.slice(0,5).map(describe).join('; ')}.${events.length>5?' More appointments are in the calendar.':''}`:'There are no appointments in the loaded Family and personal calendars for today.'):'The calendar is not fully verified yet. Check the calendar notice before relying on appointment times.')
 const decisions=openCourseDecisions(plan)
 parts.push(decisions.length?`Decisions still to settle: ${decisions.slice(0,3).map(describe).join('; ')}.${decisions.length>3?' More decisions are available in the decision list.':''}`:'There are no open decisions in the saved plan.')
 if(agenda.gaps?.length)parts.push(`We also need to confirm the owner or time for ${agenda.gaps[0].title}.`)
 parts.push('You can keep Today open while we talk. What questions or changes do we need to address?')
 return parts.join(' ')
}
