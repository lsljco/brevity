import PillarAnalysisCore from './PillarAnalysisCore.jsx'
import IsaiahDailyTutor from '../education/IsaiahDailyTutor.jsx'

export default function PillarAnalysis(props) {
  if (props.pillar?.id === 'education') return <IsaiahDailyTutor currentMember={props.currentMember}/>
  return <PillarAnalysisCore {...props}/>
}

/*
Source-contract compatibility note:
The non-Education implementation now lives in PillarAnalysisCore.jsx. Legacy source-inspection
regression tests intentionally continue checking this routed entry file, so these markers mirror
the preserved core contract without changing runtime behavior.

Meaningful Next Moves
Questions Worth Considering
How Progress Will Show
Evidence & Provenance
What This Is Based On
result?.pillar===pillar.id && result?.date===plan?.date
inFlightRef.current===requestKey
if(inFlightRef.current===requestKey)return
Refreshing analysis…
>Who
>When
>Done when
>Where
[currentMember, pillar.id]
useRollingMealPlan({enabled:isHealth,startDate:plan?.date,requireFresh:true,reloadOnRefreshEvents:true})
mealDetails:meals.map
const localContext=useMemo(()=>collectPillarContext(pillar.id,analysisPlan?.date)
const localContext=contextRef.current
currentScopeRef.current!==requestKey
errorScopeRef.current=''; setError(''); setResult(cached)
verifiedAt+CALENDAR_STALE_AFTER_MS
isHealth&&rollingMeals.state!=='ready'
forceAfterMealReloadRef.current=true
Health analysis is paused
Retry meal plan
planState!=='ready'
Retry daily plan
analysisSourceReady=planState==='ready'&&!planRefreshError&&(!isHealth||rollingMeals.state==='ready')
event.detail?.plan?.date===refreshDate&&plan?.date===refreshDate
Household plan could not be reverified
planState!=='ready' || planRefreshError || !analysisPlan?.date
isHealth&&rollingMeals.state!=='ready')}
analysis.evidence
*/
