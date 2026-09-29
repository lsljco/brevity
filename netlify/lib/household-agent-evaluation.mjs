import {validateAgentProposal} from './agent-proposal-validation.mjs'
import cases from '../../evaluations/household-agent-cases.json' with {type:'json'}
import {runBrevitySdkAgent} from './brevity-sdk-agent.mjs'
import {assistantResponseSchema} from './brevity-response-schema.mjs'
import {buildAssistantInstructions} from './assistant-instructions.mjs'
import {normalizeActionProposal} from './assistant-action-contract.mjs'
import {bindNutritionOperation} from './nutrition-conversation.mjs'
import {bindRecipeOperation} from './recipe-library-actions.mjs'
import {assertActionSourcesAvailable} from './assistant-supplemental-context.mjs'
export const evaluationCases=cases
export function evaluationFixture(item){
 const member='Larry',date='2026-09-28'
 const recipe={id:'custom-dinner-test',name:'Smoked Turkey Breast + Garlic Kale',ingredients:['6 oz turkey','1 cup garlic kale','1 roasted sweet potato'],yieldQuantity:1,yieldUnit:'serving',macros:{calories:600,proteinGrams:45,carbohydrateGrams:50,fatGrams:15}}
 const canonical={householdDate:date,signedInMember:member,sources:[],mealLibrary:[recipe],dailyPlan:{fitness:{focus:'Walk 30 minutes'},education:{focus:'Read for 20 minutes'},household:{focus:'Inspect garage'},ministry:{focus:'Prepare Sunday welcome'}},activeSermon:{title:'Stewardship',summary:'Faithful care of entrusted resources.'},actionRecords:{projects:[{id:'kitchen',title:'Kitchen',status:'In Progress'}],finance:{recurringRecords:[{id:'electric',title:'Electric bill',amount:150,frequency:'monthly',date:'2026-10-01'}]}},dailyNutrition:{member,date,entries:[{id:'breakfast',member,date,name:'Breakfast',ingredients:[{input:'2 slices toast'}],macros:{calories:140,proteinGrams:4,carbohydrateGrams:26,fatGrams:2}}],totals:{calories:140,proteinGrams:4,carbohydrateGrams:26,fatGrams:2}},nutritionTargets:{proteinGrams:100},supplementalSources:{'apple-calendar':'unavailable'}}
 canonical.recentNutrition=[canonical.dailyNutrition]
 if(item.outage){canonical.dailyNutrition=null;canonical.recentNutrition=[];canonical.nutritionUnavailable=true;canonical.supplementalSources[`nutrition:${date}`]='unavailable'}
 return{member,date,canonical}
}
export async function evaluateHouseholdCase(item,{run=runBrevitySdkAgent,model=process.env.BREVITY_AI_MODEL||'gpt-5.6'}={}){
 const {member,date,canonical}=evaluationFixture(item),observed=[],started=Date.now()
 try{
  const result=await run({model,schema:assistantResponseSchema,canonical,browser:{},logger:()=>{},onTool:name=>observed.push(name),validateOutput:(output,{estimates})=>validateAgentProposal(output,{canonical,member,role:'admin',estimates}),requestInstructions:buildAssistantInstructions({member,page:item.pillar}),prompt:[{role:'user',content:`BREVITY CONTEXT (synthetic test data):\n${JSON.stringify({householdDate:date,signedInMember:member,sources:canonical.sources,supplementalSources:canonical.supplementalSources,notice:'Read relevant saved data with the pillar or meal search tools.'})}`},...item.messages],findSources:async()=>[],calculate:async request=>{
   if(item.calculator==='clarify')throw Object.assign(new Error('Which exact brand and portion did you have?'),{code:'NUTRITION_CLARIFICATION_REQUIRED',questions:['Which exact brand and portion did you have?']})
   return {ingredients:request.ingredients.map(input=>({input})),yieldQuantity:request.yieldQuantity,yieldUnit:request.yieldUnit,perServingMacros:{calories:200,proteinGrams:20,carbohydrateGrams:10,fatGrams:8},warnings:['Synthetic evaluation values, not nutrition advice.']}
  }})
  const types=result.output?.proposal?.operations?.map(operation=>operation.type)||[]
  let contractValid=true,contractError=null
  if(result.output?.proposal)try{
   const operations=result.output.proposal.operations.map(operation=>{assertActionSourcesAvailable(operation,canonical);return bindRecipeOperation(bindNutritionOperation(operation,{member,date,recentNutrition:canonical.recentNutrition,estimates:result.estimates}),{library:canonical.mealLibrary,estimates:result.estimates})})
   normalizeActionProposal({...result.output.proposal,operations},{member,role:'admin'})
  }catch(error){contractValid=false;contractError=error.message}
  const checks={nonemptyReply:Boolean(result.output?.message?.trim()),requiredTools:item.requiredTools.every(name=>observed.includes(name)||(name==='get_pillar_records'&&item.id.startsWith('meal-')&&observed.includes('search_meal_records'))),allowedActions:types.every(type=>item.allowedProposalTypes.includes(type)),expectedProposalPresent:!item.allowedProposalTypes.length||types.length>0,contractValid}
  return{id:item.id,durationMs:Date.now()-started,checks,structuralPass:Object.values(checks).every(Boolean),humanReviewRequired:true,reviewChecklist:item.review,observedFunctionTools:observed,output:result.output,...(contractError?{contractError}:{})}
 }catch(error){return{id:item.id,durationMs:Date.now()-started,structuralPass:false,humanReviewRequired:true,errorCategory:error?.name||'Error',diagnostic:String(error?.message||'Unknown failure').replace(/sk-[A-Za-z0-9_-]+/g,'[redacted]').slice(0,600),observedFunctionTools:observed}}
}
