import { test, expect } from '@playwright/test'

const dateKey=()=>{
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(part=>[part.type,part.value]))
  return `${parts.year}-${parts.month}-${parts.day}`
}
const plan=(date=dateKey())=>{const today=date;return{id:`daily-plan-${today}`,date:today,theme:'Steady stewardship',dayObjective:'Execute today well.',governingPrinciple:'Do the known work.',successStandard:'Critical commitments complete.',topPriorities:[{id:'p1',title:'Protect the household rhythm',owner:'Family',status:'pending',priority:'high',participants:[]},{id:'p2',title:'Complete today’s essential commitments',owner:'Larry',status:'pending',priority:'high',participants:[]},{id:'p3',title:'Prepare tomorrow before closeout',owner:'Family',status:'pending',priority:'normal',participants:[]}],spiritual:{owner:'',scope:'household',scripture:['Psalm 1:3'],devotionFocus:'Shared household devotion',prayerFocus:['Wisdom'],discussionPrompts:[],obedienceAction:'Practice the teaching.',todayFocus:'Weekly Word',sermonNotes:{documentTitle:'Weekly Word',sevenDayFormationPlan:Array.from({length:7},(_,index)=>({title:`Day ${index+1}`,scripture:'Psalm 1:3',paragraphs:['Shared household devotion'],steps:['Practice the teaching.']}))},sermonSource:{active:true,activeVersion:2,sourceHash:'a'.repeat(64),sermonDate:today,title:'Weekly Word'}},health:{owner:'Terica',breakfast:'Eggs',lunch:'Chicken and vegetables',dinner:'Fish and vegetables',snacks:'Fruit',hydration:'Water',groceries:[],nextDayPrep:''},fitness:{owner:'Larry',location:'Lifetime Gym',participants:[],workout:'Strength',objective:'Train',departureTime:'',returnTime:'',stepGoal:10000,recovery:'',requiresDecision:false},household:{owner:'Larry',appointments:[],priorities:Array.from({length:4},(_,index)=>({id:`household-${index+1}`,title:`Household attention item ${index+1}`,status:'pending',priority:'normal'})),errands:[],openItems:[]},education:{owner:'Larry',thinkTankTopic:'',thinkTankDeliverable:'',isaiah:{owner:'Family',readingMinutes:20,sightWordsMinutes:10,comprehensionMinutes:10,mathMinutes:10,notes:''}},finance:{owner:'Larry',bills:[],purchases:[],transfers:[],accountsToFund:[],incomePipeline:[],decisionRule:''},ministry:{owners:['Larry','Lorenzo'],meetings:[],contentFocus:'',fellowshipFollowUps:[],prayerNeeds:[]},assignments:[],decisions:[],dayparts:[],recap:{wins:[],carryovers:[],lessons:[],tomorrowPrep:[],completedAt:''},version:1}}
const cashForecastRecords=()=>{
  const updatedAt=new Date().toISOString()
  const today=dateKey()
  const finance={calendarDataVersion:6,accounts:[{id:'a1',name:'Operating Account',type:'checking',balance:1000,plaidAccountId:'plaid-operating',plaidType:'depository',plaidSubtype:'checking',plaidCurrentBalance:1000}],transactions:[{id:'planned-grocery',name:'Planned groceries',type:'expense',amount:40,acct:'a1',freq:'once',start:today,end:today}]}
  const actuals=[
    {id:'bank-transfer',accountId:'plaid-operating',name:'Capital One payment',originalStatement:'PAYMENT TO CAPITAL ONE',category:'TRANSFER_OUT',amount:75,date:today,pending:false},
    {id:'bank-grocery',accountId:'plaid-operating',name:'Neighborhood Market',category:'FOOD_AND_DRINK',amount:25,date:today,pending:false},
    {id:'bank-pending',accountId:'plaid-operating',name:'Gas station authorization',category:'TRANSPORTATION',amount:30,date:today,pending:true},
  ]
  return Object.fromEntries(Object.entries({lslj_finance_v9:finance,plaid_actuals_cache:actuals}).map(([key,value])=>[key,{key,value:JSON.stringify(value),version:1,updatedAt}]))
}
const alreadyLinkedAccountRecords=()=>{
  const updatedAt=new Date().toISOString()
  const finance={calendarDataVersion:6,accounts:[
    {id:'operating',name:'Operating Account',type:'checking',balance:100,plaidAccountId:'bank-operating'},
    {id:'projects',name:'Renovation / Projects',type:'checking',balance:200,plaidAccountId:'bank-projects'},
    {id:'savings',name:'LSLJ Savings',type:'savings',balance:300,plaidAccountId:'bank-savings'},
  ],transactions:[]}
  return {lslj_finance_v9:{key:'lslj_finance_v9',value:JSON.stringify(finance),version:1,updatedAt}}
}
const scenarioRecords=()=>{
  const value={expenseMode:'scenario',planningExpense:23812.11,scenarios:[{id:'current',title:'Current',description:'What household cash flow looks like today.',incomes:[{id:'salary',description:'LS Genesco Inc.',monthlyNet:8164,annualGross:134000,contribution:11,remote:true,employment:'Perm',notes:''}]}]}
  return{brevity_finance_scenarios_v1:{key:'brevity_finance_scenarios_v1',value:JSON.stringify(value),version:2,updatedAt:new Date().toISOString()}}
}
const householdMaintenanceRecords=()=>({brevity_household_maintenance_v1:{key:'brevity_household_maintenance_v1',value:JSON.stringify({version:4,trackingStartedOn:'2026-09-01',occurrences:{},completions:{}}),version:2,updatedAt:new Date().toISOString()}})
const intelligenceRecords=()=>{const updatedAt=new Date().toISOString(),today=dateKey();return{
  brevity_household_intelligence_v1:{key:'brevity_household_intelligence_v1',value:JSON.stringify({schemaVersion:1,targets:[{id:'larry-finance',member:'Larry',pillarId:'finance',label:'Finance review',targetCount:2,frequency:'period',weight:1,active:true}],rules:[],overrides:{},privacy:{Larry:{details:true}}}),version:1,updatedAt},
  family_calendar_events_v1:{key:'family_calendar_events_v1',value:JSON.stringify([{id:'finance-done',title:'Daily finance review',date:today,owner:'Larry',pillar:'finance',completed:true,minutes:30},{id:'finance-open',title:'Weekly finance review',date:today,owner:'Larry',pillar:'finance',minutes:60}]),version:1,updatedAt},
}}
const projectRecords=()=>({homehq_items_v1:{key:'homehq_items_v1',value:JSON.stringify([{id:'kitchen-1',vendorId:'project-vendor',title:'Kitchen refresh',type:'Renovation',room:'Kitchen',roomCustom:'',status:'In Progress',priority:'High',startDate:'2026-09-10',due:'2026-10-15',estcost:'12000.00',actcost:'1400.00',notes:'Preserve the stone.',raci:{responsible:['Larry'],accountable:[],consulted:[],informed:[]},cname:'',cphone:'',cemail:'',caddress:'',bizLicense:false,coi:false,workersComp:false,photos:[],files:[]}]),version:0,updatedAt:new Date().toISOString()}})
const debtPaymentRecords=()=>{
  const records=cashForecastRecords(),actuals=JSON.parse(records.plaid_actuals_cache.value)
  actuals.push({id:'bank-mortgage',accountId:'plaid-operating',name:'Mortgage payment',originalStatement:'MONTHLY MORTGAGE PAYMENT',category:'MORTGAGE',amount:3000,date:dateKey(),pending:false})
  records.plaid_actuals_cache.value=JSON.stringify(actuals)
  records.brevity_finance_debts_v1={key:'brevity_finance_debts_v1',value:JSON.stringify([{id:'mortgage',creditor:'Mortgage lender',accountName:'Home mortgage',debtType:'Mortgage',status:'Active',originalBalance:400000,currentBalance:300000,interestRate:6,interestMethod:'Amortized APR',paymentsPerYear:12,fixedInterestAmount:0,minimumPayment:2800,dueDay:1,paymentMatchText:'MORTGAGE',notes:'',payments:[]}]),version:3,updatedAt:new Date().toISOString()}
  return records
}
const mealPlanResponse=(addedMeal=null)=>{
  const now=new Date().toISOString(),start=dateKey()
  const meals=[
    {id:'breakfast-eggs',mealType:'breakfast',name:'Eggs and Toast',description:'Eggs and whole-grain toast.',prepMinutes:10,totalMinutes:10,serving:'1 plate',macros:{calories:350,proteinGrams:22,carbohydrateGrams:30,fatGrams:14}},
    {id:'lunch-chicken',mealType:'lunch',name:'Chicken and Vegetables',description:'Grilled chicken with vegetables.',prepMinutes:15,totalMinutes:15,serving:'1 plate',macros:{calories:480,proteinGrams:48,carbohydrateGrams:32,fatGrams:18}},
    {id:'dinner-fish',mealType:'dinner',name:'Fish and Vegetables',description:'Roasted fish with vegetables.',prepMinutes:20,totalMinutes:20,serving:'1 plate',macros:{calories:520,proteinGrams:46,carbohydrateGrams:38,fatGrams:20}},
    ...(addedMeal?[addedMeal]:[]),
  ]
  const days=Array.from({length:7},(_,index)=>{
    const date=new Date(`${start}T12:00:00.000Z`);date.setUTCDate(date.getUTCDate()+index)
    const dateValue=date.toISOString().slice(0,10)
    return{id:`meal-plan-${dateValue}`,date:dateValue,version:1,meals:{breakfast:'breakfast-eggs',lunch:'lunch-chicken',dinner:'dinner-fish'},substitutions:{},resolvedMeals:{breakfast:meals[0],lunch:meals[1],dinner:meals[2]},createdAt:now,updatedAt:now}
  })
  return{householdId:'lslj-family',startDate:start,days,library:meals,libraryVersion:0,librarySummary:{total:meals.length,counts:{breakfast:1+(addedMeal?1:0),lunch:1,dinner:1}}}
}
async function mockBackend(page,{financeFixture=false,accountLinkFixture=false,alreadyLinkedExtrasFixture=false,scenarioFixture=false,debtPaymentFixture=false,householdTaskFixture=false,projectFixture=false,intelligenceFixture=false,sessionMember='Larry',sessionRole='admin'}={}){
  let addedMeal=null
  await page.route('**/.netlify/functions/**',async route=>{
    const url=new URL(route.request().url()),path=url.pathname,action=url.searchParams.get('action')
    let body={}
    if(path.endsWith('/household-auth')&&action==='session')body={authenticated:true,member:sessionMember,role:sessionRole,bootstrapRequired:false}
    else if(path.endsWith('/household-auth')&&action==='members')body={members:[]}
    else if(path.endsWith('/household-state')){
      if(route.request().method()==='PUT'){
        const payload=route.request().postDataJSON()
        body={conflict:false,record:{...payload,version:Number(payload.expectedVersion||0)+1,updatedAt:new Date().toISOString(),updatedBy:'Larry'}}
      }else body={records:intelligenceFixture?intelligenceRecords():projectFixture?projectRecords():householdTaskFixture?householdMaintenanceRecords():scenarioFixture?scenarioRecords():debtPaymentFixture?debtPaymentRecords():alreadyLinkedExtrasFixture?alreadyLinkedAccountRecords():(financeFixture||accountLinkFixture)?cashForecastRecords():{},serverTime:new Date().toISOString()}
    }else if(path.endsWith('/household-data'))body={householdId:'lslj-family',plan:plan(url.searchParams.get('date')||dateKey())}
    else if(path.endsWith('/household-performance-evidence'))body={member:sessionMember,dailyPlans:intelligenceFixture?[{date:dateKey(),assignments:[{id:'fitness-saved',title:'Saved strength workout',owner:'Larry',pillar:'fitness',status:'pending'}],decisions:[]}]:[],reportedActivities:[],unavailable:[]}
    else if(path.endsWith('/meal-plans')){
      if(route.request().method()==='POST'){
        const payload=route.request().postDataJSON()
        addedMeal={...payload,id:'custom-breakfast-browser-test',custom:true,image:'/.netlify/functions/meal-images?id=custom-breakfast-browser-test'}
        body={meal:addedMeal}
      }else body=mealPlanResponse(addedMeal)
    }
    else if(path.endsWith('/meal-nutrition'))body={nutrition:{
      ingredients:[
        {input:'2 cups Pearl Milling Company pancake mix',resolvedName:'Pearl Milling Company pancake mix',amountDescription:'2 cups',basis:'Package-label estimate',confidence:'medium',macros:{calories:1200,proteinGrams:24,carbohydrateGrams:252,fatGrams:6}},
        {input:'1 cup water',resolvedName:'Water',amountDescription:'1 cup',basis:'Water',confidence:'high',macros:{calories:0,proteinGrams:0,carbohydrateGrams:0,fatGrams:0}},
        {input:'1 stick salted butter',resolvedName:'Salted butter',amountDescription:'1 stick',basis:'Standard portion estimate',confidence:'high',macros:{calories:810,proteinGrams:1,carbohydrateGrams:0,fatGrams:92}},
      ],
      yieldQuantity:12,yieldUnit:'pancakes',serving:'1 pancake',batchMacros:{calories:2010,proteinGrams:25,carbohydrateGrams:252,fatGrams:98},perServingMacros:{calories:167.5,proteinGrams:2.1,carbohydrateGrams:21,fatGrams:8.2},warnings:['Confirm the exact package label.'],nutritionBasis:'Calculated by Brevity from the measured ingredient list.',
    }}
    else if(path.endsWith('/recipe-import'))body={recipe:{
      mealType:'breakfast',name:'Fluffy Golden Pancakes',description:'A family breakfast.',
      ingredients:['2 cups Pearl Milling Company pancake mix','1 cup water','1 stick salted butter'],
      prepMinutes:5,cookMinutes:15,totalMinutes:20,image:'https://recipes.example.com/pancakes.jpg',
      yieldQuantity:12,yieldUnit:'pancakes',sourceUrl:'https://recipes.example.com/pancakes',sourceName:'recipes.example.com',missingFields:[],
    }}
    else if(path.endsWith('/icloud-calendar'))body={events:[],connected:true,syncedAt:new Date().toISOString()}
    else if(path.endsWith('/plaid-accounts'))body=alreadyLinkedExtrasFixture?{
      connected:true,balanceMode:'live',balanceProvenance:'plaid.accountsBalanceGet',syncedAt:new Date().toISOString(),errors:[],requiresUpdate:[],
      accountSourceReceipt:{payload:'test',signature:'a'.repeat(64)},
      accounts:[
        {accountId:'bank-operating',itemId:'item-1',institution:'Pinnacle',name:'Operating Account',type:'depository',subtype:'checking',mask:'2200',balance:150.58},
        {accountId:'bank-projects',itemId:'item-1',institution:'Pinnacle',name:'Renovation / Projects',type:'depository',subtype:'checking',mask:'4607',balance:1052.51},
        {accountId:'bank-savings',itemId:'item-1',institution:'Pinnacle',name:'LSLJ Savings',type:'depository',subtype:'savings',mask:'9638',balance:13000.20},
        ...Array.from({length:10},(_,index)=>({accountId:`untracked-${index}`,itemId:'item-1',institution:'Pinnacle',name:`Untracked ${index}`,type:'depository',subtype:'checking',mask:`10${String(index).padStart(2,'0')}`,balance:index})),
      ],
    }:accountLinkFixture?{
      connected:true,balanceMode:'live',balanceProvenance:'plaid.accountsBalanceGet',syncedAt:new Date().toISOString(),errors:[],requiresUpdate:[],
      accountSourceReceipt:{payload:'test',signature:'a'.repeat(64)},
      accounts:[
        {accountId:'bank-checking',itemId:'item-1',institution:'Pinnacle',name:'Personal Checking',type:'depository',subtype:'checking',mask:'0607',balance:756.74},
        {accountId:'bank-savings',itemId:'item-1',institution:'Pinnacle',name:'Personal Savings',type:'depository',subtype:'savings',mask:'4412',balance:2400},
      ],
    }:{connected:false,accounts:[],errors:[],syncedAt:new Date().toISOString()}
    else if(path.endsWith('/plaid-transactions'))body=alreadyLinkedExtrasFixture
      ? url.searchParams.get('refresh_only')==='1'
          ? {connected:true,transactions:[],errors:[],refresh:{requested:true,requestedAt:'2026-09-08T23:00:00.000Z',accepted:1,errors:[]}}
          : url.searchParams.get('refresh_status')==='1'
            ? {connected:true,transactions:[],errors:[],refresh:{requested:true,requestedAt:'2026-09-08T23:00:00.000Z',accepted:1,completed:1,stillProcessing:false,errors:[]}}
            : {connected:true,mode:'incremental',transactions:[],removed:[],errors:[],syncedAt:new Date().toISOString(),successfulInstitutions:['Pinnacle'],sourceReceipts:[{cursorIdentity:'item-1',batchId:'a'.repeat(64)}]}
      : {connected:false,transactions:[],errors:[]}
    else if(path.endsWith('/brevity-assistant-actions')&&action==='prepare-direct'){
      const input=route.request().postDataJSON(),operation=input.operation||input.operations?.[0]
      body={proposal:{id:'direct-review-proposal',summary:input.summary,risk:operation?.payload?.applyToExisting?'strong-confirmation':'confirmation',operations:[{...operation,id:'direct-review-operation',domain:'finance',allowedScopes:['this-item'],defaultScope:'this-item',risk:operation?.payload?.applyToExisting?'strong-confirmation':'confirmation'}]}}
    }
    else if(path.endsWith('/brevity-assistant-actions')&&action==='prepare-meal'){
      const input=route.request().postDataJSON()
      body={proposal:{id:'meal-review-proposal',summary:`Replace ${input.mealType} on ${input.date}`,risk:'confirmation',operations:[{id:'meal-review-operation',type:'meal.substitute',domain:'planning',description:'Replace Eggs and Toast with Saturday Pancakes',targetId:'breakfast-eggs',targetDate:input.date,payload:{mealType:input.mealType,mealId:input.mealId},allowedScopes:['this-item'],defaultScope:'this-item',risk:'confirmation'}]}}
    }
    else if(path.endsWith('/health-alerts'))body={alerts:[]}
    else if(path.endsWith('/weather')){
      const targetDate=url.searchParams.get('date')||dateKey()
      body={location:{name:'Johns Creek, GA',timezone:'America/New_York'},targetDate,isCurrentDay:targetDate===dateKey(),current:{observedAt:`${dateKey()}T09:15`,temperature:74,apparentTemperature:75,humidity:61,precipitation:0,windSpeed:5,condition:'Mostly clear',icon:'cloud-sun'},day:{high:82,low:66,precipitationProbability:35,sunrise:`${targetDate}T07:18`,sunset:`${targetDate}T19:43`},periods:[['Morning',70,'Mostly clear','cloud-sun',5],['Midday',79,'Partly cloudy','cloud-sun',10],['Afternoon',82,'Light rain','cloud-rain',35],['Evening',73,'Partly cloudy','cloud-sun',20]].map(([label,temperature,condition,icon,precipitationProbability])=>({label,temperature,apparentTemperature:temperature,condition,icon,precipitationProbability,windSpeed:5,time:`${targetDate}T12:00`})),updatedAt:new Date().toISOString(),source:'Open-Meteo',stale:false}
    }
    else if(path.endsWith('/alignment-meeting-analyze'))body={summary:'The household aligned meals and fitness.',unresolved:[],changes:{health:{lunch:'Alignment meeting lunch'},fitness:{participants:['Javin'],stepGoal:9000}}}
    else if(path.endsWith('/onedrive-status'))body={configured:true,connected:true,changeRequired:false,connection:{account:'test'}}
    else if(path.endsWith('/sermon-device-rescue'))body={sermons:[],imports:[]}
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)})
  })
}
async function openMenuIfMobile(page,testInfo){if(testInfo.project.name==='iphone'){const drawer=page.locator('#primary-navigation-drawer');if(!(await drawer.getAttribute('class')||'').includes('is-expanded'))await page.getByRole('button',{name:'Menu'}).click();await expect(drawer).toHaveClass(/is-expanded/)}}
async function closeMenuIfMobile(page,testInfo){if(testInfo.project.name==='iphone'){const drawer=page.locator('#primary-navigation-drawer');if((await drawer.getAttribute('class')||'').includes('is-expanded'))await page.getByRole('button',{name:'Collapse navigation'}).click();await expect(drawer).not.toHaveClass(/is-expanded/)}}

test.beforeEach(async({page},testInfo)=>{const ownerLifecycle=testInfo.title.includes('chore owner completes');await mockBackend(page,{financeFixture:testInfo.title.includes('Cash Forecast')||testInfo.title.includes('Projected Expenses')||testInfo.title.includes('categorization rules')||testInfo.title.includes('transaction category'),accountLinkFixture:testInfo.title.includes('account-link repair'),alreadyLinkedExtrasFixture:testInfo.title.includes('already-linked'),scenarioFixture:testInfo.title.includes('Scenario Modeling edits'),debtPaymentFixture:testInfo.title.includes('applies posted bank activity'),householdTaskFixture:testInfo.title.includes('starts an assigned household task')||ownerLifecycle,projectFixture:testInfo.title.includes('Project review repairs'),intelligenceFixture:testInfo.title.includes('Household Intelligence dashboard'),sessionMember:ownerLifecycle?'Javin':'Larry',sessionRole:ownerLifecycle?'member':'admin'});await page.goto('/');await expect(page.locator('.app-shell')).toBeVisible()})

test('expanded side panel remains expanded while navigating until its toggle is used',async({page},testInfo)=>{
  const drawer=page.locator('#primary-navigation-drawer')
  if(!(await drawer.getAttribute('class')||'').includes('is-expanded')){
    await page.getByRole('button',{name:testInfo.project.name==='iphone'?'Menu':'Expand navigation'}).click()
  }
  await expect(drawer).toHaveClass(/is-expanded/)
  await page.getByRole('button',{name:'Finance',exact:true}).click()
  await expect(drawer).toHaveClass(/is-expanded/)
  await page.getByRole('button',{name:'Dashboard',exact:true}).click()
  await expect(drawer).toHaveClass(/is-expanded/)
  await page.getByRole('button',{name:'Collapse navigation'}).click()
  await expect(drawer).not.toHaveClass(/is-expanded/)
})

test('iPad sidebar stays open after content taps, rotation, and reload until explicitly collapsed',async({page},testInfo)=>{
  test.skip(!testInfo.project.name.startsWith('tablet'),'iPad-specific persistent navigation')
  const drawer=page.locator('#primary-navigation-drawer')
  if((await drawer.getAttribute('class')||'').includes('is-expanded'))await page.getByRole('button',{name:'Collapse navigation'}).click()
  await page.getByRole('button',{name:'Expand navigation'}).click()
  await page.getByRole('button',{name:'Finance',exact:true}).click()
  await page.getByRole('button',{name:'Dashboard',exact:true}).click()
  await expect(page.getByRole('button',{name:'Close navigation',exact:true})).toBeHidden()
  // A real content click must reach the workspace, without a dismissing overlay.
  await page.locator('.app-main').click({position:{x:300,y:120}})
  await expect(drawer).toHaveClass(/is-expanded/)
  const bounds=await page.evaluate(()=>({sidebar:document.querySelector('#primary-navigation-drawer').getBoundingClientRect().right,main:document.querySelector('.app-main').getBoundingClientRect().left}))
  expect(bounds.main).toBeGreaterThanOrEqual(bounds.sidebar-1)
  await page.setViewportSize(testInfo.project.name==='tablet'?{width:1194,height:834}:{width:834,height:1194})
  await expect(drawer).toHaveClass(/is-expanded/)
  await page.reload()
  await expect(drawer).toHaveClass(/is-expanded/)
  await page.getByRole('button',{name:'Collapse navigation'}).click()
  await expect(drawer).not.toHaveClass(/is-expanded/)
  await page.reload()
  await expect(drawer).not.toHaveClass(/is-expanded/)
  await page.getByRole('button',{name:'Expand navigation'}).click()
  await expect(drawer).toHaveClass(/is-expanded/)
})

test('Today surfaces populated Daily Outcomes from the daily plan',async({page})=>{for(const outcome of ['Protect the household rhythm','Complete today’s essential commitments','Prepare tomorrow before closeout'])await expect(page.getByText(outcome)).toBeVisible();await expect(page.locator('body')).not.toContainText('Outcome not set')})

test('Household Intelligence dashboard separates metrics and opens an auditable score drilldown',async({page},testInfo)=>{
  await openMenuIfMobile(page,testInfo)
  await page.getByRole('button',{name:'Household Management',exact:true}).click()
  await page.getByRole('button',{name:'Household Intelligence',exact:true}).click()
  await closeMenuIfMobile(page,testInfo)
  await expect(page.getByRole('heading',{name:'Household Intelligence',exact:true})).toBeVisible()
  await expect(page.getByText('Pillar Attainment',{exact:true}).first()).toBeVisible()
  await expect(page.getByText('Plan Adherence',{exact:true}).first()).toBeVisible()
  await expect(page.getByText('Time Allocation',{exact:true}).first()).toBeVisible()
  await expect(page.getByRole('heading',{name:'Member Scorecard'})).toBeVisible()
  const layout=await page.locator('.hpi-page').evaluate(el=>{
    const main=el.closest('.app-main').getBoundingClientRect()
    return {right:main.right,left:main.left,cards:[...el.querySelectorAll('.hpi-pillars>article')].map(card=>({left:card.getBoundingClientRect().left,right:card.getBoundingClientRect().right})),pageWidth:el.clientWidth,contentWidth:el.scrollWidth}
  })
  expect(layout.contentWidth).toBeLessThanOrEqual(layout.pageWidth+1)
  for(const card of layout.cards){expect(card.left).toBeGreaterThanOrEqual(layout.left);expect(card.right).toBeLessThanOrEqual(layout.right+1)}
  const fitness=page.locator('.hpi-pillars article').filter({hasText:'Physical Fitness'})
  await expect(fitness).toContainText('Potential 100% if remaining planned work is completed')
  await expect(fitness.getByLabel('Actual attainment: Off Track')).toBeVisible()
  await expect(fitness).not.toContainText('Complete')
  await page.getByRole('button',{name:'Larry Physical Fitness: 0%',exact:true}).click()
  await expect(page.getByRole('dialog',{name:'Score explanation'})).toContainText('Saved strength workout')
  await page.getByRole('button',{name:'Close score explanation'}).click()
  await page.getByRole('button',{name:'Larry Finance & Stewardship'}).click()
  const drilldown=page.getByRole('dialog',{name:'Score explanation'})
  await expect(drilldown).toContainText('Finance review')
  await expect(drilldown).toContainText('1 of 2 activities')
  await expect(drilldown).toContainText(/planned|incomplete|not completed/i)
  await expect(drilldown).toContainText('Daily finance review')
  await expect(drilldown).toContainText('Weekly finance review')
})

test('Today and daily alignments show current and daypart weather',async({page})=>{
  const todayWeather=page.getByLabel('Weather for Johns Creek, GA')
  await expect(todayWeather).toContainText('Current conditions')
  await expect(todayWeather).toContainText('74°')
  await expect(todayWeather).toContainText('Morning')
  await expect(todayWeather).toContainText('Afternoon')
  await expect(todayWeather).toContainText('35% chance')
  await page.getByRole('button',{name:"Start Today’s Alignment"}).click()
  await expect(page.getByRole('heading',{name:"Today’s Alignment"})).toBeVisible()
  await expect(page.getByLabel('Weather for Johns Creek, GA')).toContainText('Current conditions')
  await page.getByRole('button',{name:'Save Local Draft & Exit'}).click()
  await page.getByRole('button',{name:"Start Tomorrow’s Alignment"}).click()
  await expect(page.getByRole('heading',{name:'Next-Day Alignment'})).toBeVisible()
  await expect(page.getByLabel('Weather for Johns Creek, GA')).toContainText('Morning')
})

test('Today and Tomorrow alignment include Finance-style meeting capture and reviewed draft application',async({page})=>{
  for(const [button,heading,transcriptLabel] of [["Start Today’s Alignment","Today’s Alignment","Today’s Alignment transcript"],["Start Tomorrow’s Alignment","Next-Day Alignment","Tomorrow’s Alignment transcript"]]){
    await page.getByRole('button',{name:button}).click()
    await expect(page.getByRole('heading',{name:heading})).toBeVisible()
    const capture=page.getByLabel(/Alignment meeting capture$/)
    await expect(capture.getByRole('button',{name:'Start Meeting'})).toBeVisible()
    await capture.getByLabel(transcriptLabel).fill('Javin will join fitness. Lunch is Alignment meeting lunch. Set nine thousand steps.')
    await capture.getByRole('button',{name:'Analyze with Brevity'}).click()
    await expect(capture).toContainText('The household aligned meals and fitness.')
    await capture.getByRole('button',{name:'Apply Suggestions to Draft'}).click()
    const steps=page.getByRole('navigation',{name:'Alignment progress'})
    await steps.getByRole('button',{name:'Health & Nutrition'}).click()
    await expect(page.getByLabel('Lunch')).toHaveValue('Alignment meeting lunch')
    await steps.getByRole('button',{name:'Ministry & Fellowship'}).click()
    await expect(page.getByRole('button',{name:'Review & Complete Alignment'})).toBeVisible()
    await page.getByRole('button',{name:'Save Local Draft & Exit'}).click()
  }
})

test('Today renders and counts unresolved Household Operations priorities',async({page})=>{
  const panel=page.locator('.today-attention')
  await expect(panel.getByRole('heading',{name:'Needs Attention'})).toBeVisible()
  await expect(panel.locator('header > strong')).toHaveText('4')
  for(let index=1;index<=4;index+=1)await expect(panel.getByText(`Household attention item ${index}`)).toBeVisible()
  await expect(page.locator('body')).not.toContainText("Can't find variable: signals")
})

test('Today last three pillar cards expose recorded detail instead of generic headings',async({page})=>{
  const education=page.locator('[data-pillar="education"]')
  const finance=page.locator('[data-pillar="finance"]')
  const ministry=page.locator('[data-pillar="ministry"]')
  await expect(education).toContainText('Education plan not defined')
  await expect(education).toContainText('20 min reading · 10 min math')
  await expect(finance).toContainText('Daily Finance Brief')
  await expect(finance).toContainText('No finance decision recorded today.')
  await expect(finance).toContainText('Operating Balance · $1,000 watch')
  await expect(ministry).toContainText('No ministry focus, meeting, fellowship follow-up, or prayer need is recorded for today.')
  await expect(finance).not.toContainText('Financial Stewardship')
})

test('Meal Library finds ingredients and month view shows every selected day',async({page})=>{
  const steak={id:'breakfast-steak-eggs',mealType:'breakfast',name:'Morning skillet',description:'A savory breakfast',ingredients:['6 oz steak','2 eggs'],prepMinutes:15,totalMinutes:20,serving:'1 plate',macros:{calories:520,proteinGrams:42,carbohydrateGrams:5,fatGrams:35}}
  await page.route('**/.netlify/functions/meal-plans?*',async route=>{
    const url=new URL(route.request().url())
    const response=mealPlanResponse()
    response.library.push(steak)
    if(url.searchParams.has('count')){
      const first=url.searchParams.get('startDate'),count=Number(url.searchParams.get('count'))
      response.startDate=first
      response.days=Array.from({length:count},(_,index)=>{
        const date=new Date(`${first}T12:00:00.000Z`);date.setUTCDate(date.getUTCDate()+index)
        return {...response.days[0],date:date.toISOString().slice(0,10)}
      })
    }
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(response)})
  })
  await page.getByRole('button',{name:'Open Meal Plan',exact:true}).click()
  await page.getByRole('button',{name:'Meal Library'}).click()
  await page.getByRole('searchbox',{name:'Search Meal Library'}).fill('steak and eggs')
  await expect(page.locator('.meal-library-grid article')).toHaveCount(1)
  await expect(page.locator('.meal-library-grid')).toContainText('Morning skillet')
  await page.getByRole('searchbox',{name:'Search Meal Library'}).fill('salmon steak')
  await expect(page.getByText('No meals match')).toBeVisible()
  await page.getByRole('button',{name:'Month Plan'}).click()
  await page.getByLabel('Select month').fill('2028-02')
  await expect(page.locator('.meal-calendar-day')).toHaveCount(29)
  await expect(page.getByText('29 days · 87 planned meals')).toBeVisible()
  await expect(page.locator('.meal-calendar-day').last()).toContainText('Feb 29')
})

test('Meal Library calculates batch and per-serving nutrition from measured ingredients',async({page})=>{
  await page.getByRole('button',{name:'Open Meal Plan',exact:true}).click()
  await expect(page.getByRole('heading',{name:'Rolling 7-Day Meal Plan'})).toBeVisible()
  await page.locator('.meal-planner-controls button').filter({hasText:'Meal Library'}).click()
  await page.locator('.meal-library-add').filter({hasText:'Add Breakfast'}).click()
  const dialog=page.getByRole('dialog',{name:'Add a meal'})
  await dialog.getByLabel('Meal name').fill('Saturday Pancakes')
  await dialog.getByLabel(/Measured ingredients/).fill('2 cups Pearl Milling Company pancake mix\n1 cup water\n1 stick salted butter')
  await dialog.getByLabel('Prep time (minutes)').fill('5')
  await dialog.getByLabel('Cook time (minutes)').fill('15')
  await dialog.getByLabel('Batch yield').fill('12')
  await dialog.getByLabel('Yield unit').fill('pancakes')
  await dialog.locator('.meal-nutrition-action button').click()
  const preview=dialog.getByLabel('Calculated nutrition preview')
  await expect(preview).toContainText('Total batch')
  await expect(preview).toContainText('2,010')
  await expect(preview).toContainText('Per 1 pancake')
  await expect(preview).toContainText('167.5')
  await expect(dialog.locator('footer button.is-primary')).toBeEnabled()
  await dialog.locator('footer button.is-primary').click()
  await expect(page.getByText(/Saturday Pancakes was added/)).toBeVisible()
  await expect(page.getByText('Saturday Pancakes',{exact:true})).toBeVisible()
  await expect(page.getByRole('img',{name:'Saturday Pancakes'})).toHaveAttribute('src',/.netlify\/functions\/meal-images/)
})

test('Meal Library imports a recipe website and calculates its per-serving nutrition',async({page})=>{
  await page.getByRole('button',{name:'Open Meal Plan',exact:true}).click()
  await expect(page.getByRole('heading',{name:'Rolling 7-Day Meal Plan'})).toBeVisible()
  await page.locator('.meal-planner-controls button').filter({hasText:'Meal Library'}).click()
  await page.locator('.meal-library-add').filter({hasText:'Add Breakfast'}).click()
  const dialog=page.getByRole('dialog',{name:'Add a meal'})
  await dialog.getByLabel('Recipe website URL').fill('https://recipes.example.com/pancakes')
  await dialog.locator('.meal-recipe-import-controls button').click()
  await expect(dialog.getByLabel('Meal name')).toHaveValue('Fluffy Golden Pancakes')
  await expect(dialog.getByLabel(/Measured ingredients/)).toHaveValue(/2 cups Pearl Milling Company/)
  await expect(dialog.getByLabel('Prep time (minutes)')).toHaveValue('5')
  await expect(dialog.getByLabel('Cook time (minutes)')).toHaveValue('15')
  await expect(dialog.getByLabel('Batch yield')).toHaveValue('12')
  await expect(dialog.getByLabel('Yield unit')).toHaveValue('pancakes')
  await expect(dialog.getByText('Meal image generated by Brevity')).toBeVisible()
  await expect(dialog.getByRole('status')).toContainText('Review the populated fields before saving.')
  const preview=dialog.getByLabel('Calculated nutrition preview')
  await expect(preview).toContainText('Total batch')
  await expect(preview).toContainText('Per 1 pancake')
  await expect(dialog.locator('footer button.is-primary')).toBeEnabled()
})

test('Meal Library reads distinct meals and printed macros from an uploaded image into an editable draft',async({page})=>{
  await page.route('**/.netlify/functions/meal-image-import',async route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({meals:[
    {name:'Grilled New York Strip Steak',ingredients:['New York strip steak','Green beans','Olive oil'],serving:'plate',macros:{calories:460,proteinGrams:54,carbohydrateGrams:21,fatGrams:20},warnings:[]},
    {name:'Beef Brisket',ingredients:['Brisket','Mashed potatoes'],serving:'plate',macros:{calories:520,proteinGrams:52,carbohydrateGrams:37,fatGrams:18},warnings:[]},
    {name:'Chicken Legs and Rice',ingredients:['Chicken legs','White rice'],serving:'plate',macros:{calories:430,proteinGrams:47,carbohydrateGrams:43,fatGrams:12},warnings:[]},
  ],warnings:[]})}))
  await page.getByRole('button',{name:'Open Meal Plan',exact:true}).click()
  await page.getByRole('button',{name:'Meal Library'}).click()
  await page.locator('.meal-library-add').filter({hasText:'Add Lunch'}).click()
  const dialog=page.getByRole('dialog',{name:'Add a meal'})
  await dialog.getByLabel('Choose meal image').setInputFiles({name:'meal.png',mimeType:'image/png',buffer:await page.screenshot()})
  await expect(dialog.getByLabel('Meal name')).toHaveValue('Grilled New York Strip Steak')
  await expect(dialog.getByLabel('Calories')).toHaveValue('460')
  await dialog.getByLabel(/Choose a meal from the image/).selectOption('2')
  await expect(dialog.getByLabel('Meal name')).toHaveValue('Chicken Legs and Rice')
  await expect(dialog.getByLabel('Protein (g)')).toHaveValue('47')
  await expect(dialog.getByLabel('Prep time (minutes)')).toHaveValue('')
  await expect(dialog.locator('footer button.is-primary')).toBeDisabled()
  await dialog.getByLabel('Prep time (minutes)').fill('10')
  await dialog.getByLabel('Cook time (minutes)').fill('30')
  await expect(dialog.locator('footer button.is-primary')).toBeEnabled()
})

test('Meal Library bulk import reviews several images and saves selected meals in one request',async({page})=>{
  let reads=0, saved=null
  await page.route('**/.netlify/functions/meal-image-import',route=>{
    reads+=1
    const meals=reads===1?[
      {name:'Turkey scramble',mealType:'breakfast',ingredients:['Turkey','Egg whites'],serving:'1 plate',macros:{calories:305,proteinGrams:54,carbohydrateGrams:34,fatGrams:12},warnings:[]},
      {name:'Salmon broccoli',mealType:'lunch',ingredients:['Salmon','Broccoli'],serving:'1 plate',macros:{calories:492,proteinGrams:53,carbohydrateGrams:11,fatGrams:28},warnings:[]},
    ]:[
      {name:'Turkey scramble',mealType:'breakfast',ingredients:['Turkey','Egg whites'],serving:'1 plate',macros:{calories:305,proteinGrams:54,carbohydrateGrams:34,fatGrams:12},warnings:[]},
      {name:'Beef brisket',mealType:'dinner',ingredients:['Beef','Green beans'],serving:'1 plate',macros:{calories:490,proteinGrams:61,carbohydrateGrams:null,fatGrams:23},warnings:['Carbs illegible']},
    ]
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({meals,warnings:[]})})
  })
  await page.route('**/.netlify/functions/meal-plans',route=>{
    if(route.request().method()==='POST'){
      saved=route.request().postDataJSON()
      return route.fulfill({status:201,contentType:'application/json',body:JSON.stringify({meals:saved.meals.map((meal,index)=>({...meal,id:`new-${index}`}))})})
    }
    return route.continue()
  })
  await page.getByRole('button',{name:'Open Meal Plan',exact:true}).click()
  await page.getByRole('button',{name:'Meal Library'}).click()
  await page.getByRole('button',{name:'Bulk import from images'}).click()
  const dialog=page.getByRole('dialog',{name:'Bulk import meals'})
  const image=await page.screenshot()
  await dialog.getByLabel('Choose up to 10 meal images').setInputFiles([{name:'menu-a.png',mimeType:'image/png',buffer:image},{name:'menu-b.png',mimeType:'image/png',buffer:image}])
  await expect(dialog.locator('.meal-bulk-row')).toHaveCount(4)
  await expect(dialog).toContainText('4 drafts found · 2 selected')
  await expect(dialog.getByText('Duplicate name for this meal type.')).toBeVisible()
  const brisket=dialog.locator('.meal-bulk-row').nth(3)
  await expect(brisket.getByLabel('Meal name')).toHaveValue('Beef brisket')
  await brisket.getByRole('checkbox',{name:'Add this meal'}).check()
  await expect(dialog.getByRole('button',{name:'Add 3 meals to library'})).toBeDisabled()
  await brisket.getByLabel('Carbs (g)').fill('10')
  await dialog.getByRole('button',{name:'Add 3 meals to library'}).click()
  await expect(dialog).not.toBeVisible()
  expect(saved.action).toBe('bulk-create')
  expect(saved.meals.map(meal=>meal.name)).toEqual(['Turkey scramble','Salmon broccoli','Beef brisket'])
  expect(saved.meals[2].macros.carbohydrateGrams).toBe(10)
  expect(saved.meals.every(meal=>meal.timingRecorded===false)).toBe(true)
})

test('Review change opens Action Mode for a custom meal replacement',async({page})=>{
  await page.getByRole('button',{name:'Open Meal Plan',exact:true}).click()
  await page.evaluate(async()=>fetch('/.netlify/functions/meal-plans',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({mealType:'breakfast',name:'Saturday Pancakes',description:'Golden pancakes',ingredients:['2 cups pancake mix'],prepMinutes:5,cookMinutes:15,totalMinutes:20,serving:'1 pancake',macros:{calories:168,proteinGrams:2,carbohydrateGrams:21,fatGrams:8}})}))
  await page.reload()
  await page.getByRole('button',{name:'Open Meal Plan',exact:true}).click()
  await page.locator('.meal-calendar-day').first().getByRole('button',{name:'Customize',exact:true}).first().click()
  const replace=page.getByRole('dialog',{name:'Customize this meal'})
  await replace.getByRole('combobox',{name:'Use a library meal',exact:true}).selectOption({label:'Saturday Pancakes'})
  await replace.getByLabel('Cooking instructions').fill('Cook pancakes through and serve.')
  await replace.getByRole('button',{name:'Calculate nutrition',exact:true}).click()
  await replace.getByRole('button',{name:'Review changes',exact:true}).click()
  const review=page.getByRole('dialog',{name:'Review proposed Brevity changes'})
  await expect(review).toBeVisible()
  await expect(review).toContainText('Saturday Pancakes')
  await expect(review.getByRole('button',{name:'Apply approved changes'})).toBeVisible()
})

test('Next-Day Alignment retains the active weekly sermon instead of asking for another upload',async({page})=>{
  await page.getByRole('button',{name:/Tomorrow’s Alignment/}).click()
  await expect(page.getByRole('heading',{name:'Active teaching'})).toBeVisible()
  await expect(page.getByText('Weekly Word',{exact:true}).first()).toBeVisible()
  await expect(page.getByRole('heading',{name:'Upload the Word that will govern the formation cycle'})).toHaveCount(0)
})

test('Household Operations exposes Schedule, Routines, Operations and Inventory without crashing',async({page},testInfo)=>{await openMenuIfMobile(page,testInfo);await page.getByRole('button',{name:'Household Management'}).click();await openMenuIfMobile(page,testInfo);await page.getByRole('button',{name:'Household Operations'}).click();for(const label of ['Schedule','Routines','Operations','Supplies & Inventory'])await expect(page.getByRole('button',{name:label,exact:true})).toBeVisible();await expect(page.locator('body')).not.toContainText('Something went wrong')})

test('authorized user starts an assigned household task through Action Mode',async({page},testInfo)=>{
  await openMenuIfMobile(page,testInfo)
  await page.getByRole('button',{name:'Household Management'}).click()
  await openMenuIfMobile(page,testInfo)
  await page.getByRole('button',{name:'Household Operations'}).click()
  await closeMenuIfMobile(page,testInfo)
  await page.getByRole('button',{name:'Operations',exact:true}).click()
  await page.locator('.operations-filter-group').first().getByRole('button',{name:'All',exact:true}).click()
  const start=page.getByRole('button',{name:'Start task'}).first()
  await expect(start).toBeVisible()
  await start.click()
  await expect(page.getByRole('dialog',{name:'Review proposed Brevity changes'})).toContainText('Start')
  await expect(page.getByText('local changes that are not durably synchronized')).toHaveCount(0)
})

test('assigned chore owner completes every checklist item before confirmation',async({page},testInfo)=>{
  await openMenuIfMobile(page,testInfo)
  await page.getByRole('button',{name:'Household Management'}).click()
  await openMenuIfMobile(page,testInfo)
  await page.getByRole('button',{name:'Household Operations'}).click()
  await closeMenuIfMobile(page,testInfo)
  await page.getByRole('button',{name:'Operations',exact:true}).click()
  await expect(page.getByText('You can complete responsibilities assigned to you.')).toBeVisible()
  const task=page.locator('.maintenance-task').first()
  const checklist=task.locator('.maintenance-checklist input[type="checkbox"]')
  await expect(checklist.first()).toBeEnabled()
  const confirm=task.getByRole('button',{name:'Confirm complete'})
  await expect(confirm).toBeDisabled()
  for(let index=0;index<await checklist.count();index+=1)await checklist.nth(index).check()
  await expect(task.getByText(/All checklist items are checked/)).toBeVisible()
  await expect(confirm).toBeEnabled()
  await confirm.click()
  const review=page.getByRole('dialog',{name:'Review proposed Brevity changes'})
  await expect(review).toContainText('Confirm completion')
  await expect(review).toContainText('Submit')
})

test('Household Operations can add and edit chore dates, times, owners, and details through Action Mode',async({page},testInfo)=>{
  await openMenuIfMobile(page,testInfo);await page.getByRole('button',{name:'Household Management'}).click();await openMenuIfMobile(page,testInfo);await page.getByRole('button',{name:'Household Operations'}).click();await closeMenuIfMobile(page,testInfo);await page.getByRole('button',{name:'Operations',exact:true}).click()
  await page.getByRole('button',{name:'Add chore'}).click()
  const editor=page.getByRole('dialog',{name:'Add chore'})
  await editor.getByRole('textbox',{name:'Chore',exact:true}).fill('Clean pantry')
  await editor.getByLabel('Start time').fill('16:00');await editor.getByLabel('End time').fill('17:00')
  await editor.getByLabel(/Description/).fill('Discard expired items\nWipe shelves')
  await editor.getByRole('button',{name:'Review change'}).click()
  await expect(page.getByRole('dialog',{name:'Review proposed Brevity changes'})).toContainText('Add household chore')
  await page.getByRole('button',{name:'Close confirmation'}).click()
  await page.getByRole('dialog',{name:'Brevity Assistant'}).getByRole('button',{name:'Close Brevity Assistant'}).click()
  await page.locator('.operations-filter-group').first().getByRole('button',{name:'All',exact:true}).click()
  await page.getByRole('button',{name:'Edit details'}).first().click()
  const edit=page.getByRole('dialog',{name:'Edit chore'})
  await expect(edit.getByLabel('Date')).toHaveValue(/\d{4}-\d{2}-\d{2}/)
  await expect(edit.getByRole('checkbox',{name:'Larry',exact:true})).toBeVisible()
  await expect(edit.getByRole('button',{name:'Review deletion'})).toBeVisible()
})

test('Project review repairs stale local synchronization metadata before opening Action Mode',async({page},testInfo)=>{
  await openMenuIfMobile(page,testInfo)
  await page.getByRole('button',{name:'Household Management'}).click()
  await openMenuIfMobile(page,testInfo)
  await page.getByRole('button',{name:'Projects'}).click()
  await closeMenuIfMobile(page,testInfo)
  await expect(page.getByText('Kitchen refresh',{exact:true})).toBeVisible()
  await page.getByTitle('Edit through Action Mode').click()
  const editor=page.locator('.hq-modal-card')
  await expect(editor).toContainText('Edit Item')
  await editor.locator('input').first().fill('Kitchen completion')
  await page.evaluate(()=>localStorage.setItem('brevity_shared_state_meta_v1',JSON.stringify({homehq_items_v1:{version:4,hash:'stale-browser-hash'}})))
  await editor.getByRole('button',{name:'Review in Action Mode'}).click()
  await expect(page.getByRole('dialog',{name:'Review proposed Brevity changes'})).toContainText('Kitchen completion')
  await expect(page.getByText('local changes that are not durably synchronized')).toHaveCount(0)
})

test('Finance primary workspaces open without a fatal error',async({page},testInfo)=>{await openMenuIfMobile(page,testInfo);await page.getByRole('button',{name:'Finance',exact:true}).click();for(const label of ['Dashboard','Meetings','Transactions','Cash Forecast','Accounts','Budget','Recurring','Reporting']){await openMenuIfMobile(page,testInfo);await page.getByRole('button',{name:label,exact:true}).click();await expect(page.locator('body')).not.toContainText('Something went wrong');await expect(page.locator('body')).not.toContainText('Application error')}})

test('Projected Expenses includes one-time calendar obligations in the selected timeframe',async({page},testInfo)=>{
  await openMenuIfMobile(page,testInfo)
  await page.getByRole('button',{name:'Finance',exact:true}).click()
  await openMenuIfMobile(page,testInfo)
  await page.getByRole('button',{name:'Dashboard',exact:true}).click()
  await closeMenuIfMobile(page,testInfo)
  const card=page.locator('.kpi-card').filter({hasText:'Projected Expenses'})
  await expect(card).toContainText('$40.00')
  await expect(card).toContainText('1 projected item')
  await card.click()
  await expect(page.getByText('Projected expenses',{exact:true})).toBeVisible()
  await expect(page.getByText('Planned groceries',{exact:true})).toBeVisible()
  await expect(page.getByText('Expected Expenses',{exact:true})).toBeVisible()
  await expect(page.getByText('$40.00',{exact:true}).first()).toBeVisible()
})

test('Transactions keep account and timeframe scope visible with filtered totals',async({page},testInfo)=>{
  await openMenuIfMobile(page,testInfo)
  await page.getByRole('button',{name:'Finance',exact:true}).click()
  await openMenuIfMobile(page,testInfo)
  await page.getByRole('button',{name:'Transactions',exact:true}).click()
  await closeMenuIfMobile(page,testInfo)
  await page.getByLabel('Select financial timeframe').selectOption('this-month')
  await expect(page.getByLabel('Current Finance scope: This Month · Operating Account')).toBeVisible()
  await expect(page.getByText(/scheduled transactions · This Month · Operating Account$/)).toBeVisible()
})

test('posted transaction categorization rules are discoverable and preview exact bank matches',async({page},testInfo)=>{
  await openMenuIfMobile(page,testInfo)
  await page.getByRole('button',{name:'Finance',exact:true}).click()
  await openMenuIfMobile(page,testInfo)
  await page.getByRole('button',{name:'Transactions',exact:true}).click()
  await closeMenuIfMobile(page,testInfo)
  await page.getByRole('button',{name:'Show bank activity'}).click()
  await page.getByRole('button',{name:'Categorization rules'}).click()
  const dialog=page.getByRole('dialog',{name:'Categorization rules'})
  await expect(dialog).toBeVisible()
  await dialog.getByLabel('Match text').fill('Market')
  await dialog.getByLabel('Apply category').fill('Groceries')
  await expect(dialog).toContainText('1 posted sample found.')
  await expect(dialog).toContainText('Neighborhood Market')
  await expect(dialog.getByRole('option',{name:'Operating Account'})).toHaveCount(1)
  await expect(dialog.getByRole('button',{name:'Review new rule'})).toBeEnabled()
})

test('changing a posted transaction category offers a prefilled rule with past-match control',async({page},testInfo)=>{
  await openMenuIfMobile(page,testInfo)
  await page.getByRole('button',{name:'Finance',exact:true}).click()
  await openMenuIfMobile(page,testInfo)
  await page.getByRole('button',{name:'Transactions',exact:true}).click()
  await closeMenuIfMobile(page,testInfo)
  await page.getByRole('button',{name:'Show bank activity'}).click()
  await page.getByText('Neighborhood Market',{exact:true}).click()
  const category=page.getByRole('combobox',{name:'Transaction category'})
  await category.fill('Groceries')
  await category.blur()
  await expect(page.getByText('Save this category change as a rule?')).toBeVisible()
  await page.getByRole('button',{name:'Yes, set up rule'}).click()
  const dialog=page.getByRole('dialog',{name:'Categorization rules'})
  await expect(dialog.getByLabel('Match text')).toHaveValue('Neighborhood Market')
  await expect(dialog.getByLabel('Apply category')).toHaveValue('Groceries')
  const pastMatches=dialog.getByRole('checkbox',{name:/Apply this rule to all past matching transactions/})
  await expect(pastMatches).not.toBeChecked()
  await pastMatches.check()
  await dialog.getByRole('button',{name:'Review new rule'}).click()
  await expect(page.getByRole('dialog',{name:'Review proposed Brevity changes'})).toBeVisible()
  await expect(page.getByRole('heading',{name:/Automatically categorize matching past and future Neighborhood Market transactions as Groceries/})).toBeVisible()
})

test('Finance applies posted bank activity to debt with reviewed interest and principal',async({page},testInfo)=>{
  await openMenuIfMobile(page,testInfo)
  await page.getByRole('button',{name:'Finance',exact:true}).click()
  await openMenuIfMobile(page,testInfo)
  await page.getByRole('button',{name:'Transactions',exact:true}).click()
  await closeMenuIfMobile(page,testInfo)
  await page.getByRole('button',{name:'Show bank activity'}).click()
  await page.getByText('Mortgage payment',{exact:true}).click()
  await page.getByLabel('Debt account').selectOption('mortgage')
  await page.getByLabel('Escrow fees or other non-principal amount').fill('900')
  await page.getByLabel('Save as a debt payment rule').check()
  await page.getByLabel('Debt rule match text').fill('MONTHLY MORTGAGE')
  const preview=page.getByLabel('Debt payment allocation preview')
  await expect(preview).toContainText('Interest $1500.00')
  await expect(preview).toContainText('Principal $600.00')
  await expect(preview).toContainText('New balance $299,400.00')
  await expect(preview).toContainText('Amortized APR')
  await page.getByRole('button',{name:'Review debt payment'}).click()
  const review=page.getByRole('dialog',{name:'Review proposed Brevity changes'})
  await expect(review).toContainText('Apply the posted')
  await expect(review).toContainText('reduce only principal')
  await expect(review).toContainText('Save a future-payment rule matching “MONTHLY MORTGAGE”')
  await expect(review).toContainText('never moves money')
})

test('Scenario Modeling edits descriptions, income rows, and recurring-expense totals through Action Mode',async({page},testInfo)=>{
  await openMenuIfMobile(page,testInfo)
  await page.getByRole('button',{name:'Finance',exact:true}).click()
  await openMenuIfMobile(page,testInfo)
  await page.getByRole('button',{name:'Scenario Modeling',exact:true}).click()
  await closeMenuIfMobile(page,testInfo)
  await expect(page.getByRole('heading',{name:'Scenario Modeling',exact:true})).toBeVisible()

  await page.getByLabel('Income 1 description draft').fill('LS Primary Salary')
  await page.getByRole('button',{name:'Review changes to LS Primary Salary'}).click()
  let review=page.getByRole('dialog',{name:'Review proposed Brevity changes'})
  await expect(review).toContainText('Update reviewed forecast assumptions for “LS Genesco Inc.”')
  await review.getByRole('button',{name:'Cancel'}).click()
  await page.getByRole('dialog',{name:'Brevity Assistant'}).getByRole('button',{name:'Close Brevity Assistant'}).click()

  await page.getByRole('button',{name:'Add income source'}).click()
  const newRow=page.locator('.scenario-table tbody tr').last()
  await newRow.getByPlaceholder('Income source name').fill('Consulting Income')
  await newRow.getByLabel('Consulting Income monthly net draft').fill('5000')
  await newRow.getByLabel('Consulting Income annual gross draft').fill('80000')
  await newRow.getByLabel('Consulting Income contribution draft').fill('8')
  await newRow.getByRole('button',{name:'Review addition of Consulting Income'}).click()
  review=page.getByRole('dialog',{name:'Review proposed Brevity changes'})
  await expect(review).toContainText('Add “Consulting Income” to “Current” after review.')
  await review.getByRole('button',{name:'Cancel'}).click()
  await page.getByRole('dialog',{name:'Brevity Assistant'}).getByRole('button',{name:'Close Brevity Assistant'}).click()

  await page.getByRole('button',{name:'Review removal of LS Primary Salary'}).click()
  review=page.getByRole('dialog',{name:'Review proposed Brevity changes'})
  await expect(review).toContainText('Remove “LS Genesco Inc.” from “Current” after review.')
  await review.getByRole('button',{name:'Cancel'}).click()
  await page.getByRole('dialog',{name:'Brevity Assistant'}).getByRole('button',{name:'Close Brevity Assistant'}).click()

  await page.getByLabel('Monthly recurring expense total draft').fill('22000')
  await page.getByRole('button',{name:'Review expense total'}).click()
  review=page.getByRole('dialog',{name:'Review proposed Brevity changes'})
  await expect(review).toContainText('Use $22,000.00 as the reviewed monthly recurring-expense total.')
})

test('Finance workspaces fit phone and tablet viewports without overlapping filters',async({page},testInfo)=>{
  test.skip(testInfo.project.name==='desktop-chromium','responsive contract')
  await openMenuIfMobile(page,testInfo)
  await page.getByRole('button',{name:'Finance',exact:true}).click()
  for(const label of ['Dashboard','Meetings','Transactions','Cash Forecast','Accounts','Budget','Recurring','Reporting']){
    await openMenuIfMobile(page,testInfo)
    await page.getByRole('button',{name:label,exact:true}).click()
    await expect.poll(()=>page.locator('.app-main').evaluate(element=>element.scrollWidth-element.clientWidth),`${label} workspace should not overflow .app-main`).toBeLessThanOrEqual(1)
  }
  await openMenuIfMobile(page,testInfo)
  await page.getByRole('button',{name:'Transactions',exact:true}).click()
  const controls=page.locator('.transaction-list-controls > *')
  const boxes=await controls.evaluateAll(elements=>elements.map(element=>{
    const rect=element.getBoundingClientRect()
    return{left:rect.left,right:rect.right,top:rect.top,bottom:rect.bottom}
  }))
  for(let left=0;left<boxes.length;left+=1){
    for(let right=left+1;right<boxes.length;right+=1){
      const a=boxes[left],b=boxes[right]
      const overlapX=Math.min(a.right,b.right)-Math.max(a.left,b.left)
      const overlapY=Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)
      expect(overlapX>1&&overlapY>1,`transaction controls ${left} and ${right} overlap`).toBe(false)
    }
  }
})

test('iPhone Cash Forecast keeps Finance context visible without covering its monthly plan',async({page},testInfo)=>{
  test.skip(testInfo.project.name!=='iphone','iPhone Cash Forecast contract')
  await openMenuIfMobile(page,testInfo)
  await page.getByRole('button',{name:'Finance',exact:true}).click()
  await openMenuIfMobile(page,testInfo)
  await page.getByRole('button',{name:'Cash Forecast',exact:true}).click()
  await closeMenuIfMobile(page,testInfo)

  await expect(page.getByRole('heading',{name:'Cash Forecast',exact:true})).toBeVisible()
  await expect(page.getByRole('button',{name:/Show \d+ bank transactions? for /})).toBeVisible()
  await expect(page.getByText('Dates / Timeframe',{exact:true})).toHaveCount(0)
  await expect(page.locator('.finance-calendar-mobile-agenda')).toContainText('Scheduled')
  await expect(page.locator('.finance-calendar-mobile-agenda')).toContainText(/(?:Balance from posted activity|Current bank balance|Last saved bank balance|Forecast balance)/)
  await page.getByRole('button',{name:/Show 3 bank transactions for /}).click()
  const agenda=page.locator('.finance-calendar-mobile-agenda')
  await expect(agenda).toContainText('Bank activity')
  await expect(agenda).toContainText('Posted · Transfer · PAYMENT TO CAPITAL ONE')
  await expect(agenda).toContainText('Pending · Gas station authorization')
  await expect(agenda).toContainText(/Pending authorizations\s*−\$30\.00\s*· excluded from posted movement/)
  await expect(agenda).toContainText(/Posted movement\s*−\$100\.00/)
  await agenda.locator(':scope > button').filter({hasText:'PAYMENT TO CAPITAL ONE'}).click()
  await expect(page.getByText(/Transfer · included in bank balance movement, excluded from income and expense totals/)).toBeVisible()
  await page.getByRole('button',{name:'Next financial calendar month'}).click()
  await expect(agenda.locator(':scope > button.is-selected')).toHaveCount(0)
  await expect(page.locator('.finance-calendar-day-header')).toHaveCount(0)

  const main=page.locator('.app-main')
  await main.evaluate(element=>{element.scrollTop=0})
  const beforeScroll=await page.evaluate(()=>{
    const account=document.querySelector('.finance-account-filter')
    const history=document.querySelector('.app-context-navigation')
    const accountBox=account?.getBoundingClientRect()
    const historyBox=history?.getBoundingClientRect()
    return{
      accountTop:accountBox?.top??-1,
      historyBottom:historyBox?.bottom??-1,
    }
  })
  await main.evaluate(element=>{element.scrollTop=Math.min(800,element.scrollHeight-element.clientHeight)})
  await expect.poll(()=>main.evaluate(element=>element.scrollTop)).toBeGreaterThan(100)

  const layout=await page.evaluate(()=>{
    const account=document.querySelector('.finance-account-filter')
    const intro=document.querySelector('.finance-calendar-intro')
    const root=document.querySelector('.finance-root')
    const history=document.querySelector('.app-context-navigation')
    const accountBox=account?.getBoundingClientRect()
    const introBox=intro?.getBoundingClientRect()
    const historyBox=history?.getBoundingClientRect()
    return{
      accountPosition:account?getComputedStyle(account).position:'missing',
      accountTop:accountBox?.top??-1,
      historyBottom:historyBox?.bottom??-1,
      rootOverflow:root?getComputedStyle(root).overflowY:'missing',
      overlaps:Boolean(accountBox&&introBox&&Math.min(accountBox.bottom,introBox.bottom)-Math.max(accountBox.top,introBox.top)>1),
    }
  })
  expect(layout.accountPosition).toBe('relative')
  expect(layout.accountTop).toBeLessThan(beforeScroll.accountTop-100)
  expect(layout.rootOverflow).toBe('visible')
  expect(layout.overlaps).toBe(false)
})

test('iPhone account-link repair turns an unmatched balance warning into a compatible reviewed choice',async({page},testInfo)=>{
  test.skip(testInfo.project.name!=='iphone','iPhone account-link repair contract')
  await openMenuIfMobile(page,testInfo)
  await page.getByRole('button',{name:'Finance',exact:true}).click()
  await openMenuIfMobile(page,testInfo)
  await page.getByRole('button',{name:'Dashboard',exact:true}).click()
  await closeMenuIfMobile(page,testInfo)
  await page.getByRole('button',{name:/Check existing connection|Sync now/i}).click()
  const warning=page.getByRole('alert')
  await expect(warning).toContainText('returned bank accounts are available for reviewed linkage')
  await warning.getByRole('button',{name:'Review account links'}).click()
  const selector=page.getByRole('combobox',{name:'Bank source for Operating Account'})
  await expect(selector).toBeVisible()
  await selector.selectOption({label:'Pinnacle · Personal Checking ••••0607'})
  await expect(page.getByRole('button',{name:'Review link'})).toBeEnabled()
  await expect.poll(()=>page.locator('.app-main').evaluate(element=>element.scrollWidth-element.clientWidth)).toBeLessThanOrEqual(1)
})

test('iPad already-linked accounts ignore additional institution accounts without a false partial warning',async({page},testInfo)=>{
  test.skip(testInfo.project.name!=='tablet','iPad already-linked account contract')
  await openMenuIfMobile(page,testInfo)
  await page.getByRole('button',{name:'Finance',exact:true}).click()
  await openMenuIfMobile(page,testInfo)
  await page.getByRole('button',{name:'Dashboard',exact:true}).click()
  await page.getByRole('button',{name:/Check existing connection|Sync now/i}).click()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(page.getByRole('status').filter({hasText:'The latest available transactions were checked.'})).toBeVisible()
  await openMenuIfMobile(page,testInfo)
  await page.getByRole('button',{name:'Accounts',exact:true}).click()
  await expect(page.getByRole('note')).toContainText('All 3 Brevity accounts are linked to verified bank sources. No action is required.')
  await expect(page.getByRole('button',{name:'Linked'})).toHaveCount(3)
  await expect(page.getByRole('button',{name:'Review link'})).toHaveCount(0)
})

test('Family Calendar opens as the single shared calendar surface',async({page},testInfo)=>{await openMenuIfMobile(page,testInfo);await page.getByRole('button',{name:'Household Management'}).click();await openMenuIfMobile(page,testInfo);await page.getByRole('button',{name:'Family Calendar'}).click();await expect(page.locator('body')).not.toContainText('My Planner');await expect(page.locator('body')).not.toContainText('Something went wrong')})

test('iPad landscape Family Calendar keeps all seven columns inside its content lane',async({page},testInfo)=>{
  test.skip(testInfo.project.name!=='tablet-landscape','iPad landscape layout contract')
  await page.getByRole('button',{name:'Household Management'}).click()
  await page.getByRole('button',{name:'Family Calendar'}).click()
  const scroll=page.locator('.family-calendar-scroll')
  await expect(scroll).toBeVisible()
  const dimensions=await scroll.evaluate(element=>({clientWidth:element.clientWidth,scrollWidth:element.scrollWidth}))
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth+1)
  await expect(page.locator('.family-calendar-weekday')).toHaveCount(7)
})

test('Settings remains operational when optional integration payloads are empty',async({page},testInfo)=>{await openMenuIfMobile(page,testInfo);await page.getByRole('button',{name:'Settings'}).click();await expect(page.getByRole('heading',{name:'Settings',exact:true})).toBeVisible();await expect(page.locator('body')).not.toContainText('Recovery Mode');await expect(page.locator('body')).not.toContainText('Cannot read properties of undefined')})

test('iPhone alignment keeps Next Pillar above fixed bottom navigation',async({page},testInfo)=>{test.skip(testInfo.project.name!=='iphone','iPhone layout contract');await page.getByRole('button',{name:/Start Today’s Alignment/}).click();const next=page.getByRole('button',{name:'Next Pillar'}),bottomNav=page.locator('.mobile-app-nav'),main=page.locator('.app-main');await expect(next).toBeVisible();await expect(bottomNav).toBeVisible();await main.evaluate(element=>{element.scrollTop=element.scrollHeight});await expect.poll(async()=>{const nextBox=await next.boundingBox(),navBox=await bottomNav.boundingBox();return nextBox&&navBox?Math.round(navBox.y-(nextBox.y+nextBox.height)):-999},{timeout:5000}).toBeGreaterThanOrEqual(0)})

test('saved task opens its exact dated record after reload and detects Undo',async({page})=>{
  await mockBackend(page)
  const task={id:'saved-task-1',date:'2026-10-02',title:'Inspect garage',owner:'Larry',status:'pending',notes:'Check the hinge'}
  let removed=false
  await page.route('**/.netlify/functions/brevity-conversation',route=>route.fulfill({json:{version:1,messages:[{role:'assistant',content:'Saved task for October 2. This task was not added to the calendar.',taskLinks:[task]}]}}))
  await page.route('**/.netlify/functions/household-data?*',route=>{
    const date=new URL(route.request().url()).searchParams.get('date')
    return route.fulfill({json:{plan:{...plan(date),assignments:date===task.date&&!removed?[task]:[]}}})
  })
  await page.goto('/')
  await page.reload()
  await page.getByRole('button',{name:'Open Brevity Assistant',exact:true}).click()
  await page.getByRole('button',{name:'Open task: Inspect garage',exact:true}).click()
  const dialog=page.getByRole('dialog',{name:'Saved task',exact:true})
  await expect(dialog.getByRole('heading',{name:'Inspect garage'})).toBeVisible()
  await expect(dialog.getByText('Check the hinge',{exact:true})).toBeVisible()
  await expect(dialog.getByText('2026-10-02',{exact:true})).toBeVisible()
  await dialog.getByRole('button',{name:'Close saved task'}).click()
  removed=true
  await page.getByRole('button',{name:'Open task: Inspect garage',exact:true}).click()
  await expect(dialog.getByText('This task is no longer in the daily plan. It may have been undone or removed.')).toBeVisible()
})


test('Household Intelligence dashboard withholds scores when evidence is unavailable and retries',async({page},testInfo)=>{
  let failed=true
  await page.route('**/.netlify/functions/household-performance-evidence?**',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({dailyPlans:[],reportedActivities:[],unavailable:failed?[{date:dateKey(),source:'daily-plan'}]:[]})}))
  await openMenuIfMobile(page,testInfo)
  await page.getByRole('button',{name:'Household Management',exact:true}).click()
  await page.getByRole('button',{name:'Household Intelligence',exact:true}).click()
  await closeMenuIfMobile(page,testInfo)
  await expect(page.getByRole('alert')).toContainText('Scores are withheld')
  await expect(page.locator('.hpi-pillars')).toHaveCount(0)
  failed=false
  await page.getByRole('button',{name:'Retry evidence'}).click()
  await expect(page.getByRole('heading',{name:'Pillar Balance'})).toBeVisible()
})

test('Apple Health privacy choices require review and keep unknown totals explicit',async({page},testInfo)=>{
  let writes=[]
  let health={member:'Larry',version:1,consentRevision:1,connection:{deviceId:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',enabled:true,steps:true,workouts:true,assistantAccess:false,shareSteps:false,shareWorkouts:false,stepGoal:12000},today:{date:dateKey(),steps:8500,workoutCount:null,workoutMinutes:null},days:[],audit:[],source:'Apple Health via Brevity iPhone',timeZone:'America/New_York',lastSyncAt:null,stale:true}
  await page.route('**/.netlify/functions/member-health**',async route=>{
    const action=new URL(route.request().url()).searchParams.get('action')
    if(route.request().method()==='POST'){const body=route.request().postDataJSON();writes.push(body);health={...health,version:health.version+1,connection:Object.fromEntries(Object.entries(body).filter(([key])=>!['confirmed','expectedVersion'].includes(key)))}}
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(action==='household'?{summaries:[],unavailable:false}:health)})
  })
  await openMenuIfMobile(page,testInfo)
  await page.getByRole('button',{name:'Health & Nutrition',exact:true}).click()
  await page.getByRole('button',{name:'Health Connections',exact:true}).click()
  await closeMenuIfMobile(page,testInfo)
  await expect(page.getByRole('heading',{name:'Health Connections',exact:true})).toBeVisible()
  await expect(page.locator('.health-metrics')).toContainText('8,500')
  await expect(page.locator('.health-metrics')).toContainText('Unknown')
  await expect(page.getByLabel('Let Ask Brevity use these summaries')).not.toBeChecked()
  await page.getByLabel('Share daily step totals and goal with the household').check()
  expect(writes).toHaveLength(0)
  await page.getByRole('button',{name:'Review changes',exact:true}).click()
  const review=page.getByRole('dialog',{name:'Review health privacy changes'})
  await expect(review).toContainText('step totals shared')
  await review.getByRole('button',{name:'Cancel',exact:true}).click()
  expect(writes).toHaveLength(0)
  await expect(page.getByLabel('Share daily step totals and goal with the household')).not.toBeChecked()
  await page.getByLabel('Let Ask Brevity use these summaries').check()
  await page.getByRole('button',{name:'Review changes',exact:true}).click()
  await review.getByRole('button',{name:'Confirm health choices'}).click()
  await expect(review).toHaveCount(0)
  expect(writes).toHaveLength(1)
  expect(writes[0]).toMatchObject({confirmed:true,expectedVersion:1,assistantAccess:true,shareSteps:false,shareWorkouts:false})
  await page.getByRole('button',{name:'Disconnect iPhone'}).click()
  await expect(review).toContainText('cannot be undone')
  await review.getByRole('button',{name:'Cancel',exact:true}).click()
  expect(writes).toHaveLength(1)
})

test('Vendor directory reviews edits without exposing saved login secrets',async({page},testInfo)=>{
  const vendor={id:'vendor-fixture',name:'Fixture Insurance',address:'123 Sample Lane',phone:'555-0100',email:'billing@example.com',website:'https://example.com',paymentUrl:'https://example.com/pay',accessMembers:[],documents:[{blobId:'policy-fixture',fileName:'Policy.pdf',mimeType:'application/pdf',size:100}],loginBlobId:'login-fixture'}
  await mockBackend(page,{financeFixture:true})
  await page.route('**/.netlify/functions/finance-vendors**',async route=>{const action=new URL(route.request().url()).searchParams.get('action');if(action==='unlock')return route.fulfill({status:403,contentType:'application/json',body:JSON.stringify({error:'Your Brevity password is incorrect.'})});await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({version:3,isAdmin:true,vendors:[vendor],links:{}})})})
  await page.reload();await expect(page.locator('.app-shell')).toBeVisible()
  await openMenuIfMobile(page,testInfo)
  await page.getByRole('button',{name:'Finance',exact:true}).click()
  await page.getByRole('button',{name:'Vendors',exact:true}).click()
  await closeMenuIfMobile(page,testInfo)
  await expect(page.getByRole('heading',{name:'Vendors',exact:true})).toBeVisible()
  await page.getByRole('button',{name:/Fixture Insurance.*net posted spending/}).click()
  await expect(page.getByRole('link',{name:'Open bill payment website ↗'})).toHaveAttribute('href','https://example.com/pay')
  await expect(page.getByRole('link',{name:'Policy.pdf'})).toHaveAttribute('href',/finance-vendors\?action=download/)
  await expect(page.getByRole('button',{name:'Unlock saved login'})).toBeVisible()
  await expect(page.locator('.vendor-revealed')).toHaveCount(0)
  await page.getByRole('button',{name:'Edit vendor',exact:true}).click()
  const dialog=page.getByRole('dialog',{name:'Vendor details'})
  await dialog.getByLabel('Phone',{exact:true}).fill('555-0199')
  await dialog.getByRole('button',{name:'Review vendor changes'}).click()
  await expect(page.locator('.brevity-action-review')).toContainText('555-0199')
  await expect(page.locator('.brevity-action-review')).not.toContainText('fixture-secret')
})

test('Vendor credentials are staged separately and reviews contain only an opaque reference',async({page},testInfo)=>{
  const prepared=[]
  const vendor={id:'vendor-fixture',name:'Fixture Utility',accessMembers:[],documents:[]}
  await page.route('**/.netlify/functions/finance-vendors**',async route=>{const action=new URL(route.request().url()).searchParams.get('action');await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(action==='stage-login'?{upload:{blobId:'encrypted-fixture'}}:{version:2,isAdmin:true,vendors:[vendor],links:{}})})})
  page.on('request',request=>{if(request.url().includes('action=prepare-direct'))prepared.push(request.postDataJSON())})
  await openMenuIfMobile(page,testInfo);await page.getByRole('button',{name:'Finance',exact:true}).click();await page.getByRole('button',{name:'Vendors',exact:true}).click();await closeMenuIfMobile(page,testInfo)
  await page.getByRole('button',{name:/Fixture Utility.*net posted spending/}).click()
  await page.getByRole('button',{name:'Add login / accounts'}).click()
  const dialog=page.getByRole('dialog',{name:'Protected vendor login'})
  await dialog.getByLabel('Username',{exact:true}).fill('fixture-user')
  await dialog.getByLabel('Password',{exact:true}).fill('fixture-secret')
  await dialog.getByLabel('Account numbers and labels',{exact:true}).fill('fixture-account')
  await dialog.getByRole('button',{name:'Encrypt and review'}).click()
  await expect(page.locator('.brevity-action-review')).toContainText('encrypted-fixture')
  expect(prepared).toHaveLength(1)
  expect(prepared[0].operation.payload).toEqual({blobId:'encrypted-fixture'})
  expect(JSON.stringify(prepared)).not.toMatch(/fixture-secret|fixture-user|fixture-account/)
  await expect(dialog).toHaveCount(0)
})

test('Vendor sorting and planned expense assignment preserve canonical record references',async({page},testInfo)=>{
  const vendors=[{id:'zeta',name:'Zeta Insurance',accessMembers:[],documents:[]},{id:'alpha',name:'Alpha Utility',accessMembers:[],documents:[]}],prepared=[]
  await mockBackend(page,{financeFixture:true})
  await page.route('**/.netlify/functions/finance-vendors**',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({version:3,isAdmin:true,vendors,links:{'posted:bank-grocery':'zeta','posted:bank-pending':'alpha'}})}))
  page.on('request',request=>{if(request.url().includes('action=prepare-direct'))prepared.push(request.postDataJSON())})
  await page.reload();await expect(page.locator('.app-shell')).toBeVisible()
  await openMenuIfMobile(page,testInfo);await page.getByRole('button',{name:'Finance',exact:true}).click();await page.getByRole('button',{name:'Vendors',exact:true}).click();await closeMenuIfMobile(page,testInfo)
  const directory=page.getByRole('navigation',{name:'Vendor directory'})
  await page.getByLabel('Finance vendor sort').selectOption('desc')
  await expect(directory.getByRole('button').first()).toContainText('Zeta Insurance')
  await page.getByLabel('Finance vendor sort').selectOption('asc')
  await expect(directory.getByRole('button').first()).toContainText('Alpha Utility')
  await page.getByLabel('Expense assignment view').selectOption('planned')
  await page.getByRole('combobox',{name:'Vendor for Planned groceries',exact:true}).fill('Alpha')
  await page.getByRole('option',{name:/Alpha/}).click()
  await page.getByRole('button',{name:'Review link',exact:true}).click()
  await expect(page.locator('.brevity-action-review')).toContainText('Alpha Utility')
  expect(prepared).toHaveLength(1)
  expect(prepared[0].operation).toMatchObject({type:'recurring.update',targetId:'planned-grocery',payload:{vendorId:'alpha'}})
})

test('Vendor link from a project opens the canonical finance record',async({page},testInfo)=>{
  await mockBackend(page,{projectFixture:true})
  await page.route('**/.netlify/functions/finance-vendors**',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({version:1,isAdmin:true,vendors:[{id:'project-vendor',name:'Current Contractor Name',phone:'555-0123',accessMembers:[],documents:[]}],links:{}})}))
  await page.reload();await expect(page.locator('.app-shell')).toBeVisible()
  await openMenuIfMobile(page,testInfo);await page.getByRole('button',{name:'Household Management'}).click();await openMenuIfMobile(page,testInfo);await page.getByRole('button',{name:'Projects',exact:true}).click();await closeMenuIfMobile(page,testInfo)
  await page.getByRole('button',{name:'Show Kitchen refresh details',exact:true}).click()
  await page.getByRole('button',{name:'Vendor: Current Contractor Name',exact:true}).click()
  await expect(page.getByRole('heading',{name:'Vendors',exact:true})).toBeVisible()
  await expect(page.getByRole('heading',{name:'Current Contractor Name',exact:true})).toBeVisible()
  await expect(page.getByText('555-0123',{exact:true})).toBeVisible()
})

test('Family Calendar opens the exact authoritative project and preserves unrelated matching appointments',async({page},testInfo)=>{
  await mockBackend(page,{projectFixture:true})
  const records=projectRecords(),projects=JSON.parse(records.homehq_items_v1.value)
  projects[0]={...projects[0],startDate:dateKey(),due:dateKey(),pushToFamilyCalendar:true}
  records.homehq_items_v1.value=JSON.stringify(projects)
  await page.route('**/.netlify/functions/household-state**',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({records,serverTime:new Date().toISOString()})}))
  await page.route('**/.netlify/functions/icloud-calendar**',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({events:[{id:'separate-apple-id',source:'icloud',title:'Kitchen refresh',date:dateKey(),allDay:true,owner:'Larry'}],connected:true})}))
  await page.reload();await expect(page.locator('.app-shell')).toBeVisible()
  await openMenuIfMobile(page,testInfo);await page.getByRole('button',{name:'Household Management',exact:true}).click();await openMenuIfMobile(page,testInfo);await page.getByRole('button',{name:'Family Calendar',exact:true}).click();await closeMenuIfMobile(page,testInfo)
  if(testInfo.project.name!=='iphone')await page.getByRole('button',{name:'Agenda',exact:true}).click()
  const agenda=page.locator('.family-calendar-mobile-agenda')
  await expect(agenda.getByText('Kitchen refresh',{exact:true})).toHaveCount(2)
  await agenda.getByRole('button',{name:'Open project Kitchen refresh',exact:true}).click()
  await expect(page.getByRole('button',{name:'Hide Kitchen refresh details',exact:true})).toBeVisible()
  await page.getByRole('button',{name:'Edit project Kitchen refresh',exact:true}).click()
  await expect(page.getByText('Show project on Family Calendar',{exact:true})).toBeVisible()
  const checkbox=page.locator('.hq-modal-card input[type="checkbox"]').first()
  await expect(checkbox).toBeChecked()
  const prepared=[]
  page.on('request',request=>{if(request.url().includes('action=prepare-direct'))prepared.push(request.postDataJSON())})
  await checkbox.uncheck()
  await page.getByRole('button',{name:'Review in Action Mode',exact:true}).click()
  await expect(page.getByRole('dialog',{name:'Review proposed Brevity changes'})).toBeVisible()
  expect(prepared).toHaveLength(1)
  expect(prepared[0].operation).toMatchObject({type:'project.update',targetId:'kitchen-1',payload:{pushToFamilyCalendar:false}})
})

test('Project Apple publication prepares an exact source review without writing the calendar',async({page},testInfo)=>{
  await mockBackend(page,{projectFixture:true})
  const records=projectRecords(),projects=JSON.parse(records.homehq_items_v1.value)
  projects[0]={...projects[0],startDate:dateKey(),due:dateKey(),pushToFamilyCalendar:true}
  records.homehq_items_v1.value=JSON.stringify(projects)
  await page.route('**/.netlify/functions/household-state**',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({records,serverTime:new Date().toISOString()})}))
  const prepared=[],calendarWrites=[]
  page.on('request',request=>{if(request.url().includes('/icloud-calendar')&&request.method()!=='GET')calendarWrites.push(request.method())})
  await page.route('**/.netlify/functions/brevity-assistant-actions?action=prepare-project-calendar',route=>{
    const input=route.request().postDataJSON();prepared.push(input)
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({proposal:{id:'apple-project-review',summary:'Publish saved Kitchen refresh to Apple Calendar. Later changes require republishing.',risk:'confirmation',operations:[{id:'apple-project-op',type:'calendar.create',domain:'calendar',description:'Publish the saved project dates and RACI members to Apple Calendar',targetId:'project-kitchen-1',payload:{title:'Kitchen refresh',date:dateKey(),allDay:true},allowedScopes:['this-item'],defaultScope:'this-item',risk:'confirmation'}]}})})
  })
  await page.reload();await expect(page.locator('.app-shell')).toBeVisible()
  await openMenuIfMobile(page,testInfo);await page.getByRole('button',{name:'Household Management',exact:true}).click();await openMenuIfMobile(page,testInfo);await page.getByRole('button',{name:'Projects',exact:true}).click();await closeMenuIfMobile(page,testInfo)
  await page.getByRole('button',{name:'Publish project Kitchen refresh to Apple Calendar',exact:true}).click()
  await expect(page.getByRole('dialog',{name:'Review proposed Brevity changes'})).toBeVisible()
  expect(prepared).toEqual([{projectId:'kitchen-1',intent:'publish',expectedVersion:records.homehq_items_v1.version}])
  expect(calendarWrites).toEqual([])
})


test('Family Calendar uses one month scope when navigating and switching views',async({page},testInfo)=>{
  const [year,month]=dateKey().split('-').map(Number)
  const monthKey=offset=>{const d=new Date(year,month-1+offset,1);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`}
  await page.route('**/.netlify/functions/icloud-calendar*',route=>route.fulfill({json:{connected:true,syncedAt:new Date().toISOString(),events:[-1,0,1].map(offset=>({id:`scope-${offset}`,uid:`scope-${offset}`,title:`Scope event ${offset}`,date:`${monthKey(offset)}-15`,owner:'Family',source:'icloud'}))}}))
  await openMenuIfMobile(page,testInfo)
  await page.getByRole('button',{name:'Household Management',exact:true}).click()
  await openMenuIfMobile(page,testInfo)
  await page.getByRole('button',{name:'Family Calendar',exact:true}).click()
  await closeMenuIfMobile(page,testInfo)
  await page.getByRole('button',{name:'Month',exact:true}).click()
  const picker=page.getByLabel('Calendar month',{exact:true}),grid=page.locator('.family-calendar-scroll')
  await expect(page.getByLabel('Select calendar timeframe')).toHaveCount(0)
  await expect(picker).toHaveValue(monthKey(0))
  await expect(grid).toContainText('Scope event 0')
  await page.getByRole('button',{name:'Previous month',exact:true}).click()
  await expect(picker).toHaveValue(monthKey(-1))
  await expect(grid).toContainText('Scope event -1')
  await expect(grid).not.toContainText('Scope event 0')
  await page.getByRole('button',{name:'Next month',exact:true}).click()
  await page.getByRole('button',{name:'Next month',exact:true}).click()
  await expect(picker).toHaveValue(monthKey(1))
  await expect(grid).toContainText('Scope event 1')
  await page.getByRole('button',{name:'This month',exact:true}).click()
  await expect(picker).toHaveValue(monthKey(0))
  await page.getByRole('button',{name:'Agenda',exact:true}).click()
  await page.getByLabel('Select calendar timeframe').selectOption('last-month')
  await expect(page.locator('.family-calendar-mobile-agenda')).toContainText('Scope event -1')
  await page.getByRole('button',{name:'Month',exact:true}).click()
  await expect(picker).toHaveValue(monthKey(-1))
  await expect(grid).toContainText('Scope event -1')
  await expect(page.locator('.family-calendar-mobile-agenda')).not.toBeVisible()
})

test('Family Calendar custom agenda and December navigation retain the correct events',async({page},testInfo)=>{
  const events=[['dec-early','Earlier December event','2026-12-05'],['dec-end','December boundary event','2026-12-31'],['jan-start','January boundary event','2027-01-02']].map(([id,title,date])=>({id,uid:id,title,date,owner:'Family',source:'icloud'}))
  await page.route('**/.netlify/functions/icloud-calendar*',route=>route.fulfill({json:{connected:true,syncedAt:new Date().toISOString(),events}}))
  await openMenuIfMobile(page,testInfo)
  await page.getByRole('button',{name:'Household Management',exact:true}).click()
  await openMenuIfMobile(page,testInfo)
  await page.getByRole('button',{name:'Family Calendar',exact:true}).click()
  await closeMenuIfMobile(page,testInfo)
  await page.getByRole('button',{name:'Agenda',exact:true}).click()
  await page.getByLabel('Select calendar timeframe').selectOption('custom')
  await page.getByLabel('From date',{exact:true}).fill('2026-12-31')
  await page.getByLabel('To date',{exact:true}).fill('2027-01-02')
  const agenda=page.locator('.family-calendar-mobile-agenda')
  await expect(agenda).toContainText('December boundary event')
  await expect(agenda).toContainText('January boundary event')
  await expect(agenda).not.toContainText('Earlier December event')
  await page.getByRole('button',{name:'Month',exact:true}).click()
  await expect(page.getByLabel('Calendar month',{exact:true})).toHaveValue('2026-12')
  const grid=page.locator('.family-calendar-scroll')
  await expect(grid).toContainText('Earlier December event')
  await expect(grid).toContainText('December boundary event')
  await page.getByRole('button',{name:'Next month',exact:true}).click()
  await expect(page.getByLabel('Calendar month',{exact:true})).toHaveValue('2027-01')
  await expect(grid).toContainText('January boundary event')
  await expect(grid).not.toContainText('December boundary event')
  await page.getByLabel('Calendar month',{exact:true}).fill('2026-12')
  await expect(grid).toContainText('December boundary event')
})

test('meal editor scales servings and prepares an exact recipe review without applying it',async({page})=>{
  const prepared=[],executed=[]
  await page.route('**/.netlify/functions/meal-plans?*',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({...mealPlanResponse(),libraryVersion:7})}))
  page.on('request',request=>{if(request.url().includes('action=prepare-direct'))prepared.push(request.postDataJSON());if(request.url().includes('action=execute'))executed.push(request)})
  await page.getByRole('button',{name:'Open Meal Plan',exact:true}).click()
  await page.getByRole('button',{name:'Meal Library',exact:true}).click()
  await page.getByRole('button',{name:'View Eggs and Toast details',exact:true}).first().click()
  await page.getByRole('button',{name:'Edit meal',exact:true}).click()
  const editor=page.getByRole('dialog',{name:'Edit meal',exact:true})
  await editor.getByLabel('Meal title').fill('Larger breakfast')
  await expect(editor.getByLabel('Meal label',{exact:true}).locator('option')).toHaveText(['Breakfast','Lunch','Dinner','Snack','Ingredient'])
  await editor.getByLabel('Meal label',{exact:true}).selectOption('snack1')
  await editor.screenshot({path:`test-results/meal-editor-${test.info().project.name}.png`})
  await editor.getByLabel('Serving multiplier').fill('1.5')
  await editor.getByRole('button',{name:'Resize serving and macros'}).click()
  await expect(editor.getByLabel('Protein (g)',{exact:true})).toHaveValue('33')
  await editor.getByRole('button',{name:'Review meal changes'}).click()
  await expect.poll(()=>prepared.length).toBe(1)
  expect(prepared[0].expectedVersion).toBe(7)
  expect(prepared[0].operation.targetId).toBe('breakfast-eggs')
  expect(JSON.parse(prepared[0].operation.payload.recipeJson).mealType).toBe('snack1')
  expect(JSON.parse(prepared[0].operation.payload.recipeJson).macros.calories).toBe(525)
  expect(executed).toHaveLength(0)
})

test('meal ingredient edits require fresh nutrition or explicit manual verification',async({page})=>{
  await page.getByRole('button',{name:'Open Meal Plan',exact:true}).click()
  await page.getByRole('button',{name:'Meal Library',exact:true}).click()
  await page.getByRole('button',{name:'View Eggs and Toast details',exact:true}).first().click()
  await page.getByRole('button',{name:'Edit meal',exact:true}).click()
  const editor=page.getByRole('dialog',{name:'Edit meal',exact:true})
  await editor.getByLabel('Ingredients (one per line)').fill('2 eggs')
  await expect(editor.getByRole('button',{name:'Review meal changes'})).toBeDisabled()
  await editor.getByRole('button',{name:'Recalculate from ingredients'}).click()
  await expect(editor.getByLabel('Calories',{exact:true})).toHaveValue('167.5')
  await expect(editor.getByLabel('Serving size',{exact:true})).toHaveValue('1 pancake')
  await expect(editor.getByRole('button',{name:'Review meal changes'})).toBeEnabled()
  await editor.getByLabel('Protein (g)',{exact:true}).fill('10')
  await expect(editor.getByRole('button',{name:'Review meal changes'})).toBeDisabled()
  await editor.getByRole('checkbox').check()
  await expect(editor.getByRole('button',{name:'Review meal changes'})).toBeEnabled()
})

test('missing meal photos generate automatically and replace placeholders without a click',async({page})=>{
  await page.goto('about:blank')
  const jobs=[],meals=mealPlanResponse().library
  await page.route('**/.netlify/functions/meal-image-generate-background',async route=>{
    jobs.push(route.request().postDataJSON());await route.fulfill({status:202,contentType:'application/json',body:JSON.stringify({accepted:true})})
  })
  await page.route('**/.netlify/functions/meal-image-job-status?*',async route=>{
    const id=new URL(route.request().url()).searchParams.get('jobId').replace(/^auto-/,'')
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({state:'ready',meal:{...meals.find(meal=>meal.id===id),image:'/meal-images/breakfast-01.webp'}})})
  })
  await page.goto('/')
  await page.getByRole('button',{name:'Open Meal Plan',exact:true}).click()
  await expect.poll(()=>jobs.length).toBeGreaterThan(0)
  expect(jobs[0].onlyIfMissing).toBe(true)
  expect(jobs[0].jobId).toBe(`auto-${jobs[0].mealId}`)
  await expect(page.getByRole('img',{name:'Eggs and Toast',exact:true}).first()).toHaveAttribute('src','/meal-images/breakfast-01.webp')
  expect(jobs.filter(job=>job.mealId==='breakfast-eggs')).toHaveLength(1)
})

test('Finance reconciliation recommends matches and opens approval without mutating records',async({page},testInfo)=>{
  const records=cashForecastRecords(),finance=JSON.parse(records.lslj_finance_v9.value)
  const future=new Date(`${dateKey()}T12:00:00Z`);future.setUTCDate(future.getUTCDate()+2)
  const projected=future.toISOString().slice(0,10)
  finance.transactions=[{id:'sawnee-plan',name:'Sawnee EMC - Electric',type:'expense',amount:1204,acct:'a1',freq:'once',start:projected,end:projected}]
  records.lslj_finance_v9.value=JSON.stringify(finance)
  records.plaid_actuals_cache.value=JSON.stringify([{id:'sawnee-posted',accountId:'plaid-operating',name:'SAWNEE EMC BANK DRAFT',category:'UTILITIES',amount:1210,date:dateKey(),pending:false}])
  let writes=0,prepared=null
  await page.route('**/.netlify/functions/household-state*',async route=>{
    if(route.request().method()!=='GET')writes++
    await route.fulfill({json:{records,serverTime:new Date().toISOString()}})
  })
  page.on('request',request=>{
    const url=new URL(request.url())
    if(url.pathname.endsWith('/brevity-assistant-actions')&&url.searchParams.get('action')==='prepare-direct')prepared=request.postDataJSON()
    if(url.pathname.endsWith('/brevity-assistant-actions')&&url.searchParams.get('action')==='execute')writes++
  })
  await page.reload();await expect(page.locator('.app-shell')).toBeVisible()
  await openMenuIfMobile(page,testInfo);await page.getByRole('button',{name:'Finance',exact:true}).click();await openMenuIfMobile(page,testInfo);await page.getByRole('button',{name:'Dashboard',exact:true}).click();await closeMenuIfMobile(page,testInfo)
  const report=page.getByRole('region',{name:'Automatic reconciliation recommendations'})
  await expect(report).toContainText('1 suggested matches')
  await expect(report).toContainText('Difference: $6.00')
  await expect(report).toContainText('Nothing changes until you approve')
  expect(writes).toBe(0)
  const choice=report.locator('.reconciliation-choice').first()
  const checkbox=await choice.getByRole('checkbox').boundingBox(),text=await choice.locator('span').first().boundingBox()
  expect(checkbox.width).toBeLessThanOrEqual(24)
  expect(text.width).toBeGreaterThan(180)
  // A bank balance update on another device changes the version, not the
  // selected match. Preparation must fetch it without applying any change.
  records.lslj_finance_v9={...records.lslj_finance_v9,version:7,updatedAt:new Date().toISOString()}
  await report.getByRole('button',{name:'Review 1 recommended matches'}).click()
  const review=page.getByRole('dialog',{name:'Review proposed Brevity changes'})
  await expect(review).toContainText('Sawnee')
  await expect(review).toContainText('Future payments stay unchanged')
  await expect(review).toContainText('$1,204.00'.replace(',',''))
  expect(prepared.expectedVersion).toBe(7)
  expect(prepared.operations).toHaveLength(1)
  expect(prepared.operations[0].payload.reconciliation.actualId).toBe('sawnee-posted')
  expect(prepared.operations[0].targetDate).toBe(projected)
  expect(prepared.operations[0].payload.date).toBe(dateKey())
  expect(writes).toBe(0)
})

test('Finance combines Operating and Savings while excluding Renovation across views',async({page},testInfo)=>{
  const records=cashForecastRecords(),finance=JSON.parse(records.lslj_finance_v9.value)
  finance.accounts.push(
    {id:'savings',name:'Savings Account',type:'savings',balance:2000,plaidAccountId:'bank-savings',plaidType:'depository',plaidSubtype:'savings'},
    {id:'renovation',name:'Renovation Account',type:'checking',balance:3000,plaidAccountId:'bank-renovation',plaidType:'depository',plaidSubtype:'checking'})
  finance.transactions=finance.accounts.map((account,index)=>({id:`planned-${account.id}`,name:`${account.name} expense`,type:'expense',amount:(index+1)*10,acct:account.id,freq:'once',start:dateKey(),end:dateKey()}))
  records.lslj_finance_v9.value=JSON.stringify(finance)
  records.plaid_actuals_cache.value='[]'
  await page.route('**/.netlify/functions/household-state*',route=>route.fulfill({json:{records,serverTime:new Date().toISOString()}}))
  await page.reload();await expect(page.locator('.app-shell')).toBeVisible()
  await openMenuIfMobile(page,testInfo);await page.getByRole('button',{name:'Finance',exact:true}).click();await openMenuIfMobile(page,testInfo);await page.getByRole('button',{name:'Dashboard',exact:true}).click();await closeMenuIfMobile(page,testInfo)
  const filters=page.getByRole('navigation',{name:'Finance account filters'})
  await filters.getByRole('button',{name:'Savings Account',exact:true}).click()
  await expect(filters.getByRole('button',{name:'Operating Account',exact:true})).toHaveAttribute('aria-pressed','true')
  await expect(filters.getByRole('button',{name:'Savings Account',exact:true})).toHaveAttribute('aria-pressed','true')
  await expect(filters.getByRole('button',{name:'Renovation Account',exact:true})).toHaveAttribute('aria-pressed','false')
  for(const view of ['Transactions','Cash Forecast','Reporting']){
    await openMenuIfMobile(page,testInfo);await page.getByRole('button',{name:view,exact:true}).click();await closeMenuIfMobile(page,testInfo)
    await expect(filters.getByRole('button',{name:'Operating Account',exact:true})).toHaveAttribute('aria-pressed','true')
    await expect(filters.getByRole('button',{name:'Savings Account',exact:true})).toHaveAttribute('aria-pressed','true')
    await expect(filters.getByRole('button',{name:'Renovation Account',exact:true})).toHaveAttribute('aria-pressed','false')
    if(view==='Transactions'){
      await expect(page.getByText('Operating Account expense',{exact:true})).toBeVisible()
      await expect(page.getByText('Savings Account expense',{exact:true})).toBeVisible()
      await expect(page.getByText('Renovation Account expense',{exact:true})).toHaveCount(0)
    }
  }
  await filters.getByRole('button',{name:'All',exact:true}).click()
  await expect(filters.getByRole('button',{name:'All',exact:true})).toHaveAttribute('aria-pressed','true')
  await filters.getByRole('button',{name:'Renovation Account',exact:true}).click()
  await expect(filters.getByRole('button',{name:'Operating Account',exact:true})).toHaveAttribute('aria-pressed','true')
  await expect(filters.getByRole('button',{name:'Savings Account',exact:true})).toHaveAttribute('aria-pressed','true')
  await expect(filters.getByRole('button',{name:'Renovation Account',exact:true})).toHaveAttribute('aria-pressed','false')
})

test('Calendar income editor reviews payer changes without applying them',async({page},testInfo)=>{
  const records=cashForecastRecords(),finance=JSON.parse(records.lslj_finance_v9.value),prepared=[]
  finance.transactions=[{id:'payroll',name:'Genesco payroll fixture',type:'income',amount:721.9,acct:'a1',freq:'weekly',start:dateKey(),end:'',cat:'Income'}]
  records.lslj_finance_v9.value=JSON.stringify(finance);records.plaid_actuals_cache.value='[]'
  let writes=0
  await page.route('**/.netlify/functions/household-state*',route=>{if(route.request().method()!=='GET')writes++;return route.fulfill({json:{records,serverTime:new Date().toISOString()}})})
  await page.route('**/.netlify/functions/finance-vendors**',route=>route.fulfill({json:{version:1,isAdmin:true,vendors:[{id:'genesco',name:'Genesco',accessMembers:[],documents:[]}],links:{}}}))
  page.on('request',request=>{if(request.url().includes('action=prepare-direct'))prepared.push(request.postDataJSON());if(request.url().includes('action=execute'))writes++})
  await page.reload();await expect(page.locator('.app-shell')).toBeVisible()
  await openMenuIfMobile(page,testInfo);await page.getByRole('button',{name:'Finance',exact:true}).click();await page.getByRole('button',{name:'Cash Forecast',exact:true}).click();await closeMenuIfMobile(page,testInfo)
  const agenda=page.locator('.finance-calendar-mobile-agenda')
  if(await agenda.isVisible()){
    const todayRow=agenda.locator(':scope > button').filter({hasText:'Today ·'})
    if(await todayRow.getAttribute('aria-expanded')!=='true')await todayRow.click()
  }else{
    const todayCell=page.locator('.cal-cell.is-today')
    if(!(await todayCell.getAttribute('class')||'').includes('is-selected'))await todayCell.locator('.finance-calendar-day-number').click()
  }
  await page.locator('.finance-card').filter({has:page.locator('.finance-calendar-day-header')}).getByText('Genesco payroll fixture',{exact:true}).click()
  const editor=page.locator('.finance-calendar-editor-dialog')
  await expect(editor.getByLabel('Income payer')).toBeVisible()
  await editor.getByRole('combobox',{name:'Income payer',exact:true}).fill('Gene')
  await expect(editor.getByRole('option',{name:'Genesco',exact:true})).toBeVisible()
  await editor.getByRole('option',{name:'Genesco',exact:true}).click()
  await expect(editor.getByRole('button',{name:'Review move and reconcile'})).toBeDisabled()
  await expect(editor).toContainText('Choose a different bank posting date')
  const datesFit=await editor.locator('input[type="date"]').evaluateAll(inputs=>inputs.every(input=>input.getBoundingClientRect().right<=input.parentElement.getBoundingClientRect().right+1))
  expect(datesFit).toBe(true)
  await editor.getByRole('button',{name:'Review scheduled change'}).click()
  await page.getByRole('button',{name:/This item only/}).click()
  await expect.poll(()=>prepared.length).toBe(1)
  expect(prepared[0].operation.payload.vendorId).toBe('genesco')
  expect(prepared[0].operation.targetId).toBe('payroll')
  expect(writes).toBe(0)
})

test('Apple calendar sources require explicit member selection and prepare review without applying',async({page},testInfo)=>{
  await page.route('**/.netlify/functions/brevity-assistant-actions?action=history',route=>route.fulfill({json:{member:'Larry',role:'admin',permissions:{Larry:{planning:true,calendar:true}},history:[]}}))
  const familyId=`apple-${'a'.repeat(64)}`,personalId=`apple-${'b'.repeat(64)}`,churchId=`apple-${'c'.repeat(64)}`
  const prepared=[],executed=[]
  await page.route('**/.netlify/functions/icloud-calendar*',route=>route.fulfill({json:route.request().url().includes('action=sources')?{version:5,selected:[],calendars:[{id:familyId,name:'Family',primary:true},{id:personalId,name:'Personal appointments',primary:false},{id:churchId,name:'Ministry',primary:false}]}:{events:[],calendar:'Family'}}))
  page.on('request',request=>{if(request.url().includes('action=prepare-direct'))prepared.push(request.postDataJSON());if(request.url().includes('action=execute'))executed.push(request)})
  await openMenuIfMobile(page,testInfo)
  await page.getByRole('button',{name:'Household Management',exact:true}).click()
  await openMenuIfMobile(page,testInfo)
  await page.getByRole('button',{name:'Family Calendar',exact:true}).click()
  await closeMenuIfMobile(page,testInfo)
  await page.getByRole('button',{name:'Calendar sources',exact:true}).click()
  const dialog=page.getByRole('dialog',{name:'Apple calendar sources',exact:true})
  await expect(dialog).toContainText('visible to the whole household')
  await expect(dialog.getByLabel('Assign Personal appointments (bbbbbbbb)')).toHaveValue('')
  await dialog.getByLabel('Assign Personal appointments (bbbbbbbb)').selectOption('Larry')
  await dialog.getByLabel('Assign Ministry (cccccccc)').selectOption('Church Triumphant')
  await dialog.getByRole('button',{name:'Review connections'}).click()
  await expect.poll(()=>prepared.length).toBe(1)
  expect(prepared[0].expectedVersion).toBe(5)
  expect(prepared[0].operation.type).toBe('apple.sources.update')
  expect(prepared[0].operation.payload.sources).toEqual([{id:personalId,name:'Personal appointments',owner:'Larry'},{id:churchId,name:'Ministry',owner:'Church Triumphant'}])
  expect(executed).toHaveLength(0)
})

test('Finance reconciliation refresh rejects changed match evidence before preparing approval',async({page},testInfo)=>{
  const records=cashForecastRecords(),finance=JSON.parse(records.lslj_finance_v9.value)
  finance.transactions=[{id:'utility-plan',name:'Sawnee EMC - Electric',type:'expense',amount:1204,acct:'a1',freq:'once',start:dateKey(),end:dateKey()}]
  const actual={id:'utility-posted',accountId:'plaid-operating',name:'SAWNEE EMC BANK DRAFT',category:'UTILITIES',amount:1210,date:dateKey(),pending:false}
  records.lslj_finance_v9.value=JSON.stringify(finance)
  records.plaid_actuals_cache.value=JSON.stringify([actual])
  const prepared=[]
  await page.route('**/.netlify/functions/household-state*',route=>route.fulfill({json:{records,serverTime:new Date().toISOString()}}))
  page.on('request',request=>{if(request.url().includes('action=prepare-direct'))prepared.push(request.postDataJSON())})
  await page.reload();await expect(page.locator('.app-shell')).toBeVisible()
  await openMenuIfMobile(page,testInfo);await page.getByRole('button',{name:'Finance',exact:true}).click();await openMenuIfMobile(page,testInfo);await page.getByRole('button',{name:'Dashboard',exact:true}).click();await closeMenuIfMobile(page,testInfo)
  const report=page.getByRole('region',{name:'Automatic reconciliation recommendations'})
  await expect(report).toContainText('Difference: $6.00')
  records.plaid_actuals_cache={...records.plaid_actuals_cache,value:JSON.stringify([{...actual,amount:1211}]),version:8,updatedAt:new Date().toISOString()}
  await report.getByRole('button',{name:'Review 1 recommended matches'}).click()
  await expect(report.getByRole('status')).toContainText('report changed')
  await expect(report).toContainText('Difference: $7.00')
  expect(prepared).toHaveLength(0)
  await expect(page.getByRole('dialog',{name:'Review proposed Brevity changes'})).toHaveCount(0)
})

test('Empty payer picker reviews creation and keeps the transaction draft',async({page},testInfo)=>{
  const records=cashForecastRecords(),finance=JSON.parse(records.lslj_finance_v9.value),prepared=[]
  finance.transactions=[{id:'payroll',name:'Genesco payroll fixture',type:'income',amount:721.9,acct:'a1',freq:'weekly',start:dateKey(),end:'',cat:'Income'}]
  records.lslj_finance_v9.value=JSON.stringify(finance);records.plaid_actuals_cache.value='[]'
  let writes=0, payerOptions=[]
  await page.route('**/.netlify/functions/household-state*',route=>{if(route.request().method()!=='GET')writes++;return route.fulfill({json:{records,serverTime:new Date().toISOString()}})})
  await page.route('**/.netlify/functions/finance-vendors**',route=>route.fulfill({json:{version:1,isAdmin:true,vendors:payerOptions,links:{}}}))
  page.on('request',request=>{if(request.url().includes('action=prepare-direct'))prepared.push(request.postDataJSON());if(request.url().includes('action=execute'))writes++})
  await page.reload();await expect(page.locator('.app-shell')).toBeVisible()
  await openMenuIfMobile(page,testInfo);await page.getByRole('button',{name:'Finance',exact:true}).click();await page.getByRole('button',{name:'Cash Forecast',exact:true}).click();await closeMenuIfMobile(page,testInfo)
  const agenda=page.locator('.finance-calendar-mobile-agenda')
  if(await agenda.isVisible()){
    const todayRow=agenda.locator(':scope > button').filter({hasText:'Today ·'})
    if(await todayRow.getAttribute('aria-expanded')!=='true')await todayRow.click()
  }else{
    const todayCell=page.locator('.cal-cell.is-today')
    if(!(await todayCell.getAttribute('class')||'').includes('is-selected'))await todayCell.locator('.finance-calendar-day-number').click()
  }
  await page.locator('.finance-card').filter({has:page.locator('.finance-calendar-day-header')}).getByText('Genesco payroll fixture',{exact:true}).click()
  const editor=page.locator('.finance-calendar-editor-dialog')
  await expect(editor.getByLabel('Income payer')).toBeVisible()
  await editor.getByRole('combobox',{name:'Income payer',exact:true}).fill('New payer')
  await expect(editor.getByRole('status')).toContainText('No matching saved')
  await expect(editor.getByRole('listbox',{name:'Income payer matches'}).getByRole('option')).toHaveCount(0)
  expect(prepared).toHaveLength(0)
  await editor.getByRole('button',{name:'Create new: New payer',exact:true}).scrollIntoViewIfNeeded()
  await page.screenshot({path:`test-results/payer-search-${testInfo.project.name}.png`})
  await editor.getByRole('button',{name:'Create new: New payer',exact:true}).click()
  await expect(page.locator('.brevity-action-review')).toContainText('Create payer New payer')
  await expect.poll(()=>prepared.length).toBe(1)
  expect(prepared[0].operation).toMatchObject({type:'vendor.create',payload:{name:'New payer',accessMembers:[]}})
  expect(writes).toBe(0)
  await page.locator('.brevity-action-review').getByRole('button',{name:'Cancel',exact:true}).click()
  await page.getByRole('dialog',{name:'Brevity Assistant',exact:true}).getByRole('button',{name:'Close Brevity Assistant',exact:true}).click()
  await expect(editor.getByPlaceholder('e.g. Mortgage, Paycheck, Car insurance')).toHaveValue('Genesco payroll fixture')
  payerOptions=[{id:'genesco',name:'Genesco',accessMembers:[],documents:[]}]
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('brevity-action-completed')))
  await editor.getByRole('combobox',{name:'Income payer',exact:true}).fill('Gene')
  await expect(editor.getByRole('option',{name:'Genesco',exact:true})).toBeVisible()
  await editor.getByRole('combobox',{name:'Income payer',exact:true}).press('ArrowDown')
  await editor.getByRole('combobox',{name:'Income payer',exact:true}).press('Enter')
  await expect(editor.getByRole('combobox',{name:'Income payer',exact:true})).toHaveValue('Genesco')
  await expect(editor.getByRole('button',{name:'Review move and reconcile'})).toBeDisabled()
  await expect(editor).toContainText('Choose a different bank posting date')
  const datesFit=await editor.locator('input[type="date"]').evaluateAll(inputs=>inputs.every(input=>input.getBoundingClientRect().right<=input.parentElement.getBoundingClientRect().right+1))
  expect(datesFit).toBe(true)
  await editor.getByRole('button',{name:'Review scheduled change'}).click()
  await page.getByRole('button',{name:/This item only/}).click()
  await expect.poll(()=>prepared.length).toBe(2)
  expect(prepared[1].operation.payload.vendorId).toBe('genesco')
  expect(prepared[1].operation.targetId).toBe('payroll')
  expect(writes).toBe(0)
})


test('Budget includes every scheduled occurrence and posted cash entry for its own month',async({page},testInfo)=>{
  const records=cashForecastRecords(),finance=JSON.parse(records.lslj_finance_v9.value)
  finance.accounts.push({id:'other',name:'Other account',type:'checking',balance:100,plaidAccountId:'other-bank',plaidType:'depository',plaidSubtype:'checking'})
  const month=dateKey().slice(0,7),date=month+'-01',next=new Date(Number(month.slice(0,4)),Number(month.slice(5,7)),1)
  const nextDate=`${next.getFullYear()}-${String(next.getMonth()+1).padStart(2,'0')}-01`
  finance.transactions=[
    {id:'monthly-income',acct:'a1',name:'Regular payroll fixture',type:'income',freq:'monthly',start:date,amount:1000},
    {id:'once-income',acct:'a1',name:'One-time bonus fixture',type:'income',freq:'once',start:date,amount:500},
    {id:'monthly-expense',acct:'a1',name:'Recurring rent fixture',cat:'Housing',type:'expense',freq:'monthly',start:date,amount:200},
    {id:'once-expense',acct:'a1',name:'One-time repair fixture',cat:'Housing',type:'expense',freq:'once',start:date,amount:100},
    {id:'moved',acct:'a1',name:'Moved occurrence fixture',cat:'Food',type:'expense',freq:'once',start:date,amount:40},
    {id:'next-month',acct:'a1',name:'Next month bonus fixture',type:'income',freq:'once',start:nextDate,amount:666},
  ]
  records.lslj_finance_v9.value=JSON.stringify(finance)
  records.lslj_budget_v1={key:'lslj_budget_v1',version:1,updatedAt:new Date().toISOString(),value:JSON.stringify({schemaVersion:2,targets:{a1:{[month.slice(0,4)]:{'a1:monthly-expense':Array(12).fill(0)}}}})}
  const actuals=[
    {id:'expense',name:'Posted grocery fixture',category:'FOOD_AND_DRINK',amount:25},
    {id:'payroll',name:'Posted payroll fixture',category:'INCOME',amount:-100},
    {id:'deposit',name:'Uncategorized deposit fixture',category:'OTHER',amount:-50},
    {id:'refund',name:'Purchase refund fixture',category:'GENERAL_MERCHANDISE',amount:-10},
    {id:'pending',name:'Pending fixture',category:'INCOME',amount:-5000,pending:true},
    {id:'transfer',name:'Transfer fixture',category:'TRANSFER_IN',amount:-700},
    {id:'next',name:'Next month bank fixture',category:'INCOME',amount:-555,date:nextDate},
    {id:'other-account',name:'Other account fixture',category:'INCOME',amount:-99,accountId:'other-bank'},
  ].map(tx=>({date,accountId:'plaid-operating',pending:false,...tx}))
  records.plaid_actuals_cache.value=JSON.stringify(actuals)
  await page.route('**/.netlify/functions/household-state*',route=>route.fulfill({json:{records,serverTime:new Date().toISOString()}}))
  await page.route('**/.netlify/functions/plaid-transactions*',route=>route.fulfill({json:{connected:true,transactions:actuals,errors:[],syncedAt:new Date().toISOString()}}))
  await page.reload();await expect(page.locator('.app-shell')).toBeVisible()
  await openMenuIfMobile(page,testInfo);await page.getByRole('button',{name:'Finance',exact:true}).click();await page.getByRole('button',{name:'Budget',exact:true}).click();await closeMenuIfMobile(page,testInfo)
  await expect(page.getByRole('combobox',{name:'Select financial timeframe'})).toHaveCount(0)
  await expect(page.getByRole('button',{name:'Income Budgeted $1,500.00',exact:true})).toBeVisible()
  await expect(page.getByRole('button',{name:'Expenses Budgeted $340.00',exact:true})).toBeVisible()
  await expect(page.getByRole('button',{name:'Income Actual $160.00',exact:true})).toBeVisible()
  await expect(page.getByRole('button',{name:'Expenses Actual $25.00',exact:true})).toBeVisible()
  const accountFilters=page.getByRole('navigation',{name:'Finance account filters'})
  await accountFilters.getByRole('button',{name:'All',exact:true}).click()
  await expect(page.getByRole('button',{name:'Income Actual $259.00',exact:true})).toBeVisible()
  await accountFilters.getByRole('button',{name:'Other account',exact:true}).click()
  await expect(page.getByRole('button',{name:'Income Actual $160.00',exact:true})).toBeVisible()
  await expect(page.locator('.finance-budget-line').filter({hasText:'One-time repair fixture'})).toContainText('$100.00')
  await page.getByRole('button',{name:'Expenses Budgeted $340.00',exact:true}).click()
  await expect(page.getByText('One-time repair fixture',{exact:true})).toBeVisible()
  await expect(page.getByText('Moved occurrence fixture',{exact:true})).toBeVisible()
  await openMenuIfMobile(page,testInfo);await page.getByRole('button',{name:'Budget',exact:true}).click();await closeMenuIfMobile(page,testInfo)
  await page.getByRole('button',{name:'Income Actual $160.00',exact:true}).click()
  for(const name of ['Posted payroll fixture','Uncategorized deposit fixture','Purchase refund fixture'])await expect(page.getByText(name,{exact:true})).toBeVisible()
  await expect(page.getByText('Pending fixture',{exact:true})).toHaveCount(0)
  await openMenuIfMobile(page,testInfo);await page.getByRole('button',{name:'Budget',exact:true}).click();await closeMenuIfMobile(page,testInfo)
  await page.getByRole('button',{name:'Next budget month'}).click()
  await expect(page.getByRole('button',{name:'Income Budgeted $1,666.00',exact:true})).toBeVisible()
  await expect(page.getByRole('button',{name:'Income Actual $555.00',exact:true})).toBeVisible()
  await page.screenshot({path:`test-results/budget-monthly-${testInfo.project.name}.png`})
})

test('spiritual fallback presents the devotion once with one response and source evidence',async({page},testInfo)=>{
  await mockBackend(page)
  const {buildDeterministicPillarFallback}=await import('../src/household/pillarAnalysisGuardrails.js')
  await page.route('**/.netlify/functions/pillar-analysis',async route=>{
    const input=route.request().postDataJSON()
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({pillar:input.pillar,date:input.date,member:input.currentMember,contextSignature:input.contextSignature,generatedAt:new Date().toISOString(),quality:{status:'evidence-fallback'},analysis:buildDeterministicPillarFallback({pillar:input.pillar,date:input.date,pillarData:input.plan.spiritual,localContext:input.localContext})})})
  })
  await page.goto('/')
  await openMenuIfMobile(page,testInfo)
  await page.getByRole('button',{name:'Spiritual Maturity',exact:true}).click()
  await closeMenuIfMobile(page,testInfo)
  await expect(page.locator('.pillar-analysis-command').getByRole('heading',{name:'Weekly Word',exact:true})).toBeVisible()
  await expect(page.locator('.pillar-analysis-command').getByText('Shared household devotion',{exact:true})).toHaveCount(1)
  await expect(page.getByRole('heading',{name:'What Matters Today',exact:true})).toHaveCount(0)
  await expect(page.getByRole('heading',{name:'The Scriptural anchor',exact:true})).toHaveCount(0)
  await expect(page.getByRole('heading',{name:'What This Is Based On',exact:true})).toBeVisible()
  await expect(page.locator('.pillar-action-grid article')).toHaveCount(1)
  await expect(page.locator('.pillar-action-grid')).toContainText('Practice the teaching.')
})


test('Packaged food barcode fills a reviewed reusable snack and preserves fractional macros',async({page})=>{
 await page.route('**/.netlify/functions/packaged-food-lookup',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({product:{name:'Test banana drink',serving:'1 bottle (325 mL)',macros:{calories:160,proteinGrams:30,carbohydrateGrams:4.5,fatGrams:3},warnings:['Check your label.']}})}))
 await page.getByRole('button',{name:'Open Meal Plan',exact:true}).click()
 await page.getByRole('button',{name:/Meal Library$/}).click()
 await page.locator('.meal-library-add').filter({hasText:'Add Breakfast'}).click()
 const dialog=page.getByRole('dialog',{name:'Add a meal'})
 await dialog.getByRole('button',{name:'Packaged food / nutrition label',exact:true}).click()
 await dialog.getByRole('combobox',{name:'Meal type',exact:true}).selectOption('snack1')
 await dialog.getByLabel('Product barcode',{exact:true}).fill('012345678905')
 await dialog.getByRole('button',{name:'Look up barcode',exact:true}).click()
 await expect(dialog.getByLabel('Product name and flavor')).toHaveValue('Test banana drink')
 await expect(dialog.getByLabel('Carbs (g)',{exact:true})).toHaveValue('4.5')
 const request=page.waitForRequest(request=>request.url().includes('/meal-plans')&&request.method()==='POST')
 await dialog.getByRole('button',{name:'Add packaged food to Meal Library',exact:true}).click()
 const payload=(await request).postDataJSON()
 expect(payload.mealType).toBe('snack1')
 expect(payload.macros.carbohydrateGrams).toBe(4.5)
 expect(payload.date).toBeUndefined()
 await expect(page.getByText(/Test banana drink was added/)).toBeVisible()
})

test('Packaged food photo leaves unreadable macros blank and requires correction',async({page})=>{
 let photoMode=false
 await page.route('**/.netlify/functions/meal-image-import',route=>{
  photoMode=route.request().postDataJSON().packagedFood
  return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({meals:[{name:'Test label drink',serving:'1 bottle',macros:{calories:160,proteinGrams:30,carbohydrateGrams:4.5,fatGrams:null},warnings:['Fat is unreadable.']}],warnings:[]})})
 })
 await page.getByRole('button',{name:'Open Meal Plan',exact:true}).click()
 await page.getByRole('button',{name:/Meal Library$/}).click()
 await page.locator('.meal-library-add').filter({hasText:'Add Breakfast'}).click()
 const dialog=page.getByRole('dialog',{name:'Add a meal'})
 await dialog.getByRole('button',{name:'Packaged food / nutrition label',exact:true}).click()
 await dialog.getByLabel('Photograph or upload package label').setInputFiles({name:'label.png',mimeType:'image/png',buffer:await page.screenshot()})
 await expect(dialog.getByLabel('Product name and flavor')).toHaveValue('Test label drink')
 expect(photoMode).toBe(true)
 await expect(dialog.getByLabel('Fat (g)',{exact:true})).toHaveValue('')
 await expect(dialog.getByText('Fat is unreadable.',{exact:true})).toBeVisible()
 await dialog.getByRole('button',{name:'Add packaged food to Meal Library',exact:true}).click()
 await expect(dialog).toBeVisible()
 await dialog.getByLabel('Fat (g)',{exact:true}).fill('3')
 await dialog.getByRole('button',{name:'Add packaged food to Meal Library',exact:true}).click()
 await expect(page.getByText(/Test label drink was added/)).toBeVisible()
})

test('meal library labels group both snacks and allow ingredients to be edited',async({page})=>{
 const response=mealPlanResponse()
 const base=response.library[0]
 response.library=[...response.library,{...base,id:'snack-a',name:'First shake',mealType:'snack1'},{...base,id:'snack-b',name:'Second shake',mealType:'snack2'},{...base,id:'ingredient-oats',name:'Rolled oats',mealType:'ingredient'}]
 response.libraryVersion=7
 await page.route('**/.netlify/functions/meal-plans?*',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(response)}))
 await page.getByRole('button',{name:'Open Meal Plan',exact:true}).click()
 await page.getByRole('button',{name:'Meal Library',exact:true}).click()
 const filters=page.getByRole('group',{name:'Filter meals by type',exact:true})
 await filters.getByRole('button',{name:/^Snack/}).click()
 await expect(page.getByRole('button',{name:'View First shake details',exact:true})).toContainText('Meal: Snack')
 await expect(page.getByRole('button',{name:'View Second shake details',exact:true})).toContainText('Meal: Snack')
 await filters.getByRole('button',{name:/^Ingredient/}).click()
 await page.getByRole('button',{name:'View Rolled oats details',exact:true}).click()
 await expect(page.getByRole('dialog')).toContainText('Meal: Ingredient')
 await page.getByRole('button',{name:'Edit meal',exact:true}).click()
 await expect(page.getByLabel('Meal label',{exact:true})).toHaveValue('ingredient')
})

test('meal editor scrolls to its final fields while review stays in the viewport',async({page})=>{
 await page.getByRole('button',{name:'Open Meal Plan',exact:true}).click()
 await page.getByRole('button',{name:'Meal Library',exact:true}).click()
  await page.getByRole('button',{name:'View Eggs and Toast details',exact:true}).first().click()
 await page.getByRole('button',{name:'Edit meal',exact:true}).click()
 const editor=page.getByRole('dialog',{name:'Edit meal',exact:true})
 const review=editor.getByRole('button',{name:'Review meal changes',exact:true})
 await expect(review).toBeInViewport({ratio:1})
 const scroll=editor.getByRole('region',{name:'Meal editing fields'})
 await scroll.hover()
 await page.mouse.wheel(0,3000)
 await expect(editor.getByLabel('Serving multiplier')).toBeInViewport({ratio:1})
 await expect(review).toBeInViewport({ratio:1})
 await editor.screenshot({path:`test-results/meal-editor-scroll-${test.info().project.name}.png`})
 await page.mouse.wheel(0,-3000)
 await expect(editor.getByLabel('Meal title')).toBeInViewport({ratio:1})
 await expect(review).toBeInViewport({ratio:1})
})

test('weekly groceries add only selected quantities to the shared household list',async({page})=>{
 let saved={version:0,items:[],canEdit:true},posts=[]
 await page.route('**/.netlify/functions/grocery-list',async route=>{
  if(route.request().method()==='POST'){
   const body=route.request().postDataJSON();posts.push(body)
   if(body.action==='add')saved={...saved,version:saved.version+1,added:body.items.length,skipped:0,items:[...saved.items,...body.items.map((item,index)=>({...item,id:`item-${saved.items.length+index}`,revision:1,completed:false}))]}
   else saved={...saved,version:saved.version+1,items:saved.items.map(item=>item.id===body.id?{...item,...body.patch,revision:item.revision+1}:item)}
  }
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(saved)})
 })
 await page.route('**/.netlify/functions/meal-plans?*',route=>{
  const first=new URL(route.request().url()).searchParams.get('startDate')||dateKey()
  const response=mealPlanResponse()
  response.days=Array.from({length:7},(_,index)=>{const date=new Date(`${first}T12:00:00Z`);date.setUTCDate(date.getUTCDate()+index);return {date:date.toISOString().slice(0,10),meals:{breakfast:'oats'},resolvedMeals:{breakfast:{id:'oats',name:'Oat bowls',yieldQuantity:1,ingredients:['1 cup oats','1/2 cup milk']}}}})
  return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(response)})
 })
 await page.getByRole('button',{name:'Open Meal Plan',exact:true}).click()
 await page.getByRole('button',{name:'Weekly groceries',exact:true}).click()
 await page.getByRole('button',{name:'Propose groceries',exact:true}).click()
 const proposal=page.getByRole('region',{name:'Weekly grocery proposal',exact:true})
 await expect(proposal.getByRole('button',{name:'Add to Grocery List',exact:true})).toBeDisabled()
 await proposal.getByLabel('Quantity for oats',{exact:true}).fill('2 bags')
 await proposal.getByRole('checkbox',{name:'oats',exact:true}).check()
 await page.screenshot({path:`test-results/grocery-proposal-${test.info().project.name}.png`,fullPage:true})
 await proposal.getByRole('button',{name:'Add to Grocery List',exact:true}).click()
 await expect(proposal.getByRole('status')).toContainText('1 items added')
 expect(posts[0].items).toHaveLength(1);expect(posts[0].items[0].quantity).toBe('2 bags');expect(posts[0].items[0].name).toBe('oats')
 await proposal.getByRole('button',{name:'Open Grocery List',exact:true}).click()
 await expect(page.getByRole('heading',{name:'Grocery List',exact:true})).toBeVisible()
 await expect(page.getByLabel('Quantity for oats',{exact:true})).toHaveValue('2 bags')
 await page.getByLabel('Quantity for oats',{exact:true}).fill('3 bags')
 await page.getByRole('button',{name:'Save quantity',exact:true}).click()
 await expect.poll(()=>saved.items[0].quantity).toBe('3 bags')
 await page.getByLabel('Item name',{exact:true}).fill('Paper towels')
 await page.getByLabel('Quantity',{exact:true}).fill('2 packs')
 await page.getByLabel('Category',{exact:true}).selectOption('Paper Goods')
 await page.getByRole('button',{name:'Add item',exact:true}).click()
 await expect(page.getByRole('checkbox',{name:'Purchased Paper towels',exact:true})).toBeVisible()
 await page.getByRole('checkbox',{name:'Purchased oats',exact:true}).click()
 await expect(page.getByRole('checkbox',{name:'Purchased oats',exact:true})).toHaveCount(0)
 await page.getByLabel('Show items',{exact:true}).selectOption('Purchased')
 await expect(page.getByRole('checkbox',{name:'Purchased oats',exact:true})).toBeChecked()
 await page.getByRole('checkbox',{name:'Purchased oats',exact:true}).click()
 await page.getByLabel('Show items',{exact:true}).selectOption('Needed')
 await expect(page.getByLabel('Quantity for oats',{exact:true})).toHaveValue('3 bags')
 await page.reload()
 await expect(page.locator('.app-shell')).toBeVisible()
 if(await page.getByRole('button',{name:'Menu',exact:true}).isVisible())await page.getByRole('button',{name:'Menu',exact:true}).click()
 await page.getByRole('button',{name:'Household Management',exact:true}).click()
 await page.getByRole('button',{name:'Grocery List',exact:true}).click()
 await expect(page.getByLabel('Quantity for oats',{exact:true})).toHaveValue('3 bags')
 if(await page.getByRole('button',{name:'Close navigation',exact:true}).isVisible())await page.getByRole('button',{name:'Collapse navigation',exact:true}).click()
 await page.screenshot({path:`test-results/grocery-list-${test.info().project.name}.png`,fullPage:true})
})

test('Recurring discovery reviews six months and stages editable budget and Cash Forecast proposals',async({page},testInfo)=>{
  const records=cashForecastRecords(),finance=JSON.parse(records.lslj_finance_v9.value),prepared=[]
  finance.transactions=[];records.lslj_finance_v9.value=JSON.stringify(finance)
  const now=dateKey(),year=Number(now.slice(0,4)),month=Number(now.slice(5,7))
  const actuals=Array.from({length:6},(_,i)=>{const d=new Date(Date.UTC(year,month-7+i,15));return{id:`apple-${i}`,name:'Apple',merchant_name:'Apple',accountId:'plaid-operating',category:'Subscriptions',amount:200,date:d.toISOString().slice(0,10),pending:false}})
  records.plaid_actuals_cache.value=JSON.stringify(actuals)
  records.lslj_budget_v1={key:'lslj_budget_v1',value:'{}',version:1,updatedAt:new Date().toISOString()}
  await page.route('**/.netlify/functions/household-state*',route=>route.fulfill({json:{records,serverTime:new Date().toISOString()}}))
  await page.route('**/.netlify/functions/plaid-transactions*',route=>route.fulfill({json:{connected:true,transactions:actuals,errors:[],syncedAt:new Date().toISOString()}}))
  page.on('request',request=>{if(request.url().includes('action=prepare-direct'))prepared.push(request.postDataJSON())})
  await page.reload();await expect(page.locator('.app-shell')).toBeVisible()
  await openMenuIfMobile(page,testInfo);await page.getByRole('button',{name:'Finance',exact:true}).click();await page.getByRole('button',{name:'Recurring',exact:true}).click();await closeMenuIfMobile(page,testInfo)
  const card=page.locator('article.recurring-suggestion').filter({has:page.getByRole('heading',{name:'Apple',exact:true})})
  await expect(card).toContainText('Seen in 6 of 6 completed months')
  await card.getByLabel('Monthly budget target').fill('210')
  await card.getByRole('button',{name:'Add to Budget',exact:true}).click()
  await expect(page.locator('.brevity-action-review')).toBeVisible()
  expect(prepared[0].operation).toMatchObject({type:'budget.update',payload:{value:210,lineName:'Apple',accountId:'a1',month:month-1}})
  await page.locator('.brevity-action-review').getByRole('button',{name:'Cancel',exact:true}).click()
  await page.getByRole('dialog',{name:'Brevity Assistant',exact:true}).getByRole('button',{name:'Close Brevity Assistant',exact:true}).click()
  await card.getByLabel('Payment / deposit amount').fill('205')
  const next=new Date(Date.UTC(year,month,15)).toISOString().slice(0,10)
  await card.getByLabel('Next payment / deposit date').fill(next)
  await card.getByRole('button',{name:'Add to Cash Forecast',exact:true}).click()
  await expect(page.locator('.brevity-action-review')).toBeVisible()
  expect(prepared[1].operation).toMatchObject({type:'recurring.create',payload:{amount:205,title:'Apple',accountId:'a1',date:next,frequency:'monthly'}})
  await page.locator('.brevity-action-review').getByRole('button',{name:'Cancel',exact:true}).click()
  await page.getByRole('dialog',{name:'Brevity Assistant',exact:true}).getByRole('button',{name:'Close Brevity Assistant',exact:true}).click()
  await card.getByRole('button',{name:'Not recurring / Dismiss'}).click()
  await expect(card).toHaveCount(0)
  await page.getByRole('button',{name:/Restore dismissed suggestions/}).click();await expect(card).toBeVisible()
  await page.screenshot({path:`test-results/recurring-discovery-${testInfo.project.name}.png`})
})

test('iPhone Cash Forecast separates earlier schedules from current and future money',async({page},testInfo)=>{
  test.skip(testInfo.project.name!=='iphone','Phone agenda clarity')
  const records=cashForecastRecords(),finance=JSON.parse(records.lslj_finance_v9.value),today=dateKey(),day=Number(today.slice(8))
  test.skip(day===1,'Earlier dates require a day after the first of the month')
  const earlier=today.slice(0,8)+String(day-1).padStart(2,'0')
  finance.transactions.push({id:'past-income',name:'Earlier paycheck',acct:'a1',type:'income',amount:777,freq:'once',start:earlier})
  records.lslj_finance_v9.value=JSON.stringify(finance)
  await page.route('**/.netlify/functions/household-state*',route=>route.fulfill({json:{records,serverTime:new Date().toISOString()}}))
  await page.reload();await expect(page.locator('.app-shell')).toBeVisible()
  await openMenuIfMobile(page,testInfo);await page.getByRole('button',{name:'Finance',exact:true}).click();await page.getByRole('button',{name:'Cash Forecast',exact:true}).click();await closeMenuIfMobile(page,testInfo)
  const agenda=page.locator('.finance-calendar-mobile-agenda')
  await expect(agenda).not.toContainText('Earlier paycheck')
  await expect(agenda).toContainText('Today ·')
  await expect(page.locator('.finance-calendar-month-head')).toBeHidden()
  await expect(page.locator('.finance-calendar-month-grid')).toBeHidden()
  await expect(agenda).toContainText('−$40.00')
  await expect(agenda).not.toContainText('Unassigned')
  await agenda.getByRole('button',{name:/Show earlier days/}).click()
  const past=agenda.locator(':scope > button').filter({hasText:'Earlier paycheck'})
  await expect(past).toContainText('Was scheduled')
  await expect(past).toContainText('+$777.00')
  await expect(past).toContainText('Past bank balance unavailable')
  await expect(past.locator('.finance-calendar-agenda-values')).toHaveCount(0)
  await agenda.getByRole('button',{name:/Hide earlier days/}).click()
  await agenda.scrollIntoViewIfNeeded()
  await page.screenshot({path:'test-results/iphone-cash-forecast-clarity.png',fullPage:true})
})

test('household meal calendar reviews portions, a la carte meals and cross-date swaps',async({page},testInfo)=>{
 const {MEAL_LIBRARY}=await import('../src/meals/mealLibrary.js')
 const {createRollingMealDay,resolveMealDay,rollingMealDates}=await import('../src/meals/mealPlanData.js')
 const prepared=[],writes=[]
 page.on('request',request=>{if(request.url().includes('action=prepare-direct'))prepared.push(request.postDataJSON());if(request.url().includes('action=execute'))writes.push(request)})
 await page.route('**/.netlify/functions/meal-plans?*',route=>{const url=new URL(route.request().url()),start=url.searchParams.get('startDate')||dateKey(),count=Number(url.searchParams.get('count')||7);return route.fulfill({json:{startDate:start,scheduleVersion:3,library:MEAL_LIBRARY,libraryVersion:0,days:rollingMealDates(start,count).map(date=>resolveMealDay(createRollingMealDay(date)))}})})
 await page.route('**/.netlify/functions/meal-nutrition',route=>route.fulfill({json:{nutrition:{yieldQuantity:1,perServingMacros:{calories:500,proteinGrams:45,carbohydrateGrams:40,fatGrams:20},warnings:[]}}}))
 await page.getByRole('button',{name:'Open Meal Plan',exact:true}).click()
 await page.getByRole('button',{name:'Month Plan',exact:true}).click()
 await page.getByLabel('Select month').fill('2026-11')
 await expect(page.locator('.meal-calendar-day')).toHaveCount(30)
 const first=page.locator('.meal-calendar-day').first()
 await first.getByRole('button',{name:'Customize',exact:true}).first().click()
 const editor=page.getByRole('dialog',{name:'Customize this meal'})
 await expect(editor.getByLabel('People eating')).toHaveValue('6')
 await editor.getByLabel('People eating').fill('4')
 const review=editor.getByRole('button',{name:'Review changes',exact:true})
 await expect(review).toBeInViewport({ratio:1})
 await review.click()
 await expect(page.getByRole('dialog',{name:'Review proposed Brevity changes'})).toBeVisible()
 expect(JSON.parse(prepared.at(-1).operation.payload.commandJson)).toMatchObject({kind:'set',servings:4,date:'2026-11-01'})
 const cancelReview=async()=>{await page.getByRole('dialog',{name:'Review proposed Brevity changes'}).getByRole('button',{name:'Cancel',exact:true}).click();await page.getByRole('dialog',{name:'Brevity Assistant',exact:true}).getByRole('button',{name:'Close Brevity Assistant',exact:true}).click()}
 await cancelReview()
 await first.getByRole('button',{name:'Customize',exact:true}).first().click()
 await editor.getByRole('button',{name:'Build à la carte'}).click()
 await editor.getByRole('combobox',{name:'Component',exact:true}).selectOption({label:'Steak'})
 await editor.getByRole('button',{name:'Use component'}).click()
 await editor.getByRole('combobox',{name:'Component',exact:true}).selectOption({label:'Green beans'})
 await editor.getByRole('button',{name:'Use component'}).click()
 await editor.getByRole('combobox',{name:'Component',exact:true}).selectOption({label:'Sweet potato'})
 await editor.getByRole('button',{name:'Use component'}).click()
 await expect(review).toBeDisabled()
 await editor.getByRole('button',{name:'Calculate nutrition',exact:true}).click()
 await expect(review).toBeEnabled()
 await expect(review).toBeInViewport({ratio:1})
 await editor.screenshot({path:`test-results/meal-calendar-editor-${testInfo.project.name}.png`})
 await review.click()
 const custom=JSON.parse(prepared.at(-1).operation.payload.commandJson)
 expect(custom.recipe.ingredients).toEqual(['6 ounces cooked beef sirloin steak','1 cups cooked green beans','6 ounces cooked sweet potato'])
 expect(custom.servings).toBe(6)
 await cancelReview()
 const source=first.locator('.meal-calendar-slot').first(),target=page.locator('.meal-calendar-day').nth(3).locator('.meal-calendar-slot').nth(1)
 if(testInfo.project.name==='desktop-chromium')await source.locator('[draggable]').dragTo(target)
 else{await source.getByRole('button',{name:'Move',exact:true}).click();await target.getByRole('button',{name:'Place here'}).click()}
 await expect(page.getByRole('dialog',{name:'Review proposed Brevity changes'})).toBeVisible()
 expect(JSON.parse(prepared.at(-1).operation.payload.commandJson)).toEqual({kind:'move',date:'2026-11-01',slot:'breakfast',toDate:'2026-11-04',toSlot:'lunch'})
 expect(writes).toHaveLength(0)
})
