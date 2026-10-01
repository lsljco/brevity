import { requestAssistantConversation } from '../assistant/actionEvents.js'

const display = value => Number(value).toLocaleString(undefined,{maximumFractionDigits:1})

export default function TodayCalorieConsumption({nutrition,currentMember,date,error}) {
  const verified=nutrition?.member===currentMember && nutrition?.date===date
  const day=verified ? nutrition.days?.find(item=>item.date===date && item.member===currentMember) : null
  const consumed=day?.totals?.calories
  const hasConsumed=Number.isFinite(consumed) && consumed>=0
  const goal=verified ? nutrition.targets?.calories : null
  const hasGoal=Number.isFinite(goal) && goal>0
  const difference=hasConsumed && hasGoal ? goal-consumed : null
  return <section className="today-calorie-consumption" aria-label="Calorie goal versus consumed">
    <h3>Calorie Goal vs. Consumed</h3>
    <p>{currentMember} · Today, {date}. Only food saved through Action Mode counts as consumed; planned meals are excluded.</p>
    {!hasConsumed && <p role="status">{error || (!nutrition?'Loading your consumed calories…':'Consumed calories could not be verified for today.')}</p>}
    <dl className="today-calorie-values">
      <div><dt>Daily calorie goal</dt><dd>{hasGoal?`${display(goal)} cal`:(verified?'Goal not set':'Not verified')}</dd></div>
      <div><dt>Consumed</dt><dd>{hasConsumed?`${display(consumed)} cal`:'Not verified'}</dd></div>
      <div><dt>{difference!=null && difference<0?'Over goal':'Remaining'}</dt><dd>{difference==null?'—':`${display(Math.abs(difference))} cal`}</dd></div>
    </dl>
    {hasConsumed && hasGoal && <><progress aria-label="Calories consumed versus goal" max={goal} value={Math.min(consumed,goal)}/><p>{difference===0?'Calorie goal reached.':difference<0?`${display(-difference)} calories over your goal.`:`${display(difference)} calories remaining.`}</p></>}
    {hasConsumed && day.entries?.length===0 && <p>No food has been logged today.</p>}
    <button type="button" onClick={()=>requestAssistantConversation('Help me log what I consumed today. Read my saved nutrition record first, ask about any unclear foods, brands and portions, calculate nutrition, and prepare the entry for Action Mode review.')}>Log food with Brevity</button>
  </section>
}
