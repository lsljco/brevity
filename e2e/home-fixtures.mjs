import { SNACK_LIBRARY } from '../src/meals/snackLibrary.js'


const today = () => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone:'America/New_York', year:'numeric', month:'2-digit', day:'2-digit' }).formatToParts(new Date()).map(part => [part.type, part.value]))
  return `${parts.year}-${parts.month}-${parts.day}`
}

const plan = (date = today()) => ({
  id: `daily-plan-${date}`,
  date,
  theme: 'Steady stewardship',
  dayObjective: 'Execute the household plan without avoidable exceptions.',
  governingPrinciple: 'Do the known work in the right order.',
  successStandard: 'Critical commitments completed.',
  topPriorities: [
    { id:'priority-1', title:'Protect the household rhythm', owner:'Family', status:'pending', priority:'high', participants:[] },
  ],
  spiritual: { owner:'Family', scope:'household', scripture:['Psalm 1:3'], devotionFocus:'Shared household devotion', prayerFocus:['Wisdom'], discussionPrompts:[], obedienceAction:'Practice the teaching.' },
  health: { owner:'Terica', breakfast:'Eggs', lunch:'Chicken and vegetables', dinner:'Fish and vegetables', snacks:'Fruit', hydration:'Water', groceries:[], nextDayPrep:'' },
  fitness: { owner:'Larry', location:'Lifetime Gym', participants:[], workout:'Strength', objective:'Train', departureTime:'', returnTime:'', stepGoal:10000, recovery:'', requiresDecision:false },
  household: { owner:'Larry', appointments:[{ id:'school-meeting', title:'School planning meeting', date, startTime:'9:15 AM', owner:'Larry', status:'pending', priority:'normal' }], priorities:[], errands:[], openItems:[] },
  education: { owner:'Larry', thinkTankTopic:'', thinkTankDeliverable:'', isaiah:{ owner:'Family', readingMinutes:20, sightWordsMinutes:10, comprehensionMinutes:10, mathMinutes:10, notes:'' } },
  finance: { owner:'Larry', bills:[], purchases:[], transfers:[], accountsToFund:[], incomePipeline:[], decisionRule:'' },
  ministry: { owners:['Larry','Lorenzo'], meetings:[], contentFocus:'', fellowshipFollowUps:[], prayerNeeds:[] },
  assignments:[], decisions:[], dayparts:[], recap:{ wins:[], carryovers:[], lessons:[], tomorrowPrep:[], completedAt:'' }, version:1,
})

const mealPlanResponse = (startDate = today()) => {
  const meals = [
    { id:'breakfast-eggs', mealType:'breakfast', name:'Eggs and Toast', image:'/meal-images/breakfast-01.webp', prepMinutes:10, macros:{ calories:350, proteinGrams:22, carbohydrateGrams:30, fatGrams:14 } },
    { id:'lunch-chicken', mealType:'lunch', name:'Chicken and Vegetables', image:'/meal-images/lunch-01.webp', prepMinutes:15, macros:{ calories:480, proteinGrams:48, carbohydrateGrams:32, fatGrams:18 } },
    { id:'dinner-fish', mealType:'dinner', name:'Fish and Vegetables', image:'/meal-images/dinner-01.webp', prepMinutes:20, macros:{ calories:520, proteinGrams:46, carbohydrateGrams:38, fatGrams:20 } },
  ]
  return {
    householdId:'lslj-family',
    startDate,
    days:[{ id:`meal-plan-${startDate}`, date:startDate, version:1, meals:{ breakfast:meals[0].id, lunch:meals[1].id, dinner:meals[2].id,snack1:SNACK_LIBRARY[0].id,snack2:SNACK_LIBRARY[2].id }, substitutions:{}, resolvedMeals:{ breakfast:meals[0], lunch:meals[1], dinner:meals[2],snack1:SNACK_LIBRARY[0],snack2:SNACK_LIBRARY[2] } }],
    library:[...meals,...SNACK_LIBRARY],
  }
}

export async function mockBackend(page) {
  await page.route('**/.netlify/functions/**', async route => {
    const url = new URL(route.request().url())
    const path = url.pathname
    const action = url.searchParams.get('action')
    let body = {}
    if (path.endsWith('/daily-briefing')) return route.fulfill({json:{brief:{member:'Larry',date:today(),items:[],gaps:[],sources:{}},revision:'brief-v1',acknowledged:false,household:[],finance:null}})
    if (path.endsWith('/household-auth') && action === 'session') body = { authenticated:true, member:'Larry', role:'admin', bootstrapRequired:false }
    else if (path.endsWith('/nutrition-records')) body = {member:'Larry',targets:{proteinGrams:160,calories:2200,carbohydrateGrams:220,fatGrams:80}}
    else if (path.endsWith('/household-auth') && action === 'members') body = { members:[] }
    else if (path.endsWith('/household-state')) {
      if (route.request().method() === 'PUT') {
        const payload = route.request().postDataJSON()
        body = { conflict:false, record:{ ...payload, version:Number(payload.expectedVersion || 0)+1, updatedAt:new Date().toISOString(), updatedBy:'Larry' } }
      } else body = { records:{}, serverTime:new Date().toISOString() }
    }
    else if (path.endsWith('/household-data')) body = { householdId:'lslj-family', plan:plan(url.searchParams.get('date') || today()) }
    else if (path.endsWith('/icloud-calendar')) body = { events:[{ id:'doctor-appointment', uid:'doctor-appointment', source:'icloud', appleCalendarId:'larry-calendar', appleCalendarOwner:'Larry', title:'Doctor appointment', date:today(), time:'2:30 PM', owner:'Family' }], connected:true, syncedAt:new Date().toISOString() }
    else if (path.endsWith('/meal-plans')) body = mealPlanResponse(url.searchParams.get('startDate') || today())
    else if (path.endsWith('/plaid-accounts')) body = { connected:false, accounts:[], errors:[], syncedAt:new Date().toISOString() }
    else if (path.endsWith('/plaid-transactions')) body = { transactions:[], errors:[] }
    else if (path.endsWith('/learning-hub')) body = {items:[],version:0}
    else if (path.endsWith('/health-alerts')) body = { alerts:[] }
    await route.fulfill({ status:200, contentType:'application/json', body:JSON.stringify(body) })
  })
}

