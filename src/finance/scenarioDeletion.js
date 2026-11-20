import {cloneDefaultScenarioModel} from './scenarioModelingData.js'
import {ALL_WORK_SCENARIOS} from './workScenarios.js'
import {RECOVERY_ID} from './recoveryScenario.js'
import {WORKSHEET_ID} from './recoveryWorksheet.js'
export const scenarioCollection={studio:'studioPlans',income:'scenarios',recovery:'recoveryPlans'}
export function deleteScenario(value={},id,kind){
 value=value||{}
 const key=scenarioCollection[kind]
 if(!key||!id||id==='model')throw Error('Choose the exact scenario to delete.')
 const rows=Array.isArray(value[key])?value[key]:kind==='income'?cloneDefaultScenarioModel().scenarios:[]
 const template=kind==='recovery'&&[RECOVERY_ID,WORKSHEET_ID,...ALL_WORK_SCENARIOS.map(s=>s.id)].includes(id)
 if(!rows.some(row=>row.id===id)&&(!template||value.deletedScenarios?.includes(`${kind}:${id}`)))throw Error('That scenario no longer exists. Refresh Scenario Modeling.')
 return {...value,[key]:rows.filter(row=>row.id!==id),deletedScenarios:[...new Set([...(value.deletedScenarios||[]),`${kind}:${id}`])]}
}
