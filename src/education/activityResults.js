export const EDUCATION_ACTIVITY_RESULTS=[
 {id:'independent',label:'Correct Independently',masteryWeight:1},
 {id:'prompted',label:'Correct With Prompt',masteryWeight:0.5},
 {id:'incorrect',label:'Incorrect',masteryWeight:0},
 {id:'unable',label:'Could Not Attempt',masteryWeight:0},
]
export function resultById(id){return EDUCATION_ACTIVITY_RESULTS.find(item=>item.id===id)||null}
