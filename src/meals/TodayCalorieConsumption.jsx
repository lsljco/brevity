import { requestAssistantConversation } from '../assistant/actionEvents.js'

const FIELDS = [['calories','Calories','cal'],['proteinGrams','Protein','g'],['carbohydrateGrams','Carbs','g'],['fatGrams','Fat','g']]
const display = value => Number(value).toLocaleString(undefined,{maximumFractionDigits:1})

export default function TodayCalorieConsumption({nutrition,currentMember,date,error}) {
  const verified=nutrition?.member===currentMember && nutrition?.date===date
  const day=verified ? nutrition.days?.find(item=>item.date===date && item.member===currentMember) : null
  const complete=FIELDS.every(([key])=>Number.isFinite(day?.totals?.[key]) && day.totals[key]>=0)
  return <section className="today-macro-summary today-calorie-consumption" aria-label="Macro goals versus consumed">
    <h3>{currentMember}’s consumed daily macros</h3>
    <p>{currentMember} · Today, {date}. Only food saved through Action Mode counts as consumed; planned meals are excluded.</p>
    {!complete && <p role="status">{error || (!nutrition?'Loading your consumed macros…':'Some consumed macros could not be verified for today.')}</p>}
    <div className="today-macro-goals">{FIELDS.map(([key,label,unit])=>{
      const consumed=day?.totals?.[key],hasConsumed=Number.isFinite(consumed)&&consumed>=0
      const goal=verified?nutrition.targets?.[key]:null,hasGoal=Number.isFinite(goal)&&goal>0
      const difference=hasConsumed&&hasGoal?Number((goal-consumed).toFixed(1)):null
      return <div key={key}>
        <strong>{label}</strong>
        <p>{hasConsumed?`${display(consumed)} ${unit}`:'Not verified'} / {hasGoal?`${display(goal)} ${unit}`:(verified?'Goal not set':'Not verified')}</p>
        {hasConsumed&&hasGoal&&<progress aria-label={`${label} consumed versus goal`} max={goal} value={Math.min(consumed,goal)}/>}
        <small>{difference===null?(hasConsumed?'Set your target with Brevity':'Consumed amount not verified'):difference===0?'Goal reached':`${display(Math.abs(difference))} ${unit} ${difference<0?'over goal':'below goal'}`}</small>
      </div>
    })}</div>
    {complete && day.entries?.length===0 && <p>No food has been logged today.</p>}
    <button type="button" onClick={()=>requestAssistantConversation('Help me log what I consumed today. Read my saved nutrition record first, ask about any unclear foods, brands and portions, calculate nutrition, and prepare the entry for Action Mode review.')}>Log food with Brevity</button>
  </section>
}
