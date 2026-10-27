import {pillarPlanningContext} from './planningContext.js'
const icons={spiritual:'sun',health:'heart',fitness:'run',household:'home',education:'book',finance:'building-bank',ministry:'users'}
export default function FamilyPillarBrief({plan,member,scope,canViewFinance,onOpenPillar}){
 const pillars=pillarPlanningContext({plan,member,scope,canViewFinance})
 return <section className="family-pillar-brief" aria-label="Family pillar briefing"><header><div><span className="family-eyebrow">Purpose behind the plan</span><h2>What matters to our family</h2></div><p>Daily intentions, with room for the details when you need them.</p></header><div className="family-pillar-grid">{pillars.map(item=><article key={item.pillar}><i className={`ti ti-${icons[item.pillar]}`} aria-hidden="true"/><h3>{item.label}</h3><p>{item.intent||'No daily intention recorded.'}</p>{item.outcomes.length>0&&<small>{item.outcomes.length} open {item.outcomes.length===1?'outcome':'outcomes'}</small>}{onOpenPillar&&<button onClick={()=>onOpenPillar(item.pillar)} aria-label={`Explore ${item.label}`}>Explore <span aria-hidden="true">↗</span></button>}</article>)}</div></section>
}
