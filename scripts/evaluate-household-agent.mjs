import {readFile,writeFile} from 'node:fs/promises'
import {runBrevitySdkAgent} from '../netlify/lib/brevity-sdk-agent.mjs'
import {assistantResponseSchema} from '../netlify/lib/brevity-response-schema.mjs'
const cases=JSON.parse(await readFile(new URL('../evaluations/household-agent-cases.json',import.meta.url)))
const args=process.argv.slice(2),value=flag=>args[args.indexOf(flag)+1]
if(!args.includes('--live')){
  console.log(cases.map(item=>`${item.id}\t${item.pillar}\t${item.messages.at(-1).content}`).join('\n'))
  console.log('\nNo model calls made. Use --live --id CASE_ID or --live --all --out /absolute/report.json. Provider charges apply. No household records are read or written.')
  process.exit(0)
}
if(!process.env.OPENAI_API_KEY)throw Error('OPENAI_API_KEY is required for live evaluation. No evaluation was run.')
const selected=args.includes('--all')?cases:cases.filter(item=>item.id===value('--id'))
if(!selected.length)throw Error('Choose a known --id or explicitly use --all.')
const member='Larry',date='2026-09-28'
const recipe={id:'custom-dinner-test',name:'Smoked Turkey Breast + Garlic Kale',ingredients:['6 oz turkey','1 cup garlic kale','1 roasted sweet potato'],yieldQuantity:1,yieldUnit:'serving',macros:{calories:600,proteinGrams:45,carbohydrateGrams:50,fatGrams:15}}
const report=[]
for(const item of selected){
  const canonical={householdDate:date,sources:[],mealLibrary:[recipe],dailyPlan:{fitness:{focus:'Walk 30 minutes'},education:{focus:'Read for 20 minutes'},household:{focus:'Inspect garage'},ministry:{focus:'Prepare Sunday welcome'}},activeSermon:{title:'Stewardship',summary:'Faithful care of entrusted resources.'},actionRecords:{projects:[{id:'kitchen',title:'Kitchen',status:'In Progress'}],finance:{recurringRecords:[{id:'electric',title:'Electric bill',amount:150,frequency:'monthly',date:'2026-10-01'}]}},dailyNutrition:{date,entries:[{id:'breakfast',member,date,name:'Breakfast',ingredients:[{input:'2 slices toast'}],macros:{calories:140,proteinGrams:4,carbohydrateGrams:26,fatGrams:2}}],totals:{calories:140,proteinGrams:4,carbohydrateGrams:26,fatGrams:2}},nutritionTargets:{proteinGrams:100},supplementalSources:{'apple-calendar':'unavailable'}}
  canonical.recentNutrition=[canonical.dailyNutrition]
  if(item.outage){canonical.dailyNutrition=null;canonical.recentNutrition=[];canonical.nutritionUnavailable=true;canonical.supplementalSources[`nutrition:${date}`]='unavailable'}
  const observed=[]
  try{
    const result=await runBrevitySdkAgent({model:process.env.BREVITY_AI_MODEL||'gpt-5.6',schema:assistantResponseSchema,canonical,browser:{},logger:()=>{},onTool:name=>observed.push(name),prompt:`Signed-in household member: ${member}. Household date: ${date}. Viewing ${item.pillar}. Use saved tools when relevant. Proposal targetId/date must match exact saved records, and all changes require review. Conversation:\n${JSON.stringify(item.messages)}`,calculate:async request=>{
      if(item.calculator==='clarify')throw Object.assign(new Error('Which exact brand and portion did you have?'),{code:'NUTRITION_CLARIFICATION_REQUIRED',questions:['Which exact brand and portion did you have?']})
      return {ingredients:request.ingredients.map(input=>({input})),yieldQuantity:request.yieldQuantity,yieldUnit:request.yieldUnit,perServingMacros:{calories:200,proteinGrams:20,carbohydrateGrams:10,fatGrams:8},warnings:['Synthetic evaluation values, not nutrition advice.']}
    }})
    const types=result.output?.proposal?.operations?.map(operation=>operation.type)||[]
    const checks={nonemptyReply:Boolean(result.output?.message?.trim()),requiredTools:item.requiredTools.every(name=>observed.includes(name)),allowedActions:types.every(type=>item.allowedProposalTypes.includes(type)),expectedProposalPresent:!item.allowedProposalTypes.length||types.length>0}
    report.push({id:item.id,checks,structuralPass:Object.values(checks).every(Boolean),humanReviewRequired:true,reviewChecklist:item.review,observedFunctionTools:observed,output:result.output})
  }catch(error){report.push({id:item.id,structuralPass:false,humanReviewRequired:true,errorCategory:error?.name||'Error'})}
  console.log(`${item.id}: ${report.at(-1).structuralPass?'structural checks passed; human review pending':'needs review'}`)
}
const out=args.includes('--out')?value('--out'):'/tmp/brevity-agent-evaluation.json'
await writeFile(out,JSON.stringify({generatedAt:new Date().toISOString(),syntheticData:true,productionWrites:false,model:process.env.BREVITY_AI_MODEL||'gpt-5.6',results:report},null,2)+'\n')
console.log(`Report: ${out}. Structural checks are not household pilot acceptance.`)
