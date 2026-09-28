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
