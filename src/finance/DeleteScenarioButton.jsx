import {useState} from 'react'
import {prepareDirectAction} from '../assistant/assistantApi.js'
import {requestActionReview} from '../assistant/actionEvents.js'
import {getAcknowledgedSharedStateVersion} from '../household/sharedState.js'
import {SCENARIO_STORAGE_KEY} from './scenarioModelingData.js'
import './DeleteScenarioButton.css'
export default function DeleteScenarioButton({id,kind,title,disabled=false}){
 const [busy,setBusy]=useState(false),[error,setError]=useState('')
 async function review(){setBusy(true);setError('');try{
  const result=await prepareDirectAction({summary:`Delete scenario: ${title}`,expectedVersion:getAcknowledgedSharedStateVersion(localStorage,SCENARIO_STORAGE_KEY),operation:{type:'forecast.update',targetId:id,payload:{scenarioAction:'delete',scenarioKind:kind},description:`Delete only the scenario “${title}” and its saved assumptions. Recover it with Undo in Action Mode history.`}})
  if(!result?.proposal?.id)throw Error('The deletion review could not be prepared.')
  requestActionReview(result.proposal)
 }catch(e){setError(e.message)}finally{setBusy(false)}}
 return <><button type="button" className="scenario-delete-saved" aria-label={`Delete scenario ${title}`} disabled={disabled||busy} onClick={review}>{busy?'Preparing review…':'Delete scenario'}</button>{error&&<small role="alert">{error}</small>}</>
}
