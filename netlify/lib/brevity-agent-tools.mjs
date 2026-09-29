import {PILLAR_FIELDS} from './daily-plan-core-fields.mjs'
import { nutritionProgress, suggestPlannedMeals } from './nutrition-progress.mjs'

export function editablePlanContract(pillar){
 const names={text:'string',strings:'array of strings',members:'array of household member names',numbers:'non-negative number',booleans:'boolean',items:'array of plan items: title required, optional id/notes/owner/participants/status/priority/date/startTime/endTime/dueAt/requiresDecision/calendarSync/notificationLevel',nested:'object'}
 const fields=Object.fromEntries(Object.entries(PILLAR_FIELDS[pillar]||{}).flatMap(([kind,keys])=>keys.map(key=>[key,names[kind]])))
 if(pillar==='education')fields.isaiah={readingMinutes:'number 0–1440',sightWordsMinutes:'number 0–1440',comprehensionMinutes:'number 0–1440',mathMinutes:'number 0–1440',notes:'string'}
 return fields
}
export function pillarRecords(pillar, canonical, browser) {
  const base={memberPreferences:canonical.memberPreferences,editablePlanFields:editablePlanContract(pillar),householdDate:canonical.householdDate,sources:canonical.sources,supplementalSources:canonical.supplementalSources}
  const records=canonical.actionRecords||{}
  switch(pillar){
    case 'spiritual':return {...base,activeSermon:canonical.activeSermon,dailyPlan:canonical.dailyPlan?.spiritual,analysis:browser.todayPillarAnalyses?.spiritual}
    case 'health':{
      const progress=canonical.nutritionUnavailable||canonical.nutritionTargets===null?null:nutritionProgress(canonical.dailyNutrition?.totals,canonical.nutritionTargets)
      return {...base,dailyPlan:canonical.dailyPlan?.health,plannedMeals:canonical.rollingMealPlan,recipeLibrary:canonical.mealLibrary,consumedMeals:canonical.dailyNutrition,recentConsumedMeals:canonical.recentNutrition,unavailableNutritionDates:canonical.unavailableNutritionDates,nutritionTargets:canonical.nutritionTargets,nutritionProgress:progress,plannedMealOptions:progress?suggestPlannedMeals(progress,canonical.rollingMealPlan,canonical.householdDate):[],healthAlerts:browser.publicHealthAlerts,analysis:browser.todayPillarAnalyses?.health}
    }
    case 'fitness':return {...base,dailyPlan:canonical.dailyPlan?.fitness,analysis:browser.todayPillarAnalyses?.fitness}
    case 'household':return {...base,dailyPlan:canonical.dailyPlan?.household,assignments:canonical.dailyPlan?.assignments,decisions:canonical.dailyPlan?.decisions,familyCalendar:canonical.appleFamilyCalendar,projects:records.projects,improvementProposals:records.improvementProposals,analysis:browser.todayPillarAnalyses?.household}
    case 'education':return {...base,dailyPlan:canonical.dailyPlan?.education,analysis:browser.todayPillarAnalyses?.education}
    case 'finance':return {...base,finance:records.finance,browserFinance:browser.finance,analysis:browser.todayPillarAnalyses?.finance}
    case 'ministry':return {...base,activeSermon:canonical.activeSermon,dailyPlan:canonical.dailyPlan?.ministry,analysis:browser.todayPillarAnalyses?.ministry}
    default:throw Error('Unsupported pillar.')
  }
}
