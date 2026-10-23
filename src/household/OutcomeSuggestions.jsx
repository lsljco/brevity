import {pillarPlanningContext,planningConflicts} from './planningContext.js'
import {useEffect,useState} from 'react'
import {SHARED_STATE_EVENT,getAcknowledgedSharedStateVersion} from './sharedState.js'
import {suggestDailyOutcomes} from './outcomeSuggestions.js'
import {requestAssistantConversation} from '../assistant/actionEvents.js'
export default function OutcomeSuggestions({plan,member,scope,work,appointments,minute,canViewFinance,readOnly,agenda,calendarHealth}){
 const [goals,setGoals]=useState([])
 useEffect(()=>{
  const refresh=()=>{let saved=[];if(canViewFinance){try{if(getAcknowledgedSharedStateVersion(localStorage,'fp_goals')>0)saved=JSON.parse(localStorage.getItem('fp_goals')||'[]')}catch{}}setGoals(Array.isArray(saved)?saved:[])}
  refresh();window.addEventListener(SHARED_STATE_EVENT,refresh);return()=>window.removeEventListener(SHARED_STATE_EVENT,refresh)
 },[canViewFinance,member])
 const items=suggestDailyOutcomes({plan,member,scope,openWork:work.items,appointments,goals:canViewFinance?goals:[],minute})
 const review=()=>requestAssistantConversation(`Review these suggested outcomes for ${member} on ${plan.date}. Retrieve the exact saved source records first. Suggestions are not saved decisions. Help me adjust the top three, preserve other standing outcomes, and prepare any changes for Action Mode approval. Do not mark work complete or create duplicate source tasks. Planning context: ${JSON.stringify({pillars:pillarPlanningContext({plan,member,scope,canViewFinance}),timing:planningConflicts({items:agenda?.items||[],date:plan.date,minute}),calendarState:calendarHealth?.state||'unknown'})}. Treat dated intentions as context, not long-term goals or completion evidence. Resolve timing overlaps with affected members before proposing schedule changes. Sources: ${JSON.stringify(items.map(({id,title,sourceKind,sourceDate})=>({id,title,sourceKind,sourceDate})))}`)
 return <details className="today-saved-outcomes" aria-label="Suggested daily outcomes"><summary>Brevity’s suggested outcomes · {items.length}</summary><p>Ranked from available saved goals, unfinished work and appointments. Suggestions do not change your agreed plan.</p>{work.loading&&<p role="status">Loading unfinished work…</p>}{work.error&&<p role="status">Unfinished work is unavailable; these suggestions may be incomplete.</p>}{items.length?<ol>{items.map(item=><li key={`${item.sourceKind}:${item.id}`}><strong>{item.title}</strong><small>{item.reason}</small></li>)}</ol>:<p>No eligible saved items are available to suggest.</p>}{!readOnly&&<button disabled={!items.length||work.loading} onClick={review}>Review suggestions with Brevity</button>}</details>
}
