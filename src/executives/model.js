// Roles describe operating scopes, not separate authenticated identities.
export const EXECUTIVE_ROLES = Object.freeze([
  {id:'bruce',name:'Bruce · Chief of Staff',active:true,owns:'Executive priorities and decisions',cadence:'After executive reviews and when priorities conflict'},
  {id:'coo',name:'Chief Operating Officer',active:true,owns:'Household execution and capacity',cadence:'Before daily planning, on changed commitments, and at daily close'},
  {id:'cfo',name:'Chief Financial Officer',active:true,owns:'Financial strategy and verified financial reporting',cadence:'Before the finance briefing and on material financial changes'},
  {id:'cto',name:'Chief Technology Officer',active:true,owns:'Reliability, defects and technical verification',cadence:'Daily technical review and after releases or failures'},
  {id:'analyst',name:'Financial Analyst',active:false,owns:'Reconciliation and calculations',cadence:'Before CFO review'},
  {id:'reviewer',name:'Independent Quality Reviewer',active:false,owns:'Separate verification findings',cadence:'Before material conclusions are certified'},
  {id:'career',name:'Chief Career Officer',active:false,owns:'Career pipeline and interview outcomes',cadence:'During career work and when an opportunity changes'},
  {id:'creative',name:'Chief Creative Officer',active:false,owns:'Creative direction and production',cadence:'During creative planning and production'},
])
export const HANDOFF_STATES=['queued','in-progress','blocked','reported-complete','cancelled']
export const EXECUTIVE_NOTICE='Roles use your administrator session. They are not separately authenticated agents. A queued handoff does not start a worker or send a message. Existing external schedules are not managed here.'
export function activeExecutive(role){return EXECUTIVE_ROLES.some(item=>item.id===role&&item.active)}
