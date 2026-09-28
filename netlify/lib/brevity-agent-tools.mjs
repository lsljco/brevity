import { calculateMealNutrition } from './meal-nutrition.mjs'

export const agentTools = [
  {type:'function',name:'get_pillar_records',description:'Read current Brevity records for one of the seven pillars. Use before making record-specific claims or proposing a change.',strict:true,parameters:{type:'object',additionalProperties:false,required:['pillar'],properties:{pillar:{type:'string',enum:['spiritual','health','fitness','household','education','finance','ministry']}}}},
  {type:'function',name:'estimate_meal_nutrition',description:'Estimate nutrition for food the member describes. This does not log consumption; use measured quantities and identify uncertainty.',strict:true,parameters:{type:'object',additionalProperties:false,required:['ingredients'],properties:{ingredients:{type:'array',minItems:1,maxItems:30,items:{type:'string'}}}}},
]

export function pillarRecords(pillar, canonical, browser) {
  const base={householdDate:canonical.householdDate,sources:canonical.sources}
  const records=canonical.actionRecords||{}
  switch(pillar){
    case 'spiritual':return {...base,activeSermon:canonical.activeSermon,dailyPlan:canonical.dailyPlan?.spiritual,analysis:browser.todayPillarAnalyses?.spiritual}
    case 'health':return {...base,dailyPlan:canonical.dailyPlan?.health,plannedMeals:canonical.rollingMealPlan,healthAlerts:browser.publicHealthAlerts,analysis:browser.todayPillarAnalyses?.health}
    case 'fitness':return {...base,dailyPlan:canonical.dailyPlan?.fitness,analysis:browser.todayPillarAnalyses?.fitness}
    case 'household':return {...base,dailyPlan:canonical.dailyPlan?.household,projects:records.projects,analysis:browser.todayPillarAnalyses?.household}
    case 'education':return {...base,dailyPlan:canonical.dailyPlan?.education,analysis:browser.todayPillarAnalyses?.education}
    case 'finance':return {...base,finance:records.finance,browserFinance:browser.finance,analysis:browser.todayPillarAnalyses?.finance}
    case 'ministry':return {...base,activeSermon:canonical.activeSermon,dailyPlan:canonical.dailyPlan?.ministry,analysis:browser.todayPillarAnalyses?.ministry}
    default:throw Error('Unsupported pillar.')
  }
}

export async function runAgentTool(call,{canonical,browser,calculate=calculateMealNutrition}={}) {
  let args
  try{args=JSON.parse(call.arguments||'{}')}catch{throw Error('Invalid tool arguments.')}
  if(call.name==='get_pillar_records'){
    if(Object.keys(args).length!==1)return {error:'Choose one pillar.'}
    return pillarRecords(args.pillar,canonical,browser)
  }
  if(call.name==='estimate_meal_nutrition'){
    if(!Array.isArray(args.ingredients)||args.ingredients.length<1||args.ingredients.length>30)return {error:'Provide one to 30 measured foods.'}
    const ingredients=args.ingredients.map(item=>String(item).trim())
    if(ingredients.some(item=>!item||item.length>240))return {error:'Each food must be described in 240 characters or fewer.'}
    return {estimate:await calculate({ingredients,yieldQuantity:1,yieldUnit:'meal'}),logged:false,notice:'Brevity has not recorded this as eaten. Planned meals are not consumption records.'}
  }
  return {error:'Unsupported tool.'}
}
