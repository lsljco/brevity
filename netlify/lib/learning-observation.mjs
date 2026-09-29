import {applyCompletedTutorSession,emptyIsaiahEducationRecord,RESPONSE_RESULTS} from '../../src/education/educationRecord.js'
export const LEARNING_RESOURCE='shared:brevity_education_isaiah_v1'
export const learningReviewer=member=>['Larry','Lorenzo','Terica'].includes(member)
export function normalizeLearningObservation(payload){
 if(!payload||Object.keys(payload).some(key=>!['observations','notes'].includes(key))||!Array.isArray(payload.observations)||!payload.observations.length||payload.observations.length>30)throw Error('Provide one to thirty observed learning results.')
 if(payload.notes!==undefined&&(typeof payload.notes!=='string'||payload.notes.length>2000))throw Error('Learning notes must be brief text.')
 const observations=payload.observations.map(row=>{
  if(!row||Object.keys(row).some(key=>!['skillId','activityId','result','standardCodes','stretch'].includes(key)))throw Error('Use observed skill, activity, result and optional standards/stretch evidence only.')
  for(const field of ['skillId','activityId'])if(typeof row[field]!=='string'||!row[field].trim()||row[field].length>160)throw Error('Identify the observed skill and activity.')
  if(!RESPONSE_RESULTS.includes(row.result))throw Error('Say whether the student was independent, prompted, incorrect or unable; do not invent an assessment.')
  if(row.standardCodes!==undefined&&(!Array.isArray(row.standardCodes)||row.standardCodes.length>12||row.standardCodes.some(v=>typeof v!=='string'||!v||v.length>80)))throw Error('Invalid learning standards.')
  if(row.stretch!==undefined&&typeof row.stretch!=='boolean')throw Error('Stretch evidence must be explicit.')
  return {...row}
 })
 return {observations,notes:payload.notes||''}
}
export function applyLearningObservation(value,operation,{actor,now,createId}){
 const payload=normalizeLearningObservation(operation.payload),id=createId()
 return applyCompletedTutorSession(value&&!Array.isArray(value)?value:emptyIsaiahEducationRecord(),{id,date:operation.targetDate,assessor:actor,notes:payload.notes,responses:payload.observations.map((row,i)=>({...row,id:`${id}-${i}`}))},{now:now().toISOString()})
}
