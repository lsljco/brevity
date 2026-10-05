import GovernanceControls,{CoordinationControls} from './GovernanceControls.jsx'
import {useCallback,useEffect,useRef,useState} from 'react'
import {prepareDirectAction} from '../assistant/assistantApi.js'
import {requestActionReview,ACTION_COMPLETED_EVENT} from '../assistant/actionEvents.js'
import {GOV_POLICY} from './orchestration.js'
import './OrchestrationPanel.css'

export default function OrchestrationPanel({date,currentMember,readOnly=false,onOpenSource}) {
  const [state,setState]=useState({loading:true}),[selected,setSelected]=useState(''),[note,setNote]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('')
  const sequence=useRef(0)
  const refresh=useCallback(async()=>{
    const ticket=++sequence.current
    setState({loading:true});setError('')
    try {
      const response=await fetch(`/.netlify/functions/household-orchestration?date=${encodeURIComponent(date)}`,{credentials:'include',cache:'no-store'})
      const data=await response.json()
      if(!response.ok)throw Error(data.error||'Assistance is unavailable.')
      if(typeof data.enabled!=='boolean'||(data.enabled&&(!Array.isArray(data.cases)||!data.systemHealth)))throw Error('The assistance response could not be verified.')
      if(ticket===sequence.current)setState({data})
    } catch(failure){if(ticket===sequence.current)setState({error:failure.message})}
  },[date,currentMember])
  useEffect(()=>{setSelected('');setNote('');setMessage('');refresh();const changed=()=>refresh();window.addEventListener(ACTION_COMPLETED_EVENT,changed);return()=>{sequence.current++;window.removeEventListener(ACTION_COMPLETED_EVENT,changed)}},[refresh])
  const model=state.data,item=[...(model?.cases||[]),...(model?.closedCases||[])].find(x=>x.id===selected)
  async function review(event,options={}){
    setBusy(true);setError('');setMessage('')
    try {
      const pause=typeof event==='boolean'
      const operation=event&&typeof event==='object'?event:pause?{type:'orchestration.pause.update',targetId:'household',targetDate:date,payload:{paused:event},description:`${event?'Pause':'Resume'} household assistance. Existing responsibilities and ownership stay in place.`}:{type:'orchestration.case.update',targetId:item.id,targetDate:item.date,payload:{event,note,sourceVersions:item.sourceVersions||model.sourceVersions},description:`${event}: assistance record for ${item.title}. This does not change responsibility completion, ownership, or coverage.`}
      const result=await prepareDirectAction({summary:operation.description,...(options.operations?.length?{operations:[operation,...options.operations]}:{operation}),expectedVersion:options.expectedVersion??model.version,...(options.expectedVersions?{expectedVersions:options.expectedVersions}:{})})
      if(!result?.proposal?.id)throw Error('A review could not be prepared.')
      requestActionReview(result.proposal);setMessage('Review prepared. Nothing is saved until you confirm in Action Mode.')
    } catch(failure){setError(failure.message)}finally{setBusy(false)}
  }
  const editable=!readOnly&&model?.canReview&&model?.caseStoreAvailable&&Number.isInteger(model?.version)&&!busy
  const ownsItem=model?.isAdmin||item?.owners.includes(currentMember)||item?.coveredBy===currentMember
  return <section className="orchestration-panel" aria-label="Brevity can help">
    <header><div><span>GOV-001 · Household orchestration</span><h2>Brevity can help</h2><p>Prepare useful work while keeping human ownership.</p></div><button onClick={refresh} disabled={state.loading||busy}>Refresh assistance</button></header>
    <details><summary>Human Ownership, AI Delegation &amp; Household Orchestration</summary><p>{GOV_POLICY.status}</p><ol>{GOV_POLICY.principles.map(text=><li key={text}>{text}</li>)}</ol><p>{GOV_POLICY.authority.map(([level,label])=>`${level} ${label}`).join(' · ')}</p><p>{GOV_POLICY.restrictions}</p><p>Configure and ratify household routing below. Assistance preserves ownership; support requires acceptance and source changes require review.</p></details>
    {state.loading?<p role="status">Verifying responsibility sources…</p>:state.error?<p role="alert">{state.error} Missing data is not evidence of failure.</p>:model?.enabled===false?<p>{model.notice}</p>:model&&<>
      <p>{model.systemHealth.scope} · {model.systemHealth.unknown} unknown · {model.systemHealth.blocked} blocked · {model.systemHealth.unassigned} awaiting an owner</p>
      <p>{model.systemHealth.notice}</p>
      {model.backlog?.additionalDates>0&&<p>{model.backlog.additionalDates} older case dates are outside this bounded view. Review those dates in Today; this is not a complete backlog.</p>}
      {model.systemHealth.unavailableSources>0&&<p role="status">{model.systemHealth.unavailableSources} source(s) unavailable. This view is incomplete. {(model.unavailableSourceNames||[]).join(', ')}. Refresh or review these source screens; known responsibilities remain available.</p>}
      {!model.caseStoreAvailable&&<p role="alert">Assistance history could not be verified. Recording changes is unavailable.</p>}
      {model.paused&&<p role="status">Household assistance is paused. Existing responsibilities continue; previews remain available.</p>}
      {model.isAdmin&&<button disabled={!editable} onClick={()=>review(!model.paused)}>{model.paused?'Review resume assistance':'Review pause assistance'}</button>}
      <GovernanceControls key={`${model.version}-${model.preferenceVersion}`} model={model} member={currentMember} date={date} review={review} disabled={!editable} />
      <details><summary>My in-app follow-up inbox ({model.inbox?.messages?.length||0})</summary>{model.inbox?.coverage&&<p>Most recent bounded run: {model.inbox.coverage.processed} of {model.inbox.coverage.available} visible cases, prioritizing evidenced consequence and blocked work.</p>}{model.inbox?.error&&<p>{model.inbox.error}</p>}{model.inbox?.messages?.map(message=><article key={message.id}><h4>{message.title}</h4><button onClick={()=>setSelected(message.caseId)}>Review this responsibility</button><p>Owner: {message.owner} · {message.updatedAt}</p>{message.exception?<><p>{message.exception.risk}</p><p>{message.exception.recommendation}</p><p>{message.exception.decision} · {message.exception.deadline}</p></>:<ul>{message.preparation?.checklist?.map((text,i)=><li key={i}>{text}</li>)}</ul>}</article>)}</details>
      <label className="orchestration-select">Responsibility<select value={selected} onChange={e=>{setSelected(e.target.value);setNote('');setError('');setMessage('')}}><option value="">Choose a responsibility</option>{[...model.cases,...(model.closedCases||[])].map(row=><option key={row.id} value={row.id}>{row.title} — {row.resolved?'assistance resolved':row.state}{row.date!==date?` · ${row.date}`:""}</option>)}</select></label>
      {!model.cases.length&&<p>No open cases in the available records you can access. This does not establish that every household outcome is complete.</p>}
      {item&&<article><h3>{item.title}</h3><p><strong>Owner:</strong> {item.owners.join(', ')||'Unresolved — no fallback assigned'}{item.coveredBy&&` · Coverage: ${item.coveredBy}`}</p><p><strong>Status:</strong> {item.state} · <strong>Orchestration:</strong> {item.stage}</p><p>{item.evidence}</p><p><strong>Required outcome:</strong> {item.outcome}</p>
        <h4>Prepared next steps</h4><ul>{item.assistance.checklist.map((step,index)=><li key={index}>{step}</li>)}</ul><p>{item.assistance.questions.join(' ')}</p><p>{item.assistance.recommendation}</p>
        <button onClick={()=>onOpenSource?.(item.kind)}>Open source workflow</button>
        <details><summary>Decision-ready exception preview</summary><dl>{[['Issue',item.exception.issue],['Owner',item.exception.owner],['Required outcome',item.exception.requiredOutcome],['What happened',item.exception.whatHappened],['What Brevity already attempted',item.exception.attempts.join('\n')],['Current risk / consequence',item.exception.risk],['Available options',item.exception.options.join('\n')],['Brevity recommendation',item.exception.recommendation],['Decision required',item.exception.decision],['Deadline',item.exception.deadline],['Recipient',item.exception.routing]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></details>
        <CoordinationControls key={item.id} item={item} model={model} member={currentMember} review={review} disabled={!editable||model.paused||item.stage==='paused'} />
        <label>Optional shared coordination note<textarea value={note} onChange={e=>setNote(e.target.value)} maxLength={1000} rows={3}/></label><p>Saving records this reviewed assistance event. It does not mark the responsibility complete or send a message.</p>
        {!item.resolved&&!['completed','verified'].includes(item.state)&&<div className="orchestration-actions"><button disabled={!editable||!ownsItem||model.paused||item.stage==='paused'} onClick={()=>review({type:'orchestration.case.update',targetId:item.id,targetDate:item.date,payload:{event:'snooze',note,sourceVersions:item.sourceVersions||model.sourceVersions,snoozeUntil:new Date(Date.now()+24*3600000).toISOString()},description:'Snooze this assistance case for 24 hours. Source deadlines and responsibilities remain unchanged.'})}>Review snooze 24 hours</button><button disabled={!editable||!ownsItem||model.paused||item.stage==='paused'} onClick={()=>review('acknowledge')}>Review acknowledgement</button><button disabled={!editable||!ownsItem||model.paused||item.stage==='paused'} onClick={()=>review('prepare')}>Review and retain preparation</button><button disabled={!editable||!ownsItem||model.paused} onClick={()=>review(item.stage==='paused'?'resume':'pause')}>Review {item.stage==='paused'?'resume':'pause'} case</button></div>}
        <details><summary>Reviewed assistance history ({item.events.length})</summary>{item.events.length?<ol>{item.events.map(event=><li key={event.id}>{event.at} · {event.actor} · {event.event}{event.note&&<p>{event.note}</p>}{event.preparation&&<ul>{event.preparation.checklist.map((step,i)=><li key={i}>{step}</li>)}</ul>}</li>)}</ol>:<p>No assistance has been recorded. Use existing Audit History for completed actions and Undo.</p>}</details>
      </article>}
    </>}
    {message&&<p role="status">{message}</p>}{error&&<p role="alert">{error}</p>}
  </section>
}
