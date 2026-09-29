import {assertActionSourcesAvailable} from './assistant-supplemental-context.mjs'
import {bindNutritionOperation} from './nutrition-conversation.mjs'
import {bindRecipeOperation} from './recipe-library-actions.mjs'
import {normalizeActionProposal} from './assistant-action-contract.mjs'

// Pure validation: no persistence, side effects, or weaker fallback contract.
export function validateAgentProposal(output,{canonical,member,role,estimates}){
 if(!output?.proposal)return
 const operations=output.proposal.operations.map(operation=>{
  if(operation.type==='member.preference.set'&&operation.targetId!==member)throw Error('Members can change only their own preferences.')
  assertActionSourcesAvailable(operation,canonical)
  if(operation.type==='plan.pillar.update'){
   const payload=operation.payload||JSON.parse(operation.payloadJson||'{}')
   if(payload.pillar==='household'&&Object.hasOwn(payload.patch||{},'appointments'))throw Error('Appointments must use the Family Calendar action and an exact verified event. A household plan appointment is not a substitute for an unavailable calendar event. Explain the missing source or clarify the event; do not create a replacement in another record.')
  }
  return bindRecipeOperation(bindNutritionOperation(operation,{member,date:canonical.householdDate,recentNutrition:canonical.recentNutrition,estimates}),{library:canonical.mealLibrary||[],estimates})
 })
 normalizeActionProposal({...output.proposal,operations},{member,role})
}
export const ACTION_REPAIR_GUIDANCE='Correct the proposed action to the production contract without changing the user intent. No change has been saved. For nutrition.meal.update or nutrition.meal.remove, targetId MUST be the signed-in MEMBER name, targetDate the saved meal date, and the saved meal ID MUST be payload.entryId. Update payload contains only name, entryId, reason, estimateId. Remove payload contains only entryId and reason. For meal.recipe.update targetId is the saved RECIPE id and payload contains ONLY name and optionally estimateId; do not include ingredients, yield or macros directly because the server binds them from the estimate. Reuse valid estimates already calculated. Never relax ownership, invent records or fabricate an estimateId. Return the corrected proposal when the request and records support it; otherwise explain the actual missing information without claiming a review exists.'
