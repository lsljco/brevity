export const COMPLETION_REVIEWER='Larry'
export function submitProjectCompletion(item,{actor,now}){
 if(item.status!=='Done')return {...item,signoffRequired:true,signoffBy:COMPLETION_REVIEWER,completionReview:null}
 return {...item,status:'In Progress',signoffRequired:true,signoffBy:COMPLETION_REVIEWER,completionReview:{state:'pending',submittedBy:actor,submittedAt:now,approvedBy:'',approvedAt:'',returnReason:''}}
}
export function reviewProjectCompletion(item,payload,{actor,now}){
 if(actor!==COMPLETION_REVIEWER)throw Error('Larry must sign off on project completion.')
 if(item.completionReview?.state!=='pending')throw Error('Only a project awaiting sign-off can be reviewed.')
 if(!['approve','return'].includes(payload.action))throw Error('Choose approve or return.')
 if(payload.action==='return'&&!payload.reason?.trim())throw Error('Explain what needs to be corrected.')
 return {...item,status:payload.action==='approve'?'Done':'In Progress',signoffRequired:true,signoffBy:COMPLETION_REVIEWER,completionReview:{...item.completionReview,state:payload.action==='approve'?'approved':'returned',approvedBy:payload.action==='approve'?actor:'',approvedAt:payload.action==='approve'?now:'',returnedBy:payload.action==='return'?actor:'',returnedAt:payload.action==='return'?now:'',returnReason:payload.action==='return'?payload.reason.trim():''},updatedAt:now,updatedBy:actor}
}
