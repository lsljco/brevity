import {useMemo,useState} from 'react'
import {accountLinkGroups,matchingAssistantPrompt} from './accountLinkReview.js'
import {requestAssistantConversation} from '../assistant/actionEvents.js'

export default function AccountLinkReview({accounts,actuals,sources=[],readOnly,onReview,onOpenAccounts}){
  const groups=useMemo(()=>accountLinkGroups(accounts,actuals,sources),[accounts,actuals,sources])
  const [busy,setBusy]=useState(false),[error,setError]=useState('')
  return <section className="dash-card match-account-review" aria-label="Review account links">
    <h2>First, connect bank activity to the right account</h2>
    <p>{groups.reduce((n,g)=>n+g.count,0)} transactions across {groups.length} bank account groups need review. One verified account link can resolve many rows.</p>
    {!groups.length&&<p>All retained bank activity has a unique compatible account link.</p>}
    {groups.length>0&&<details><summary>Review bank account groups</summary><div className="match-account-groups">{groups.map((group,index)=><article key={group.sourceId||'missing'}>
      <h3>{group.source?`${group.source.institution||'Bank'} · ${group.source.name||'Account'}${group.source.mask?` ••••${group.source.mask}`:''}`:`Bank group ${index+1}${group.sourceId?'':' (missing source ID)'}`}</h3>
      <p>{group.count} transactions · {group.pending} pending</p><p>{group.reason}</p>
      {group.suggestion&&<p>Suggested account: <strong>{group.suggestion.name}</strong></p>}
      {!readOnly&&group.suggestion&&onReview&&<button disabled={busy} onClick={async()=>{setBusy(true);setError('');try{await onReview(group.suggestion,group.sourceId)}catch(cause){setError(cause.message||'Unable to prepare account review.')}finally{setBusy(false)}}}>Review account link</button>}
    </article>)}</div></details>}
    <div className="match-review-actions">{onOpenAccounts&&<button onClick={onOpenAccounts}>Review account details</button>}<button onClick={()=>requestAssistantConversation(matchingAssistantPrompt())}>Ask AI to review exceptions</button></div>
    <p className="match-review-note">AI suggestions need supporting evidence. Account ownership and payments are not changed by this screen. Approved changes use Action Mode and can be undone.</p>
    {error&&<p role="alert">{error}</p>}
  </section>
}
